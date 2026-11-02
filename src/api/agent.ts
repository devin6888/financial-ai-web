import { ApiError, CHAT_TIMEOUT_MS, request } from './client'
import type { ChatResponse } from './types'
import type { StreamStage } from './chat'
import { parseJson, postStream, stringField } from './sseStream'
import type { SseFrame } from '@/utils/sse'

/**
 * 审批续跑与运行视图的接口层（2026-10-30 起只保留这两个能力）。
 *
 * 开新提问不再有独立端点：./chat 的 `askWithStream` 调 /api/chat/stream，
 * 后端两条链路阶段 14 就合并成同一张图了，于是删掉 `startAgent`（它指向的
 * /api/agent/runs/stream 已下线）——留着只会让人以为还有第二条执行路径。
 *
 * 这里仍然要认识的三个差异：
 * 1) stage.phase 是**节点 id**（understand / plan / retrieve / verify / rewrite / compute /
 *    answer / cite_check / respond_insufficient），不是 understanding / retrieving 那套；
 * 2) 中途可能发 approval 事件（人批），此时**还没有答案**，要调 resume 才继续；
 * 3) final 载荷是 AgentRunView（含 plan / evidence / steps），自 2026-10-29（ST14 P2）起
 *    额外带一个 `response` 字段：后端合成的标准 ChatResponse（facts / citations / trace 齐全），
 *    前端优先用它，不再从 evidence 硬拼引用。
 */

export interface AgentEvidence {
  chunkId: number
  documentId: number
  page: number | null
  sectionPath: string | null
  type: string | null
  score: number | null
}

export interface AgentStep {
  seq: number
  node: string
  status: 'OK' | 'FAILED' | 'SKIPPED' | string
  summary: string | null
  durationMs: number | null
}

export interface AgentRunView {
  runId: string
  status: 'RUNNING' | 'WAITING_APPROVAL' | 'DONE' | 'REJECTED' | 'FAILED' | string
  currentNode: string | null
  question: string
  plan: string[]
  decision: string | null
  decisionNote: string | null
  error: string | null
  answer: string | null
  warnings: string[]
  evidence: AgentEvidence[]
  steps: AgentStep[]
}

/** final 的载荷：运行视图 + 后端合成的标准响应（老后端没有 response，调用方要能回落）。 */
export interface AgentFinalView extends AgentRunView {
  response?: ChatResponse | null
}

export interface AgentHandlers {
  onStage?: (stage: StreamStage) => void
  onDelta?: (text: string) => void
  /** 停在 answer 之前等人批：payload 里有计划、证据与已跑步骤 */
  onApproval?: (view: AgentRunView) => void
  onFinal?: (view: AgentFinalView) => void
}

/** 提交人工决定（APPROVE / EDIT / REJECT）。EDIT 与 REJECT 必须带理由（后端强校验）。 */
export async function resumeAgent(
  runId: string,
  decision: 'APPROVE' | 'EDIT' | 'REJECT',
  note: string | null,
  handlers: AgentHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const body = { decision, note: note ?? '' }
  await postStream('/api/agent/runs/' + runId + '/resume', body, CHAT_TIMEOUT_MS, (frame) => handle(frame, handlers), signal)
}

/** 查询一次运行的完整状态（刷新页面后恢复用）。 */
export const getAgentRun = (runId: string) => request<AgentRunView>('/api/agent/runs/' + runId)

function handle(frame: SseFrame, handlers: AgentHandlers): boolean {
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
  if (frame.event === 'approval') {
    const view = parseJson(frame.data)
    if (view && typeof view === 'object') handlers.onApproval?.(view as AgentRunView)
    return true
  }
  if (frame.event === 'final') {
    handlers.onFinal?.(parseJson(frame.data) as AgentFinalView)
    return true
  }
  if (frame.event === 'error') {
    const data = parseJson(frame.data)
    // 与问答链路同一种错误类型：调用方只需要认识 ApiError
    throw new ApiError(0, stringField(data, 'code') ?? 'AGENT_ERROR', stringField(data, 'message') ?? '深度分析失败')
  }
  return false
}
