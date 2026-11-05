import { ApiError, CHAT_TIMEOUT_MS, request } from './client'
import type { ChatRequestBody, ChatResponse } from './types'
import { parseJson, postStream, stringField } from './sseStream'
import type { SseFrame } from '@/utils/sse'

/**
 * 提问（同步等待，非流式）。留着它有三个用处：流式不可用时的回落、
 * 单测/脚本里的一次性调用、以及「浏览器不支持 ReadableStream」的兜底。
 *
 * 超时给到 120 秒：后端要跑 QU（可能一次 LLM）→ 双路召回 → RRF → rerank → 生成，
 * 实测单轮 3~10 秒，复杂问题更久。用 15 秒默认值会在慢的时候误报失败。
 */
export const ask = (body: ChatRequestBody) =>
  request<ChatResponse>('/api/chat', { method: 'POST', body, timeoutMs: CHAT_TIMEOUT_MS })

/** meta 事件：证据在生成之前就已知，所以先发出来，前端可以先渲染证据骨架。 */
export interface StreamMeta {
  traceId: string
  scope: { kind: string; documentIds: number[] } | null
  evidence: Array<{
    no: number
    childChunkId: number
    documentId: number
    pageStart: number | null
    pageEnd: number | null
    docTitle: string | null
    sectionPath: string | null
    evidenceType: string | null
  }>
  contextTokens: number
}

/** stage 事件：后端在真正进入某一段时发的「正在做什么」，只带阶段名与计数，不带任何答案内容。 */
export interface StreamStage {
  /** 问答：understanding / retrieving / reranking / generating；深度分析：节点 id */
  phase: string
  /** 中文文案，前端直接用，不自己编（避免两边说法不一致） */
  label: string
  /** 计数类信息：{documents:N} / {candidates:N} / {evidence:N,contextTokens:N}，可能为空 */
  detail: Record<string, unknown> | null
}

/**
 * approval 事件（阶段 14 P4 起）：图停在「理解确认」前。
 *
 * 只带确认所需的最小集合（runId / plan / evidence / steps）——没有答案，因为还没生成。
 */
export interface StreamApproval {
  runId: string
  status: string
  plan: string[] | null
  evidence: unknown[] | null
  steps: unknown[] | null
  /** 阶段 22：为什么停 / 能点什么 / 系统理解成什么（老后端没有） */
  ambiguity?: {
    reasons?: string[]
    candidates?: { kind: string; value: string | number; label: string }[]
    understood?: Record<string, unknown>
  } | null
}

export interface StreamHandlers {
  /** 需要人确认（歧义时才会来）；后续用 resumeAgent(runId, ...) 继续同一条流 */
  onApproval?: (approval: StreamApproval) => void
  /** 阶段变化：每进入一段调一次（阶段 13 起，旧后端不会发） */
  onStage?: (stage: StreamStage) => void
  onMeta?: (meta: StreamMeta) => void
  /** 每个增量片段调用一次（可能是半个词、半个数字，前端只做拼接，不解析） */
  onDelta?: (text: string) => void
  /** 流结束：带完整 ChatResponse（含引用、warnings、trace），与同步接口逐字段一致 */
  onFinal?: (response: ChatResponse) => void
}

/**
 * 流式提问：POST /api/chat/stream，读 text/event-stream。
 *
 * 为什么用 fetch 而不是 EventSource：EventSource 不能带 Authorization 头，
 * 也不能发 POST body —— 我们的身份与请求体都在头和体里。
 *
 * 失败语义：HTTP 非 2xx 抛 ApiError（与同步接口一致）；流里出现 error 事件也抛 ApiError；
 * 流没发 final 就断开抛 STREAM_INCOMPLETE（调用方可以回落到同步接口）。
 */
export async function askStream(
  body: ChatRequestBody,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  await postStream('/api/chat/stream', body, CHAT_TIMEOUT_MS, (frame) => handleFrame(frame, handlers), signal)
}

/** 返回 true 表示这是终结帧（final / error）。 */
function handleFrame(frame: SseFrame, handlers: StreamHandlers): boolean {
  if (frame.event === 'stage') {
    const stage = parseJson(frame.data)
    if (stage && typeof stage === 'object') handlers.onStage?.(stage as StreamStage)
    return false
  }
  if (frame.event === 'delta') {
    const text = stringField(parseJson(frame.data), 'text')
    if (text) handlers.onDelta?.(text)
    return false
  }
  if (frame.event === 'meta') {
    const meta = parseJson(frame.data)
    if (meta && typeof meta === 'object') handlers.onMeta?.(meta as StreamMeta)
    return false
  }
  if (frame.event === 'approval') {
    const approval = parseJson(frame.data)
    if (approval && typeof approval === 'object') handlers.onApproval?.(approval as StreamApproval)
    return true
  }
  if (frame.event === 'final') {
    // P4 起 final 的载荷是「运行视图」，标准响应嵌在 response 里；老后端直接就是 ChatResponse
    const payload = parseJson(frame.data) as ChatResponse & { response?: ChatResponse | null }
    handlers.onFinal?.(payload.response ?? payload)
    return true
  }
  if (frame.event === 'error') {
    const data = parseJson(frame.data)
    throw new ApiError(0, stringField(data, 'code') ?? 'STREAM_ERROR', stringField(data, 'message') ?? '生成失败')
  }
  return false
}
