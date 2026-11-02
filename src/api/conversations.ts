import { request } from './client'
import type {
  ChatScope,
  ContextPatch,
  ContextView,
  ConversationView,
  MessagesPage,
} from './types'

export const listConversations = (limit = 20) =>
  request<ConversationView[]>('/api/conversations?limit=' + limit)

export const createConversation = (title?: string | null, scope?: ChatScope | null) =>
  request<ConversationView>('/api/conversations', {
    method: 'POST',
    body: { title: title ?? null, scope: scope ?? null },
  })

export const getConversation = (id: number) =>
  request<ConversationView>('/api/conversations/' + id)

/** 改名。空标题后端返 400（不回落成「新会话」，见 ST10 §7 偏差 3）。 */
export const renameConversation = (id: number, title: string) =>
  request<ConversationView>('/api/conversations/' + id, { method: 'PATCH', body: { title } })

/** 逻辑删除（status=DELETED）；消息保留供审计。 */
export const deleteConversation = (id: number) =>
  request<void>('/api/conversations/' + id, { method: 'DELETE' })

/**
 * 消息分页：**最新在前**，游标是 beforeId（上一页最后一条的 messageId）。
 * 不用 offset：翻页期间会话还会追加新消息，offset 会重复或漏读。
 */
export const listMessages = (id: number, limit = 50, beforeId?: number | null) => {
  let path = '/api/conversations/' + id + '/messages?limit=' + limit
  if (beforeId) {
    path += '&beforeId=' + beforeId
  }
  return request<MessagesPage>(path)
}

export const getContext = (id: number) =>
  request<ContextView>('/api/conversations/' + id + '/context')

export const patchContext = (id: number, patch: ContextPatch) =>
  request<ContextView>('/api/conversations/' + id + '/context', { method: 'PATCH', body: patch })
