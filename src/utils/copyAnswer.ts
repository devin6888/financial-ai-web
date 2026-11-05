import type { Citation, Fact } from '@/api/types'
import { factsToMarkdown } from './facts'

/**
 * 把答案原文整理成「可以直接粘到飞书 / GitHub / Notion 的 markdown」。
 *
 * 三个决定（计划 ST16 Task 4 §4.7）：
 * 1) **基底是后端原文，不从渲染块反序列化**。原文本来就是 markdown 子集（标题、表格、列表），
 *    重新序列化会丢表格列结构、丢模型写的细微空白，收益只有「修正不合规 markdown」——
 *    而那条路已经有提示词约束与解析降级兜着了。
 * 2) **编号归一化 + 文末引用附录**。`[E3]` 是站内编号，粘到外部就是死符号；
 *    直接删掉又丢了可回溯性。所以正文保留编号，文末列「E3 是哪份文件哪一页」。
 *    不重排编号：服务端已按首次出现顺序重排（契约 C7），前端再排一次会和页面角标对不上。
 * 3) **空白归一**：CRLF → LF、行尾空格去掉、连续空行压成一个、表格前后各留一个空行。
 * 4) **引用块与分隔线原样保留，但要给它们补空行**（阶段 17）：`> 注：…` 紧贴上一段时，
 *    markdown 会把它当上一段的续行（lazy continuation）而不渲染成引用块；`---` 紧贴上一段时
 *    更糟 —— 那会被解析成 setext 二级标题，整段话变成大标题。所以这两类行前后都强制断开。
 */

/** 与后端 C7 同口径：`[E5]` / `[ E5 ]` / `［E5］` 都算引用。 */
const CITE = /[[［]\s*E\s*(\d+)\s*[\]］]/g
const TABLE_LINE = /^\s*\|/
const QUOTE_LINE = /^\s*>/
const DIVIDER_LINE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/

/** 附录里一条引用的定位文案：文件名 · 页码 · 章节（chunk id）。 */
export function citationLine(no: number, citation: Citation): string {
  const parts: string[] = []
  if (citation.docTitle) parts.push(citation.docTitle)
  const page = pageRange(citation)
  if (page) parts.push(page)
  if (citation.sectionPath) parts.push(citation.sectionPath)
  const head = parts.length > 0 ? parts.join(' · ') : '证据 ' + no
  return '- [E' + no + '] ' + head + '（chunk ' + citation.childChunkId + '）'
}

function pageRange(citation: Citation): string {
  if (citation.pageStart == null) return ''
  if (citation.pageEnd == null || citation.pageEnd === citation.pageStart) {
    return '第 ' + citation.pageStart + ' 页'
  }
  return '第 ' + citation.pageStart + '-' + citation.pageEnd + ' 页'
}

/**
 * 生成要写进剪贴板的完整文本。
 *
 * @param answer   后端返回的答案原文（markdown 子集）
 * @param citations 本次答案的引用（编号 = 下标 + 1）
 * @param facts     数值事实表（`response.facts`）。页面上它是答案下方独立渲染的一张表，
 *                  不在 `answer` 里 —— 复制时若不带，粘出去就少了一整块内容。
 */
export function buildCopyText(
  answer: string | null | undefined,
  citations: Citation[],
  facts: readonly Fact[] = [],
): string {
  const raw = (answer ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!raw.trim()) return ''

  const used: number[] = []
  const withMarkers = raw.replace(CITE, (_match, digits: string) => {
    const no = Number(digits)
    if (!Number.isFinite(no) || no < 1 || no > citations.length) return ''
    if (!used.includes(no)) used.push(no)
    return '[E' + no + ']'
  })

  const body = normalizeWhitespace(withMarkers)
  if (!body) return ''

  // 数值表与引用附录是两块独立内容，顺序与页面一致：正文 → 数值 → 引用。
  // 标题都用 ###：答案骨架的分节也用 ###，两者同级，粘到外部文档里不会出现附录比正文更高一级。
  const sections = [body]

  const factTable = factsToMarkdown(facts)
  if (factTable) {
    sections.push('### 数值\n\n' + factTable)
  }

  const lines = used.slice().sort((a, b) => a - b).map((no) => citationLine(no, citations[no - 1] as Citation))
  if (lines.length > 0) {
    sections.push('### 引用\n\n' + lines.join('\n'))
  }

  if (sections.length === 1) return body
  return sections.join('\n\n---\n\n') + '\n'
}

/** 空白归一：去行尾空格、压缩连续空行、表格与引用块前后、分隔线前后各留一个空行。 */
export function normalizeWhitespace(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trimEnd())

  const out: string[] = []
  for (const line of lines) {
    if (line === '' && out[out.length - 1] === '') continue
    const isTable = TABLE_LINE.test(line)
    const isQuote = QUOTE_LINE.test(line)
    const isDivider = DIVIDER_LINE.test(line)
    const prev = out.length > 0 ? out[out.length - 1] ?? '' : ''
    // 表格紧贴段落时补一个空行：否则很多渲染器会把表格当成上一段的一部分；
    // 引用块与分隔线同理（分隔线紧贴段落会被当成 setext 标题）
    const needsGap =
      prev !== '' &&
      line !== '' &&
      ((isTable && !TABLE_LINE.test(prev)) ||
        (!isTable && TABLE_LINE.test(prev)) ||
        isDivider ||
        DIVIDER_LINE.test(prev) ||
        (isQuote && !QUOTE_LINE.test(prev)) ||
        (!isQuote && QUOTE_LINE.test(prev)))
    if (needsGap) {
      out.push('')
    }
    out.push(line)
  }

  return out.join('\n').replace(/^\n+/, '').replace(/\n+$/, '')
}
