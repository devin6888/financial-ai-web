import type { ChatResponse } from '@/api/types'
import type { AgentRunView } from '@/api/agent'
import type { StreamMeta, StreamStage } from '@/api/chat'

/** 首屏时延（前端本地计时，阶段 13 起；只用于诊断与演示，不参与任何判定）。 */
export interface StreamTimings {
  firstStageMs: number | null
  metaMs: number | null
  firstTokenMs: number | null
  totalMs: number | null
}

/** 消息流里的一条消息（前端本地结构，不对应后端表）。 */
export interface ChatMessage {
  /** 本地 id：后端 messageId 可能为 null（落库失败时只加警告），所以不能依赖它做 key。 */
  id: string
  role: 'USER' | 'ASSISTANT'
  text: string
  /** 只有 assistant 有：完整响应（引用、数值、trace、warnings）。 */
  response?: ChatResponse
  pending?: boolean
  /** 正在流式接收（答案已开始显示，但还没结束） */
  streaming?: boolean
  /** 当前阶段（stage 事件）；null 表示后端还没发（旧后端）或已结束 */
  stage?: StreamStage | null
  /** meta.evidence：证据候选全集，final 之前用来提前渲染证据条 */
  evidencePreview?: StreamMeta['evidence']
  timings?: StreamTimings
  /** 深度分析（LangGraph）这一轮的状态：计划、已跑节点、审批、最终答案 */
  agent?: AgentRunView
  /** 正在提交审批决定（按钮禁用，防止重复 resume） */
  agentBusy?: boolean
  error?: string
  at: string
}
