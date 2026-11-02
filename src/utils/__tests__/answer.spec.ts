import { describe, expect, it } from 'vitest'

import { inlineSegments, parseAnswer } from '../answer'

/**
 * 渲染器的 6 条关键行为（计划 Task 8）。
 * 都是纯函数断言，不挂 DOM —— 目的是把「哪些语法支持、哪些按原文显示」钉死。
 */
describe('parseAnswer', () => {
  it('把单个引用切成 cite 片段', () => {
    const blocks = parseAnswer('营业总收入 120.8 亿元 [E1]')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.segments).toEqual([
      { kind: 'text', text: '营业总收入 120.8 亿元 ' },
      { kind: 'cite', number: 1 },
    ])
  })

  it('相邻引用 [E1][E3] 切成两个 chip', () => {
    const cites = inlineSegments('[E1][E3]').filter((s) => s.kind === 'cite')
    expect(cites).toEqual([
      { kind: 'cite', number: 1 },
      { kind: 'cite', number: 3 },
    ])
  })

  it('粗体优先于引用切分，且 ** 包住引用时不吃掉引用', () => {
    expect(inlineSegments('**结论**：120.8 亿元 [E2]')).toEqual([
      { kind: 'bold', text: '结论' },
      { kind: 'text', text: '：120.8 亿元 ' },
      { kind: 'cite', number: 2 },
    ])
  })

  it('未闭合的 ** 按原文显示', () => {
    expect(inlineSegments('未闭合 ** 粗体')).toEqual([{ kind: 'text', text: '未闭合 ** 粗体' }])
  })

  it('列表：相邻同类行合并成一个块，- 与 1. 分成两块', () => {
    const blocks = parseAnswer('- 第一项\n- 第二项\n1. 有序项')
    expect(blocks.map((b) => b.kind)).toEqual(['bullet', 'ordered'])
    expect(blocks[0]?.items).toEqual([
      [{ kind: 'text', text: '第一项' }],
      [{ kind: 'text', text: '第二项' }],
    ])
    expect(blocks[1]?.items).toEqual([[{ kind: 'text', text: '有序项' }]])
  })

  it('HTML 标签按纯文本保留（渲染层永远不 innerHTML，所以这不是转义而是不解析）', () => {
    const blocks = parseAnswer('<img src=x onerror=alert(1)>')
    expect(blocks[0]?.segments).toEqual([{ kind: 'text', text: '<img src=x onerror=alert(1)>' }])
  })

  it('空答案得到空块数组', () => {
    expect(parseAnswer('')).toEqual([])
    expect(parseAnswer(null)).toEqual([])
  })
})

/**
 * 表格与小标题（ST16 Task 4）。表格是「流式生成」里最容易出问题的一种块：
 * 半张表、列数不齐、单元格里有转义管道，任何一种都不能抛异常或渲染成乱码。
 */
describe('parseAnswer：表格与小标题', () => {
  const TABLE = ['| 指标 | 2025年 | 2024年 |', '| --- | --- | --- |', '| 营业总收入 | 160.68 亿 | 116.04 亿 |'].join('\n')

  it('表头行 + 分隔行 + 数据行 → 一个 table 块', () => {
    const blocks = parseAnswer(TABLE)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.kind).toBe('table')
    expect(blocks[0]?.header).toHaveLength(3)
    expect(blocks[0]?.rows).toHaveLength(1)
    expect(blocks[0]?.header?.[0]).toEqual([{ kind: 'text', text: '指标' }])
    expect(blocks[0]?.rows?.[0]?.[1]).toEqual([{ kind: 'text', text: '160.68 亿' }])
  })

  it('只有表头没有分隔行 → 按段落显示，不产出空表', () => {
    const blocks = parseAnswer('| 指标 | 2025年 |')
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph'])
  })

  it('单元格里的 \\| 是转义，不是列分隔符', () => {
    const blocks = parseAnswer(['| 项目 | 值 |', '| --- | --- |', '| A \\| B | 1 |'].join('\n'))
    expect(blocks[0]?.rows?.[0]?.[0]).toEqual([{ kind: 'text', text: 'A | B' }])
  })

  it('表内引用切成 chip（表格里也要能点）', () => {
    const blocks = parseAnswer(['| 指标 | 值 |', '| --- | --- |', '| 营业总收入 [E2] | 160.68 亿 |'].join('\n'))
    expect(blocks[0]?.rows?.[0]?.[0]).toEqual([
      { kind: 'text', text: '营业总收入 ' },
      { kind: 'cite', number: 2 },
    ])
  })

  it('表头粗体照常解析', () => {
    const blocks = parseAnswer(['| **指标** | 值 |', '| --- | --- |', '| 收入 | 1 |'].join('\n'))
    expect(blocks[0]?.header?.[0]).toEqual([{ kind: 'bold', text: '指标' }])
  })

  it('空单元格保留为空片段数组（不是 undefined）', () => {
    const blocks = parseAnswer(['| A | B | C |', '| --- | --- | --- |', '| 1 |  | 3 |'].join('\n'))
    expect(blocks[0]?.rows?.[0]).toEqual([
      [{ kind: 'text', text: '1' }],
      [],
      [{ kind: 'text', text: '3' }],
    ])
  })

  it('列数与表头不一致：多的丢、少的补空，不抛异常', () => {
    const blocks = parseAnswer(['| A | B |', '| --- | --- |', '| 1 | 2 | 3 |', '| 1 |'].join('\n'))
    expect(blocks[0]?.rows).toHaveLength(2)
    expect(blocks[0]?.rows?.[0]).toHaveLength(2)
    expect(blocks[0]?.rows?.[1]).toEqual([[{ kind: 'text', text: '1' }], []])
  })

  it('表格前后紧贴段落时切成三个块，顺序不乱', () => {
    const blocks = parseAnswer(['前言', TABLE, '后记'].join('\n'))
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'table', 'paragraph'])
    expect(blocks[2]?.segments).toEqual([{ kind: 'text', text: '后记' }])
  })

  it('### 是小标题，level 取 2~4，单个 # 不认', () => {
    expect(parseAnswer('## 结论')[0]).toMatchObject({ kind: 'heading', level: 2 })
    expect(parseAnswer('### 分行业')[0]).toMatchObject({ kind: 'heading', level: 3, segments: [{ kind: 'text', text: '分行业' }] })
    expect(parseAnswer('#### 太深')[0]).toMatchObject({ kind: 'heading', level: 4 })
    expect(parseAnswer('# 一级')[0]?.kind).toBe('paragraph')
  })
})

/**
 * 阶段 17（ST17 Task 3）新增的三种块：合并的列表、引用块（注段）、分隔线。
 * 这三样都是「答案版式」任务加进来的 —— 模型按新提示词写 ## 一节、> 注：、---，
 * 前端原来只认段落/列表/表格，会把这些符号原样吐到正文里。
 */
describe('parseAnswer：列表合并 / 引用块 / 分隔线', () => {
  it('模型把每条都写成「1. 」时合并成一个有序列表（编号由 ol 自己数）', () => {
    const blocks = parseAnswer('1. 一是\n1. 二是\n1. 三是')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.kind).toBe('ordered')
    expect(blocks[0]?.items?.map((item) => item[0])).toEqual([
      { kind: 'text', text: '一是' },
      { kind: 'text', text: '二是' },
      { kind: 'text', text: '三是' },
    ])
  })

  it('空行打断列表：同一个列表变成两块', () => {
    const blocks = parseAnswer('- 甲\n\n- 乙')
    expect(blocks.map((b) => b.kind)).toEqual(['bullet', 'bullet'])
    expect(blocks[1]?.items).toHaveLength(1)
  })

  it('列表后面接段落：段落不吞进列表项', () => {
    const blocks = parseAnswer('- 甲\n- 乙\n结论一段。')
    expect(blocks.map((b) => b.kind)).toEqual(['bullet', 'paragraph'])
    expect(blocks[0]?.items).toHaveLength(2)
    expect(blocks[1]?.segments).toEqual([{ kind: 'text', text: '结论一段。' }])
  })

  it('连续的 > 行合成一个引用块，行间保留换行', () => {
    const blocks = parseAnswer('> 注：口径为合并报表。\n> 数据来自 2025 年年报。')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.kind).toBe('quote')
    expect(blocks[0]?.segments).toEqual([
      { kind: 'text', text: '注：口径为合并报表。' },
      { kind: 'break' },
      { kind: 'text', text: '数据来自 2025 年年报。' },
    ])
  })

  it('引用块里的 [E1] 照样切成可点的 chip', () => {
    const blocks = parseAnswer('> 注：数据见年报 [E3]')
    expect(blocks[0]?.segments).toEqual([
      { kind: 'text', text: '注：数据见年报 ' },
      { kind: 'cite', number: 3 },
    ])
  })

  it('独占一行的 --- 是分隔线，不是段落也不是表格', () => {
    expect(parseAnswer('---').map((b) => b.kind)).toEqual(['divider'])
    expect(parseAnswer('段落\n---\n后记').map((b) => b.kind)).toEqual(['paragraph', 'divider', 'paragraph'])
  })

  it('表格里的 | --- | 分隔行不会被当成分隔线（表格仍然成立）', () => {
    const blocks = parseAnswer(['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n'))
    expect(blocks.map((b) => b.kind)).toEqual(['table'])
  })

  it('整篇骨架：结论段 → 三节 → 注段 → 分隔线 + 引用附录', () => {
    const answer = [
      '2025 年营业总收入 160.68 亿元 [E1]。',
      '## 一、总体情况',
      '同比增长 38.46%。',
      '> 注：口径为合并报表。',
      '---',
      '### 引用',
      '- [E1] 年报',
    ].join('\n')
    expect(parseAnswer(answer).map((b) => b.kind)).toEqual([
      'paragraph',
      'heading',
      'paragraph',
      'quote',
      'divider',
      'heading',
      'bullet',
    ])
  })
})
