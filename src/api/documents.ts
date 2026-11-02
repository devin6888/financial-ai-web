import { ApiError, apiUrl, getToken, request } from './client'
import type { ChunkBrief, DocumentDetail, DocumentRow, SelectableDocument } from './types'

export { uploadDocument } from './uploads'

/** 文档管理页：全部文档，含 PENDING / PARSING / FAILED。 */
export const listDocuments = (limit = 50) =>
  request<DocumentRow[]>('/api/documents?limit=' + limit)

/** 作用域下拉框：只有能检索的文档（DONE + 有 ACTIVE 块版本）。 */
export const listSelectableDocuments = () =>
  request<SelectableDocument[]>('/api/scope/documents')

export const getDocument = (id: number) => request<DocumentDetail>('/api/documents/' + id)

/** 一页原文的图（blob URL）与像素尺寸 —— 尺寸用来按百分比叠高亮框。 */
export interface PageImage {
  url: string
  width: number
  height: number
}

/**
 * 拉一页原文的 PNG。为什么要自己写 fetch 而不是 request()：
 * 1) request() 只会 JSON.parse，这里要 blob；
 * 2) 响应头 X-Page-Width / X-Page-Height 是渲染尺寸，不额外发一次元数据请求。
 *
 * 调用方负责在换页 / 卸载时 URL.revokeObjectURL，否则 blob 会一直留在内存里。
 */
export async function fetchPageImage(documentId: number, page: number, dpi = 150): Promise<PageImage> {
  const headers: Record<string, string> = { Accept: 'image/png' }
  const token = getToken()
  if (token) headers.Authorization = 'Bearer ' + token

  let response: Response
  try {
    response = await fetch(apiUrl('/api/documents/' + documentId + '/pages/' + page + '?dpi=' + dpi), {
      headers,
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new ApiError(0, 'NETWORK', '原文页加载失败（网络或超时）')
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      response.status === 404 ? 'PAGE_NOT_FOUND' : 'PAGE_FAILED',
      response.status === 404 ? '找不到这一页原文' : '原文页渲染失败',
    )
  }
  const blob = await response.blob()
  return {
    url: URL.createObjectURL(blob),
    width: Number(response.headers.get('X-Page-Width') ?? 0),
    height: Number(response.headers.get('X-Page-Height') ?? 0),
  }
}

/** 单块正文：正文角标悬浮卡用（2026-10-30 ST18 需求 5）。 */
export interface ChunkDetail {
  id: number
  documentId: number
  docTitle: string | null
  sectionPath: string | null
  title: string | null
  chunkType: string | null
  pageStart: number | null
  pageEnd: number | null
  tokenCount: number
  caption: string | null
  unit: string | null
  content: string
}

export const getChunk = (chunkId: number) => request<ChunkDetail>('/api/chunks/' + chunkId)

/** 切块可视化：当前 ACTIVE 版本的块（Parent 在前，Child 紧随其后）。 */
export const listChunks = (documentId: number, limit = 800, offset = 0) =>
  request<ChunkBrief[]>('/api/documents/' + documentId + '/chunks?limit=' + limit + '&offset=' + offset)
