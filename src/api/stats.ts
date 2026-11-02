import { request } from './client'

export interface RecentDocument {
  id: number
  title: string
  companyCode: string | null
  companyName: string | null
  docYear: number | null
  docType: string | null
  parseStatus: string
  chunkCount: number
}

export interface Stats {
  documents: number
  documentsByStatus: Record<string, number>
  companies: number
  activeParents: number
  activeChildren: number
  conversations: number
  memories: number
  recent: RecentDocument[]
}

export function fetchStats(): Promise<Stats> {
  return request<Stats>('/api/stats')
}