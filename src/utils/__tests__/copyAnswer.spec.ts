import { describe, expect, it } from 'vitest'

import type { Citation, Fact } from '@/api/types'
import { buildCopyText, citationLine, normalizeWhitespace } from '../copyAnswer'

/**
 * 复制为 Markdown（ST16 Task 4 §4.7）。
 *
 * 这组断言的目的是钉死「复制出去的东西在别的工具里能不能用」：
 * 编号能查到出处、表格不散架、空白不乱。
 */
function cite(no: number, overrides: Partial<Citation> = {}): Citation {
  return {
    documentId: 7,
    parentChunkId: 7000,
    childChunkId: 7200 + no,
    pageStart: 10 + no,
    pageEnd: 10 + no,
    bbox: null,
    tableRef: null,
    evidenceType: 'TEXT',
    unit: null,
    scope: null,
    docTitle: '东方财富2025年年度报告',
    sectionPath: '第三节 管理层讨论与分析 § 一、经营情况讨论与分析',
    ...overrides,
  }
}

describe('buildCopyText', () => {
  it('没有引用时不追加附录', () => {
    const text = buildCopyText('2025年营业总收入为 160.68 亿元。', [])
    expect(text).toBe('2025年营业总收入为 160.68 亿元。')
    expect(text).not.toContain('### 引用')
  })

  it('把 [ E5 ] 与全角括号归一成 [E5]，并按首次出现排附录', () => {
    const text = buildCopyText('增长 38.46%[ E2 ]，收入 160.68 亿元［E1］，再看[E2]。', [cite(1), cite(2)])
    expect(text).toContain('[E2]')
    expect(text).toContain('[E1]')
    expect(text).not.toContain('[ E2 ]')
    const appendix = text.slice(text.indexOf('### 引用'))
    expect(appendix.indexOf('[E1]')).toBeLessThan(appendix.indexOf('[E2]'))
  })

  it('正文引了 citations 里没有的编号 → 角标删除，附录里也不出现', () => {
    const text = buildCopyText('收入 160.68 亿元[E1]，另有[E9]。', [cite(1)])
    expect(text).toContain('[E1]')
    expect(text).not.toContain('[E9]')
    expect(text.match(/\[E\d+\]/g)).toEqual(['[E1]', '[E1]'])
  })

  it('表格原样保留（不重新序列化），并在前后各留一个空行', () => {
    const answer = ['数据：', '| 指标 | 2025年 |', '| --- | --- |', '| 收入 | 160.68 亿 |', '口径：元'].join('\n')
    const text = buildCopyText(answer, [])
    expect(text).toContain('| --- | --- |')
    expect(text).toBe('数据：\n\n| 指标 | 2025年 |\n| --- | --- |\n| 收入 | 160.68 亿 |\n\n口径：元')
  })

  it('行尾空格去掉、连续空行压成一个、CRLF 归一', () => {
    const text = buildCopyText('第一段   \r\n\r\n\r\n第二段\t\r\n', [])
    expect(text).toBe('第一段\n\n第二段')
  })

  it('答案为空 → 空串（按钮据此不显示）', () => {
    expect(buildCopyText('', [cite(1)])).toBe('')
    expect(buildCopyText(null, [])).toBe('')
    expect(buildCopyText('   \n  ', [])).toBe('')
  })
})

describe('citationLine', () => {
  it('文件名 · 页码 · 章节（chunk id）', () => {
    expect(citationLine(1, cite(1))).toBe(
      '- [E1] 东方财富2025年年度报告 · 第 11 页 · 第三节 管理层讨论与分析 § 一、经营情况讨论与分析（chunk 7201）',
    )
  })

  it('页码区间与缺字段都能降级', () => {
    expect(citationLine(2, cite(2, { pageStart: 7, pageEnd: 9 }))).toContain('第 7-9 页')
    expect(citationLine(3, cite(3, { docTitle: null, sectionPath: null }))).toBe('- [E3] 第 13 页（chunk 7203）')
  })
})

describe('normalizeWhitespace', () => {
  it('不在表格周围塞多余空行（已经有空行时保持一个）', () => {
    const text = normalizeWhitespace('前言\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n后记')
    expect(text).toBe('前言\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n后记')
  })
})

/**
 * 阶段 17（ST17 Task 3）：答案版式加了「注段」与分隔线，复制出去必须还成立。
 * 这两类行最容易被 markdown 解析器误读：无空行时 `> ` 变成上一段续行、`---` 变成 setext 标题。
 */
describe('copyAnswer：引用块与分隔线（阶段 17）', () => {
  it('引用块紧贴上一段时补空行（否则 markdown 当续行）', () => {
    expect(normalizeWhitespace('结论：收入 160.68 亿元。\n> 注：口径为合并报表。')).toBe(
      '结论：收入 160.68 亿元。\n\n> 注：口径为合并报表。',
    )
  })

  it('分隔线前后补空行（否则上一段会被当成 setext 二级标题）', () => {
    expect(normalizeWhitespace('结论段。\n---\n后记')).toBe('结论段。\n\n---\n\n后记')
  })

  it('整篇：注段与分隔线原样保留，正文一条 --- 加附录一条', () => {
    const answer = ['结论段 [E1]。', '> 注：2025 年年报口径。', '---', '### 引用', '- [E1] 年报'].join('\n')
    const text = buildCopyText(answer, [cite(1)])
    expect(text).toContain('> 注：2025 年年报口径。')
    expect(text.indexOf('> 注：')).toBeGreaterThan(text.indexOf('结论段'))
    expect(text.match(/^---$/gm)).toHaveLength(2)
    expect(text).toContain('### 引用')
  })
})


/**
 * 数值表（2026-11-03）：页面上「数值」是答案下方独立渲染的一张表（来自 `response.facts`），
 * 不在 answer 原文里。复制时若不带，粘出去就整整少一块 —— 用户就是这么发现的。
 */
describe('copyAnswer：数值表', () => {
  const fact = (overrides: Partial<Fact> = {}): Fact => ({
    metric: '营业总收入',
    period: '2025年',
    value: '16,067,741,039.51',
    unit: '元',
    scope: '合并口径',
    evidence: '营业总收入 16,067,741,039.51',
    source: 'TEXT',
    ...overrides,
  })

  it('有 facts 时追加「### 数值」表，且排在引用附录之前', () => {
    const text = buildCopyText('营业总收入 160.68 亿元[E1]。', [cite(1)], [fact()])
    expect(text).toContain('### 数值')
    expect(text).toContain('| 指标 | 期间 | 数值 |')
    expect(text).toContain('| 营业总收入（合并口径） | 2025年 | 16,067,741,039.51 元 |')
    expect(text.indexOf('### 数值')).toBeLessThan(text.indexOf('### 引用'))
  })

  it('没有 facts 时不出现「### 数值」（老行为不变）', () => {
    expect(buildCopyText('一句话。', [])).toBe('一句话。')
    expect(buildCopyText('一句话。', [], [])).not.toContain('### 数值')
  })

  it('重复事实按页面同一规则去重：指标+期间+数值+单位+口径', () => {
    const text = buildCopyText('x[E1]', [cite(1)], [fact(), fact(), fact({ scope: '母公司口径' })])
    expect(text.match(/\| 营业总收入/g)).toHaveLength(2)
  })

  it('单元格里的竖线必须转义，否则整张表散架', () => {
    const text = buildCopyText('x', [], [fact({ metric: 'A|B', unit: null, scope: null })])
    expect(text).toContain('| A\\|B |')
  })
})
