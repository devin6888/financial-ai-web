import { ApiError, getToken } from './client'
import type { UploadResult } from './types'

/**
 * 上传 PDF。
 *
 * 为什么只有这一个接口用 XMLHttpRequest：浏览器的 fetch **不能**报告请求体上传进度
 * （没有 upload.onprogress 的等价物），而上传一份 5 MB 的年报时用户需要知道「还在传」。
 * 除上传外其余全部走 client.request()。
 *
 * 参数必须是 FormData：multipart 的 boundary 由浏览器生成，手写 Content-Type 会破坏它。
 */
export function uploadDocument(
  form: FormData,
  onProgress?: (ratio: number) => void,
  timeoutMs = 300_000,
): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/documents')
    xhr.timeout = timeoutMs
    xhr.responseType = 'text'

    const token = getToken()
    if (token) {
      xhr.setRequestHeader('Authorization', 'Bearer ' + token)
    }
    xhr.setRequestHeader('Accept', 'application/json')

    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total)
      }
    }

    xhr.onload = () => {
      const body = parse(xhr.responseText)
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as UploadResult)
        return
      }
      reject(new ApiError(xhr.status, field(body, 'error') ?? 'HTTP_' + xhr.status,
        field(body, 'message') ?? '上传失败'))
    }

    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', '上传失败：连不上后端'))
    xhr.ontimeout = () =>
      reject(new ApiError(0, 'TIMEOUT', '上传超时（超过 ' + Math.round(timeoutMs / 1000) + ' 秒）'))
    xhr.onabort = () => reject(new ApiError(0, 'ABORTED', '上传已取消'))

    xhr.send(form)
  })
}

function parse(text: string): unknown {
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return { message: text.slice(0, 200) }
  }
}

function field(body: unknown, name: string): string | undefined {
  if (body && typeof body === 'object' && name in body) {
    const value = (body as Record<string, unknown>)[name]
    return typeof value === 'string' ? value : undefined
  }
  return undefined
}
