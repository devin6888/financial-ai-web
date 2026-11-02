import { request } from './client'

/**
 * 入库执行记录（阶段 19）。
 *
 * 后端返回的形状随状态变化，前端因此只有三条分支（见 IngestTimeline.vue）：
 * - RUNNING / FAILED：steps 是**完整模板**，没走到的步骤 status=PENDING；
 * - DONE：steps 为空，只有 summary —— 已完成的任务不展示中间步骤；
 * - NONE：阶段 19 之前的存量文档，没有任何记录。
 */

export type IngestRunState = 'RUNNING' | 'DONE' | 'FAILED' | 'NONE'

export type IngestStepStatus = 'RUNNING' | 'OK' | 'FAILED' | 'SKIPPED' | 'PENDING'

/** 一步：label 由后端给（中文文案只有一份），status 多一个 PENDING 表示「还没执行」。 */
export interface IngestStep {
  seq: number
  step: string
  label: string
  status: IngestStepStatus
  detail: string | null
  retry: number
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
}

/** 成功摘要：耗时按 steps 现算，块数/版本来自 run 的 summary_json。 */
export interface IngestSummary {
  pages?: number
  chunks?: number
  version?: number
  embedded?: number
  reused?: number
  resumed?: boolean
  totalMs?: number
  parseMs?: number
  chunkMs?: number
  embedMs?: number
}

export interface IngestView {
  state: IngestRunState
  attempt: number | null
  flow: 'PARSE' | 'REINDEX' | 'RESUME' | null
  currentStep: number
  totalSteps: number
  startedAt: string | null
  finishedAt: string | null
  error: string | null
  summary: IngestSummary
  steps: IngestStep[]
}

export const getIngest = (documentId: number) =>
  request<IngestView>('/api/documents/' + documentId + '/ingest')

export interface RetryResult {
  documentId: number
  parseStatus: string
  attempt: number
}

/** 只有 FAILED 的文档能重试，其它状态后端回 409 NOT_RETRYABLE。 */
export const retryIngest = (documentId: number) =>
  request<RetryResult>('/api/documents/' + documentId + '/retry', { method: 'POST' })
