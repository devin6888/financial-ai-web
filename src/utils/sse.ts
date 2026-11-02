export interface SseFrame {
  /** 事件名（后端用 meta / delta / final / error；没有 event 行时按 SSE 规范为 message） */
  event: string
  /** data 行的内容（多行 data 用换行拼接） */
  data: string
}

/**
 * 极简 SSE 解析器：只处理我们后端会发的那一小撮语法。
 *
 * 为什么自己写而不是装 eventsource：
 * 1) 原生 EventSource 不能带 Authorization 头（只能靠 cookie / 查询串），而我们是 Bearer token；
 * 2) 后端只用 event + data + 注释心跳，不需要 last-event-id / retry / 重连；
 * 3) 解析器是纯函数，能单测 —— 这是流式最容易出 bug 的一层（半帧、跨块、多行 data）。
 *
 * 标准要求：空行分帧；以冒号开头的行是注释（我们用做 ping 心跳）；
 * 只有一个冒号后的空格会被吃掉，其余空格是内容的一部分。
 */
export class SseParser {
  private buffer = ''
  private carry = ''

  /** 喂一段原始文本（已按 UTF-8 解码），返回这一段里凑齐的完整帧。 */
  push(chunk: string): SseFrame[] {
    let text = this.carry + chunk
    this.carry = ''
    // \r\n 可能被切在两块之间：末尾是 \r 就先扣住，等下一块再判断
    if (text.endsWith('\r')) {
      this.carry = '\r'
      text = text.slice(0, -1)
    }
    this.buffer += text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    const frames: SseFrame[] = []
    let index = this.buffer.indexOf('\n\n')
    while (index >= 0) {
      const frame = parseFrame(this.buffer.slice(0, index))
      if (frame) frames.push(frame)
      this.buffer = this.buffer.slice(index + 2)
      index = this.buffer.indexOf('\n\n')
    }
    return frames
  }

  /** 流结束时调用：最后一帧后面可能没有空行，不能丢。 */
  flush(): SseFrame[] {
    const rest = this.buffer
    this.buffer = ''
    const frame = parseFrame(rest)
    return frame ? [frame] : []
  }
}

function parseFrame(raw: string): SseFrame | null {
  if (!raw.trim()) return null
  let event = 'message'
  const data: string[] = []
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  if (data.length === 0) return null
  return { event, data: data.join('\n') }
}