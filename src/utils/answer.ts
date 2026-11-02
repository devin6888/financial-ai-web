/**
 * 答案文本的极简渲染器（计划 §2.6.2：不引入 marked / DOMPurify）。
 *
 * 为什么自己写而不是上 markdown 库：
 * 1) answer 里逐字包含 PDF 原文片段，走 markdown -> HTML -> v-html 这条路，等于把
 *    「第三方 PDF 里塞 <img onerror>」变成可执行脚本；本文件只产出**数据结构**，
 *    由 Vue 模板渲染成文本节点，结构上不可能 XSS。
 * 2) 引用 [E1] 本来就要切 token（它要变成可点击的 chip），既然要切，顺手支持
 *    换行 / 粗体 / 列表 / 小标题 / 表格只多几个分支。
 *
 * 支持（超出的一律按纯文本显示，不猜结构）：
 * - 段落：空行分隔；段内单换行 -> break
 * - 行首 - / * -> 无序列表；行首 1. 2. -> 有序列表（相邻同类行**合并成一个列表**，
 *   编号由 <ol> 自己数，这样模型写「1. 1. 1.」也不会显示成三个「1.」）
 * - 行首 > -> 引用块（答案最后一段的「注：」用这个形式，渲染成带竖线的块）
 * - 独占一行的 --- / *** / ___ -> 分隔线
 * - **粗体**（未闭合的 ** 原样显示）
 * - [E1] / [E12]（相邻写 [E1][E3] 会切成两个 chip）
 * - 二~四级小标题 `### 小标题`（单个 # 不认，避免把「#1 项」当标题）
 * - 管道表格：表头行 + 分隔行（| --- |）+ 数据行；缺分隔行时退化为段落
 *
 * 流式安全：每来一段新文本就整段重解析。半张表（还没收到分隔行）落在「当段落」分支，
 * 收到分隔行后自动变成表格，不需要额外状态。
 */

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'cite'; number: number }
  | { kind: 'break' }

export type BlockKind = 'paragraph' | 'bullet' | 'ordered' | 'heading' | 'table' | 'quote' | 'divider'

/**
 * 块。`segments` 对表格只是占位（空数组），表格内容在 `header` / `rows`：
 * 保持所有块都有 `segments`，调用方不用每处都判 kind。
 */
export interface Block {
  kind: BlockKind
  segments: Segment[]
  /** 仅 heading：2~4 */
  level?: 2 | 3 | 4
  /** 仅 table：表头，每个单元格是一组内联片段（所以表里也能点引用） */
  header?: Segment[][]
  /** 仅 table：数据行，每个单元格是一组内联片段；列数已按表头对齐 */
  rows?: Segment[][][]
  /**
   * 仅 bullet / ordered：合并后的列表项，每项是这一行的内联片段。
   *
   * 为什么是"合并"：模型的答案里每条都写「1. 」，一段一个列表 —— 渲染出来是多个 <ol>，
   * 每段都从 1 开始编号，粘贴到别处更是断成几段。合并成一个 <ol> 之后编号由浏览器数，
   * 模型写错编号也不影响显示。
   */
  items?: Segment[][]
}

const CITE = /\[E(\d+)\]/g
const BOLD = /\*\*([^*]+)\*\*/g
const ORDERED = /^\s*(\d+)\.\s+(.*)$/
const BULLET = /^\s*[-*]\s+(.*)$/
const HEADING = /^(#{2,4})\s+(\S.*)$/
const SEPARATOR_CELL = /^:?-{3,}:?$/
const QUOTE = /^\s*>\s?(.*)$/
const DIVIDER = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/

/** 把一段行内文本切成 text / bold / cite 三种片段。 */
export function inlineSegments(text: string): Segment[] {
  const segments: Segment[] = []
  let cursor = 0

  // 先切引用号，再在「纯文本片段」里切粗体：反过来的话 **见 [E1]** 会把引用吞进粗体
  for (const match of text.matchAll(CITE)) {
    const index = match.index ?? 0
    if (index > cursor) {
      segments.push(...boldSegments(text.slice(cursor, index)))
    }
    segments.push({ kind: 'cite', number: Number(match[1]) })
    cursor = index + match[0].length
  }
  if (cursor < text.length) {
    segments.push(...boldSegments(text.slice(cursor)))
  }
  return segments
}

function boldSegments(text: string): Segment[] {
  const segments: Segment[] = []
  let cursor = 0
  for (const match of text.matchAll(BOLD)) {
    const index = match.index ?? 0
    if (index > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, index) })
    }
    segments.push({ kind: 'bold', text: match[1] ?? '' })
    cursor = index + match[0].length
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', text: text.slice(cursor) })
  }
  return segments
}

/** 表格行判定：去掉首尾空白后以竖线开头（模型偶尔不带结尾竖线）。 */
function isTableLine(line: string): boolean {
  return line.trim().startsWith('|')
}

/** 按**未转义**的竖线切单元格，\| 还原成 | 后交给内联解析。 */
export function splitCells(line: string): string[] {
  const trimmed = line.trim()
  const cells: string[] = []
  let current = ''
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '\\' && trimmed[i + 1] === '|') {
      current += '|'
      i++
      continue
    }
    if (ch === '|') {
      cells.push(current)
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current)
  // 首尾竖线会切出空串，去掉它们（不是列）
  if (cells.length > 0 && cells[0]?.trim() === '') cells.shift()
  if (cells.length > 0 && cells[cells.length - 1]?.trim() === '') cells.pop()
  return cells.map((cell) => cell.trim())
}

/** 分隔行：每个单元格都是 | --- | / | :--: | 这种。 */
function isSeparatorLine(line: string): boolean {
  if (!isTableLine(line)) return false
  const cells = splitCells(line)
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL.test(cell))
}

/** 数据行列数按表头对齐：多的丢、少的补空（永远不因为列数不齐抛异常）。 */
function alignCells(cells: string[], width: number): string[] {
  if (cells.length === width) return cells
  const aligned = cells.slice(0, width)
  while (aligned.length < width) aligned.push('')
  return aligned
}

/** 把整段答案切成块（段落 / 无序 / 有序 / 小标题 / 表格）。 */
export function parseAnswer(answer: string | null | undefined): Block[] {
  const text = (answer ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks: Block[] = []
  const lines = text.split('\n')
  let paragraph: Segment[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', segments: paragraph })
      paragraph = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trimEnd()
    if (!line.trim()) {
      flushParagraph()
      continue
    }

    const heading = HEADING.exec(line.trim())
    if (heading) {
      flushParagraph()
      blocks.push({
        kind: 'heading',
        level: Math.min(heading[1]?.length ?? 2, 4) as 2 | 3 | 4,
        segments: inlineSegments(heading[2] ?? ''),
      })
      continue
    }

    // 表格：本行是管道行 + 下一行是分隔行才成立。
    // 只输出表头、还没收到分隔行时落到下面的段落分支，流式过程中不会闪出一张空表。
    if (isTableLine(line) && isSeparatorLine(lines[i + 1] ?? '')) {
      flushParagraph()
      const header = splitCells(line).map((cell) => inlineSegments(cell))
      const rows: Segment[][][] = []
      let j = i + 2
      while (j < lines.length && isTableLine(lines[j] ?? '') && !isSeparatorLine(lines[j] ?? '')) {
        rows.push(alignCells(splitCells(lines[j] ?? ''), header.length).map((cell) => inlineSegments(cell)))
        j++
      }
      blocks.push({ kind: 'table', segments: [], header, rows })
      i = j - 1
      continue
    }

    if (DIVIDER.test(line)) {
      flushParagraph()
      blocks.push({ kind: 'divider', segments: [] })
      continue
    }

    // 引用块：连续的 > 行合成一块（答案最后一段的「注：」就长这样）
    const quote = QUOTE.exec(line)
    if (quote) {
      flushParagraph()
      const segments: Segment[] = []
      let j = i
      let first = true
      while (j < lines.length) {
        const inner = QUOTE.exec((lines[j] ?? '').trimEnd())
        if (!inner) break
        if (!first) segments.push({ kind: 'break' })
        segments.push(...inlineSegments(inner[1] ?? ''))
        first = false
        j++
      }
      blocks.push({ kind: 'quote', segments })
      i = j - 1
      continue
    }

    const ordered = ORDERED.exec(line)
    const bullet = ordered ? null : BULLET.exec(line)
    if (ordered || bullet) {
      flushParagraph()
      const kind = ordered ? 'ordered' : 'bullet'
      const items: Segment[][] = []
      let j = i
      while (j < lines.length) {
        const row = (lines[j] ?? '').trim()
        const item = kind === 'ordered' ? ORDERED.exec(row) : BULLET.exec(row)
        if (!item) break
        // ordered 的第 1 组是编号，正文在第 2 组；bullet 没有编号
        items.push(inlineSegments((kind === 'ordered' ? item[2] : item[1]) ?? ''))
        j++
      }
      blocks.push({ kind, segments: [], items })
      i = j - 1
      continue
    }

    if (paragraph.length > 0) {
      paragraph.push({ kind: 'break' })
    }
    paragraph.push(...inlineSegments(line))
  }
  flushParagraph()
  return blocks
}
