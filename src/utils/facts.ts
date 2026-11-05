import type { Fact } from '@/api/types'

/**
 * 同一条事实常常被多份证据各抽一次（同一张表在相邻块里重复出现），
 * 直接渲染会得到几行一模一样的结果，看起来像 bug。
 * 去重键：指标 + 期间 + 数值 + 单位 + 口径，保留首次出现的位置。
 *
 * 表格渲染与「复制为 Markdown」共用这一份规则 —— 两处各写一遍，
 * 页面上是 3 行、复制出去是 5 行，用户会以为是 bug。
 */
export function uniqueFacts(facts: readonly Fact[] | null | undefined): Fact[] {
  if (!facts || facts.length === 0) return []
  const seen = new Set<string>()
  const out: Fact[] = []
  for (const fact of facts) {
    const key = [fact.metric, fact.period, fact.value, fact.unit ?? '', fact.scope ?? ''].join('\u0001')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(fact)
  }
  return out
}

/** 单元格里的竖线会把 markdown 表格撑断，必须转义。 */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
}

/** 指标带口径时并进同一格：页面上是小字副标题，复制出去只能是括号。 */
function metricCell(fact: Fact): string {
  const metric = fact.metric ?? ''
  return fact.scope ? cell(metric) + '（' + cell(fact.scope) + '）' : cell(metric)
}

function valueCell(fact: Fact): string {
  const value = cell(fact.value ?? '')
  return fact.unit ? value + ' ' + cell(fact.unit) : value
}

/**
 * 把数值事实渲染成 markdown 表格（供复制用）。没有事实时返回空串。
 *
 * 不做任何换算或四舍五入：`value` 是 PDF 原文里的字符串（契约 C20），
 * 前端一旦「顺手格式化」，复制出去的数字就对不上原文了。
 */
export function factsToMarkdown(facts: readonly Fact[] | null | undefined): string {
  const rows = uniqueFacts(facts)
  if (rows.length === 0) return ''
  const lines = ['| 指标 | 期间 | 数值 |', '| --- | --- | --- |']
  for (const fact of rows) {
    lines.push('| ' + metricCell(fact) + ' | ' + cell(fact.period ?? '') + ' | ' + valueCell(fact) + ' |')
  }
  return lines.join('\n')
}
