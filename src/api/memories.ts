import { request } from './client'
import type { CreateMemoryRequest, CreateMemoryResponse, MemoryView } from './types'

export const listMemories = (type?: string | null) => {
  const path = type ? '/api/memories?type=' + encodeURIComponent(type) : '/api/memories'
  return request<MemoryView[]>(path)
}

/** 写一条长期记忆。同一 key 再写不同内容 → 旧行 SUPERSEDED、version+1（后端负责）。 */
export const createMemory = (body: CreateMemoryRequest) =>
  request<CreateMemoryResponse>('/api/memories', { method: 'POST', body })

export const deleteMemory = (id: number) =>
  request<void>('/api/memories/' + id, { method: 'DELETE' })
