import type { EvidenceType } from './api/types'

/**
 * 所有中文文案与「机器码 → 人话」的映射。
 *
 * 为什么集中在这里而不是散在组件里：
 * 1) 后端的 warnings 是机器码（query_inferred_from_context），直接显示等于把内部实现丢给用户；
 * 2) 同一句话在多个页面出现时，散着写必然出现两种措辞；
 * 3) 将来要英文界面，只改这一个文件。
 *
 * 代码来源：src/main/java 下所有 warnings.add("...") 的字面量（2026-10-28 统计），
 * 带参数的用前缀匹配。未收录的码原样显示，绝不吞掉 —— 看不见的警告等于没有警告。
 */

/** 精确匹配的警告码。 */
const WARNINGS: Record<string, string> = {
  query_inferred_from_context: '主语来自上文（公司或年份由会话上下文补全）',
  company_from_scope: '公司取自本轮范围（问题里没提公司名）',
  company_unresolved: '问题里的公司不在本轮范围内，已拒答',
  company_mention_ignored: '问题里提到的词不像公司名，已忽略',
  evidence_insufficient: '证据不足（模型判定无法支撑该问题）',
  partial_answer: '只答了能确认的部分（引用与事实仍然有效）',
  scope_acl_hidden: '部分文档因权限被排除',
  scope_acl_filtered_all: '本轮范围内的文档当前账号都不可读',
  scope_unauthorized: '部分文档无权限',
  scope_filter_empty_all_corpus: '筛选条件没有匹配到文档，已退回全库',
  scope_narrowed_caller_documents: '范围被收窄为调用方指定的文档',
  qu_failed: '查询理解降级（按规则解析）',
  qu_filter_empty_fallback: '筛选条件为空，按全库检索',
  qu_company_not_found: '问题里的公司代码不在库里（已放弃该过滤条件）',
  qu_company_out_of_scope: '问题里的公司不在本轮范围（已放弃该过滤条件）',
  qu_multi_company_no_filter: '问题涉及多家公司，未按公司过滤',
  qu_year_out_of_scope: '问题里的年份不在本轮范围（已放弃该过滤条件）',
  qu_year_range_no_filter: '问的是年份区间，未按年份过滤',
  qu_doc_type_out_of_scope: '报告类型不在本轮范围（已放弃该过滤条件）',
  no_candidates: '两路召回都没有候选',
  no_evidence_in_scope: '本轮范围内没有检索到证据',
  rerank_failed: '精排服务失败，已回退到融合结果',
  sparse_exact_empty_fallback: '关键词路无命中，已扩大为「任一关键词」匹配',
  summary_failed: '会话摘要生成失败（下一轮会重试）',
  memory_recall_failed: '长期记忆召回失败（不影响回答）',
  memory_write_failed: '长期记忆写入失败',
  conversation_persist_failed: '会话落库失败（本轮答案仍可用）',
  instruction_overflow: '长期偏好超出预算，已压缩但仍全部注入',
  context_truncated: '上下文超出预算，已有证据被截断',
  context_parent_missing: '有命中块找不到父块（整段展开被跳过）',
  citations_mostly_dropped: '大部分引用无效，已丢弃',
  answer_without_citation: '答案没有标注引用',
  NO_EVIDENCE_IN_SCOPE: '本轮范围内没有可用证据',
  answer_generation_failed: '答案生成失败',
  facts_truncated: '数值事实过多，已截断',
  fact_multi_doc_conflict: '同一指标在多份文档里数值不一致',
  fact_value_mismatch: '数值事实与证据不一致，已丢弃',
  answer_citations_dropped: '答案里的部分引用编号无效，已清理',
  answer_value_not_in_evidence: '答案里有数字在证据中找不到',
  context_inferred_ignored_company: '上下文里的公司与本轮问题冲突，未采用',
  context_inferred_ignored_documents: '上下文里的文档与本轮范围冲突，未采用',
  context_inferred_ignored_metric: '上下文里的指标与本轮问题冲突，未采用',
  context_inferred_ignored_years: '上下文里的年份与本轮问题冲突，未采用',
  market_live: '本轮含实时行情（数据时间见答案末尾）',
  market_unavailable: '行情服务暂时不可用，本轮只回答了年报部分',
  market_company_unresolved: '没能确定要查哪只股票的行情，本轮按年报处理',
  market_missing_as_of: '行情返回里没有数据时间，已按当前时间标注',
  market_partial: '年报里没找到相关证据，本轮只回答了实时行情那部分',
}

/** 带参数的警告码：前缀 → 说明生成器。 */
const PREFIXES: Array<[string, (rest: string) => string]> = [
  ['answer_ungrounded:', (rest) => '答案里有 ' + rest + ' 个数字在证据中找不到（已标注）'],
  ['citation_dropped:', (rest) => '引用了不存在的编号 ' + rest + '，已清理'],
  ['evidence_period_mismatch:', (rest) => '证据期间与问题不一致（' + rest + '）'],
  ['fact_year_missing:', (rest) => '有数值事实缺少年份（' + rest + '）'],
  ['fact_value_not_in_evidence:', (rest) => '有 ' + rest + ' 条数值事实在证据中找不到（已丢弃该条）'],
  ['scope_over_soft_limit_', (rest) => '选中的文档超过软上限（' + rest + ' 份）'],
  ['scope_not_retrievable_', (rest) => '有文档不可检索（id=' + rest + '）'],
  ['scope_unknown_document_', (rest) => '有文档不存在（id=' + rest + '）'],
  ['doc_quota_balanced_', (rest) => '文档配额做了均衡（' + rest + '）'],
]

/** 警告码 → 人话。未收录的码原样返回，避免「静默吞警告」。 */
export function labelForWarning(code: string): string {
  if (!code) {
    return ''
  }
  const exact = WARNINGS[code]
  if (exact) {
    return exact
  }
  for (const [prefix, describe] of PREFIXES) {
    if (code.startsWith(prefix)) {
      return describe(code.slice(prefix.length))
    }
  }
  return code
}

/** 文档解析状态 → 中文 + Element Plus 的 tag 类型。 */
export const PARSE_STATUS: Record<string, { text: string; type: 'success' | 'info' | 'warning' | 'danger' }> = {
  DONE: { text: '已就绪', type: 'success' },
  PENDING: { text: '排队中', type: 'info' },
  PARSING: { text: '解析中', type: 'warning' },
  RUNNING: { text: '解析中', type: 'warning' },
  FAILED: { text: '解析失败', type: 'danger' },
}

export const EVIDENCE_TYPE: Record<EvidenceType, string> = {
  TABLE: '表格',
  TEXT: '正文',
  NARRATIVE: '叙述',
}

/** A 股报告类型（后端只接受这四个值，见 DocumentUploadService）。 */
export const DOC_TYPES: Array<{ value: string; label: string }> = [
  { value: 'ANNUAL', label: '年报' },
  { value: 'SEMI_ANNUAL', label: '半年报' },
  { value: 'Q1', label: '一季报' },
  { value: 'Q3', label: '三季报' },
]

export const docTypeLabel = (value: string | null): string =>
  DOC_TYPES.find((item) => item.value === value)?.label ?? (value ?? '—')

/** 长期记忆的类型（与 V10 的 CHECK 一致）。 */
export const MEMORY_TYPES: Array<{ value: string; label: string }> = [
  { value: 'INSTRUCTION', label: '明确要求' },
  { value: 'CONTEXTUAL', label: '情境信息' },
  { value: 'WATCHLIST', label: '长期关注' },
]


/**
 * LangGraph 节点 → 中文名（深度分析时间线用）。
 *
 * 后端 stage.phase 直接给节点 id（ST11 §16.2），label 字段只用于顶部状态行：
 * 时间线要列「跑过哪些节点」，必须自己有一份能穷举的映射，否则多出来的节点没名字。
 */
export const NODE_LABELS: Record<string, string> = {
  understand: '理解问题',
  plan: '规划路径',
  retrieve: '检索证据',
  verify: '核对证据',
  approve: '确认理解',
  rewrite: '改写检索式',
  answer: '生成答案',
  cite_check: '校验引用',
  market: '查询实时行情',
  answer_market: '行情答案',
  respond_insufficient: '证据不足，拒答',
  approval: '人工审批',
}

export const AGENT_STATUS: Record<string, string> = {
  RUNNING: '分析中',
  WAITING_APPROVAL: '等待审批',
  DONE: '已完成',
  REJECTED: '已驳回',
  FAILED: '失败',
}

export function nodeLabel(node: string | null | undefined): string {
  if (!node) return ''
  return NODE_LABELS[node] ?? node
}
