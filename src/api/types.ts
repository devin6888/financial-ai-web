/**
 * 后端 record 的前端镜像。
 *
 * 规则（计划 §5 Task 1）：字段与后端一一对应，**不做「反正用不到」的省略，也不加可选的宽松字段**。
 * 少了字段会在编译期报错，而不是在界面上显示 undefined —— 后者只能靠肉眼发现。
 *
 * 来源：src/main/java 下的同名 record。改后端字段时这里必须同步改，否则 type-check 会拦住。
 * 时间一律是 ISO-8601 字符串（后端 OffsetDateTime.toString()），不是 Date 对象：
 * 传 Date 进 JSON 会变成 UTC，展示时容易差一天。
 */

export type ScopeKind = 'CORPUS' | 'DOCUMENTS' | 'FILTER'

export interface ScopeQuery {
  companyCodes: string[]
  years: number[]
  docTypes: string[]
  industries: string[]
}

export interface ChatScope {
  kind: ScopeKind
  documentIds: number[]
  query: ScopeQuery
}

/** 后端错误体的最小形状（各 Controller 的 @ExceptionHandler 返回它）。 */
export interface ApiErrorShape {
  error?: string
  message?: string
  warnings?: string[]
}

export interface Me {
  userId: number
  tenantId: number
  username: string
  displayName: string
  roles: string[]
}

export interface BBox {
  page: number
  x: number
  y: number
  w: number
  h: number
}

export interface TableRef {
  tableId: string | null
  rowStart: number | null
  rowEnd: number | null
}

export type EvidenceType = 'TABLE' | 'TEXT' | 'NARRATIVE'

/** 一条可反解析的引用。编号 [E1] 的 1 是 citations 数组下标 + 1。 */
export interface Citation {
  documentId: number
  parentChunkId: number | null
  childChunkId: number
  pageStart: number | null
  pageEnd: number | null
  bbox: BBox[] | null
  tableRef: TableRef | null
  evidenceType: EvidenceType
  unit: string | null
  scope: string | null
  docTitle: string | null
  sectionPath: string | null
}

/** 数值事实（一律来自 PDF 原文）。value 是原样字符串，不要在前端做四舍五入。 */
export interface Fact {
  metric: string
  period: string
  value: string
  unit: string | null
  scope: string | null
  evidence: string
  source: string
}

export type QueryType = 'EXACT_FACT' | 'SEMANTIC_EXPLANATION' | 'COMPARISON' | 'COMPLEX_ANALYSIS'
export type RerankStatus = 'APPLIED' | 'SKIPPED' | 'FAILED'

export interface RetrievalTrace {
  query: string
  queryType: QueryType | null
  quRoute: string
  quDegraded: boolean
  denseHits: number
  sparseHits: number
  fusedCount: number
  returned: number
  rerankStatus: RerankStatus
  rerankModel: string | null
  denseMs: number
  sparseMs: number
  fuseMs: number
  rerankMs: number
  warnings: string[]
}

export interface ScopeTrace {
  kind: ScopeKind
  documentIds: number[]
  resolverVersion: string
  effectiveReason: string
  docRoutingAvailable: boolean
}

export interface MemoryTrace {
  shortTermMessages: number
  shortTermDropped: number
  summaryChars: number
  longTermItems: number
  gateHit: boolean
}

export interface ChatTrace {
  traceId: string
  retrieval: RetrievalTrace | null
  scope: ScopeTrace | null
  memory: MemoryTrace
  contextBlocks: number
  contextTokens: number
  citationsEmitted: number
  citationsDropped: number
  contextMs: number
  answerMs: number
  warnings: string[]
}

export interface SessionScope {
  kind: ScopeKind
  documentIds: number[]
}

export interface EffectiveScope {
  kind: ScopeKind
  documentIds: number[]
  reason: string
}

export interface ScopeInfo {
  session: SessionScope
  effective: EffectiveScope
  resolvedDocumentIds: number[]
  resolverVersion: string
}

export interface ExtensionSuggestion {
  documentIds: number[]
  reason: string
}

/** POST /api/chat 响应。sufficient=false 也是 200：那是业务结果，不是故障。 */
export interface ChatResponse {
  sufficient: boolean
  answer: string
  facts: Fact[]
  citations: Citation[]
  confidence: string | null
  note: string | null
  scope: ScopeInfo | null
  warnings: string[]
  trace: ChatTrace | null
  extensionSuggested: ExtensionSuggestion | null
  conversationId: number | null
  messageId: number | null
}

export interface ChatRequestBody {
  question: string
  scope?: ChatScope | null
  extensionPolicy?: string | null
  conversationId?: number | null
}

export interface ConversationView {
  conversationId: number
  title: string
  status: string
  scope: ChatScope
  createdAt: string
  updatedAt: string
}

export interface MessageView {
  messageId: number
  role: 'USER' | 'ASSISTANT'
  content: string
  citations: Citation[]
  createdAt: string
}

export interface MessagesPage {
  conversationId: number
  messages: MessageView[]
  nextBeforeId: number | null
}

export interface ContextView {
  conversationId: number
  companyId: number | null
  companyCode: string | null
  companyName: string | null
  yearFrom: number | null
  yearTo: number | null
  documentIds: number[]
  currentMetric: string | null
  updatedAt: string | null
}

export interface ContextPatch {
  companyId?: number | null
  yearFrom?: number | null
  yearTo?: number | null
  documentIds?: number[]
  currentMetric?: string | null
  clear?: boolean
}

export interface MemoryView {
  id: number
  type: string
  key: string
  content: string
  importance: number
  version: number
  status: string
  sourceType: string | null
  expiresAt: string | null
  updatedAt: string
}

export interface CreateMemoryRequest {
  type: string
  key: string
  content: string
  importance?: number
  expiresAt?: string | null
}

export interface CreateMemoryResponse {
  id: number
  type: string
  key: string
  version: number
  status: string
}

/** 下拉框用：只含「能检索」的文档（DONE + 有 ACTIVE 块版本）。 */
export interface SelectableDocument {
  id: number
  title: string
  companyCode: string | null
  companyName: string | null
  docYear: number | null
  docType: string | null
  pageCount: number | null
  chunkCount: number
}

/** 文档管理页用：含 PENDING / PARSING / FAILED。 */
export interface DocumentRow {
  id: number
  title: string
  companyCode: string | null
  companyName: string | null
  docYear: number | null
  docType: string | null
  parseStatus: string
  pagesParsed: number | null
  parseError: string | null
  activeChunkVersion: number | null
  chunkCount: number
  createdAt: string | null
  /** 解析入库总进度 0~100（阶段检查点口径，不是页级百分比）；失败时保留最后值 */
  parseProgress: number
  /** 当前阶段文案：排队中 / 提交解析作业 / 解析中 / 解析完成 / 切块中 / 切块完成 / 向量化 x/y / 已完成 / 失败 */
  progressStage: string | null
}

export interface DocumentDetail {
  id: number
  parseStatus: string
  activeChunkVersion: number | null
  title: string
  pagesParsed: number | null
  parseError: string | null
  parsedObjectKey: string | null
  parser: string | null
  parserVersion: string | null
  docYear: number | null
  docType: string | null
  companyCode: string | null
  companyName: string | null
  parseProgress: number
  progressStage: string | null
}

export interface UploadResult {
  documentId: number
  parseStatus: string
}

/** 切块可视化的一行（后端 ChunkRepository.ChunkBrief）。preview 只有前 220 字。 */
export interface ChunkBrief {
  id: number
  parentId: number | null
  chunkLevel: 'PARENT' | 'CHILD'
  chunkType: EvidenceType
  sectionPath: string | null
  title: string | null
  pageStart: number | null
  pageEnd: number | null
  tokenCount: number
  chunkIndex: number
  bboxJson: string | null
  preview: string
  contentLength: number
}
