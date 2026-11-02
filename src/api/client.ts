import type { ApiErrorShape } from './types'

/**
 * 统一 HTTP 客户端：原生 fetch，不引入 axios（计划 §2.6.1）。
 *
 * 为什么值得自己写这 60 行而不是装 axios：
 * 1) 全部同源（生产同端口 + 开发走 Vite proxy），没有 CORS / cookie / CSRF 要处理；
 * 2) 后端的错误体是自定义的 { error, message, warnings }，axios 的 error.response.data
 *    只是换了名字，归一化照样要手写；
 * 3) 超时用 AbortSignal.timeout，浏览器原生支持。
 *
 * 上传是唯一例外（fetch 不能报告请求体进度），见 uploads.ts。
 */

export const TOKEN_KEY = 'finagent.token'
export const DEFAULT_TIMEOUT_MS = 15_000
/** 问答要跑 QU + 检索 + rerank + 生成，15 秒不够（e2e 实测单轮 3~10 秒，长问题更久）。 */
export const CHAT_TIMEOUT_MS = 120_000

const BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

/** 后端的错误体形状（见各 Controller 的 @ExceptionHandler）。 */
export type ApiErrorBody = ApiErrorShape

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly warnings: string[]

  constructor(status: number, code: string, message: string, warnings: string[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.warnings = warnings
  }

  /** 401：token 缺失或无效 —— 必须回登录页，重试没有意义。 */
  get isUnauthorized(): boolean {
    return this.status === 401
  }

  /**
   * SCOPE_EMPTY：选的范围里没有可检索文档 —— 换问法没用，要改范围。
   *
   * 不按 status 判：SSE 的头已经发出去之后改不了 HTTP 状态码，agent 链路是用
   * error 事件（status=0）+ code=SCOPE_EMPTY 承载同一个语义的（契约 C17 §17.7）。
   */
  get isScopeEmpty(): boolean {
    return this.code === 'SCOPE_EMPTY'
  }

  /** 404：会话/文档不存在或不属于当前用户。 */
  get isNotFound(): boolean {
    return this.status === 404
  }

  /**
   * 超时与网络不可达（status=0）。
   *
   * 必须连 code 一起判：流里后端主动发的业务错误也是 status=0（SSE 改不了状态码），
   * 把它们当传输错误会触发「回落同步接口」，等于对同一个错误连问两遍。
   */
  get isTransport(): boolean {
    return this.status === 0
      && (this.code === 'NETWORK' || this.code === 'STREAM_INCOMPLETE' || this.code === 'NO_STREAM')
  }
}

/** 拼接完整 URL：流式请求自己写 fetch，需要和 request() 共用同一套 base。 */
export function apiUrl(path: string): string {
  return BASE + path
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token && token.trim()) {
    localStorage.setItem(TOKEN_KEY, token.trim())
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

/** 401 时广播：session store 监听后清 token 并跳登录页（一处触发，多处响应）。 */
export const UNAUTHORIZED_EVENT = 'finagent:unauthorized'

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = getToken()
  if (token) {
    headers.Authorization = 'Bearer ' + token
  }

  let payload: string | undefined
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(BASE + path, {
      method,
      headers,
      body: payload,
      signal: combineSignals(timeoutMs, options.signal),
    })
  } catch (error) {
    throw toTransportError(error, timeoutMs)
  }

  const text = await response.text()
  const body = parseBody(text)

  if (!response.ok) {
    if (response.status === 401) {
      notifyUnauthorized()
    }
    throw new ApiError(
      response.status,
      stringField(body, 'error') ?? 'HTTP_' + response.status,
      stringField(body, 'message') ?? (response.statusText || '请求失败'),
      arrayField(body, 'warnings'),
    )
  }

  return body as T
}

/** 组装超时信号与调用方自己的取消信号（AbortSignal.any 需要 Chrome 116+ / Node 20+）。 */
function combineSignals(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  if (!external) {
    return timeout
  }
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([timeout, external])
  }
  // 老浏览器兜底：只保留调用方的取消能力，超时退回我们自己计时
  return external
}

function parseBody(text: string): unknown {
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    // 后端异常时可能返回 HTML 错误页 —— 截断原文，别把整页 HTML 塞进提示
    return { message: text.slice(0, 200) }
  }
}

function stringField(body: unknown, name: string): string | undefined {
  if (body && typeof body === 'object' && name in body) {
    const value = (body as Record<string, unknown>)[name]
    return typeof value === 'string' ? value : undefined
  }
  return undefined
}

function arrayField(body: unknown, name: string): string[] {
  if (body && typeof body === 'object' && name in body) {
    const value = (body as Record<string, unknown>)[name]
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === 'string')
    }
  }
  return []
}

function toTransportError(error: unknown, timeoutMs: number): ApiError {
  const name = (error as { name?: string } | null)?.name
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new ApiError(0, 'TIMEOUT', '请求超时（超过 ' + Math.round(timeoutMs / 1000) + ' 秒）')
  }
  return new ApiError(0, 'NETWORK', '连不上后端（确认 8080 端口已启动，或 Vite 代理已生效）')
}

/** 401 时广播 —— 流式请求不走 request()，要自己调这个才有一致的登出行为。 */
export function notifyUnauthorized(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
  }
}
