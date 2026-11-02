import { ApiError, apiUrl, getToken, notifyUnauthorized } from './client'
import { SseParser, type SseFrame } from '@/utils/sse'

/**
 * 发一个 POST 请求，把响应当成 text/event-stream 一帧一帧读出来。
 *
 * 为什么抽出来：问答（/api/chat/stream）与深度分析（/api/agent/runs/stream）走的是
 * 同一套传输语义 —— Bearer 头、超时、半帧拼接、断流判定都一样，只有「事件怎么解释」不同。
 * 解释留在各自的 api 文件里，传输留在这里。
 *
 * onFrame 返回 true 表示收到终结帧（final / 业务上等价于结束的事件），
 * 此时立刻停止读取；流读完仍没终结帧则抛 STREAM_INCOMPLETE，调用方可以回落同步接口。
 */
export async function postStream(
  path: string,
  body: unknown,
  timeoutMs: number,
  onFrame: (frame: SseFrame) => boolean,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  }
  const token = getToken()
  if (token) headers.Authorization = 'Bearer ' + token

  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([timeout, signal])
    : timeout

  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(body ?? {}),
      signal: combined,
    })
  } catch (e) {
    // 把原始原因挂在 message 里：控制台看到的是真实异常，而不是被吞成一句提示
    const reason = e instanceof Error ? e.message : String(e)
    throw new ApiError(0, 'NETWORK', '连不上后端（确认 8080 端口已启动，或 Vite 代理已生效）：' + reason)
  }

  if (!response.ok) {
    const text = await response.text()
    const parsed = parseJson(text)
    if (response.status === 401) notifyUnauthorized()
    throw new ApiError(
      response.status,
      stringField(parsed, 'error') ?? 'HTTP_' + response.status,
      stringField(parsed, 'message') ?? (response.statusText || '请求失败'),
      [],
    )
  }
  if (!response.body) {
    throw new ApiError(0, 'NO_STREAM', '当前浏览器不支持流式读取响应')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const parser = new SseParser()
  let finished = false

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
        if (onFrame(frame)) finished = true
      }
    }
    const tail = decoder.decode()
    const rest = tail ? parser.push(tail) : []
    for (const frame of [...rest, ...parser.flush()]) {
      if (onFrame(frame)) finished = true
    }
  } finally {
    reader.releaseLock()
  }

  if (!finished) {
    throw new ApiError(0, 'STREAM_INCOMPLETE', '流式响应中断了（后端没发最终结果就断开）')
  }
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function stringField(body: unknown, name: string): string | undefined {
  if (body && typeof body === 'object' && name in body) {
    const value = (body as Record<string, unknown>)[name]
    return typeof value === 'string' ? value : undefined
  }
  return undefined
}
