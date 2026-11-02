import { ref } from 'vue'
import { defineStore } from 'pinia'

import {
  createConversation,
  deleteConversation,
  listConversations,
  renameConversation,
} from '@/api/conversations'
import { describe } from '@/stores/session'
import type { ChatScope, ConversationView } from '@/api/types'

/**
 * 会话列表的状态（问答页左侧栏）。
 *
 * 只放「跨组件共享」的东西：列表本身与当前选中。消息流留在 ChatView 里 ——
 * 它跟路由参数强绑定，放进 store 反而要处理「切会话时旧请求晚到」的竞态。
 */
export const useConversationStore = defineStore('conversation', () => {
  const items = ref<ConversationView[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(limit = 50): Promise<void> {
    loading.value = true
    error.value = null
    try {
      items.value = await listConversations(limit)
    } catch (e) {
      error.value = describe(e)
    } finally {
      loading.value = false
    }
  }

  async function create(title: string | null, scope: ChatScope | null): Promise<number> {
    const created = await createConversation(title, scope)
    items.value = [created, ...items.value]
    return created.conversationId
  }

  async function rename(id: number, title: string): Promise<void> {
    const updated = await renameConversation(id, title)
    items.value = items.value.map((item) => (item.conversationId === id ? updated : item))
  }

  async function remove(id: number): Promise<void> {
    await deleteConversation(id)
    items.value = items.value.filter((item) => item.conversationId !== id)
  }

  /** 提问后把该会话提到顶部（后端按 updated_at 排序，本地同步一次省一个请求）。 */
  function touch(id: number, title?: string | null): void {
    const found = items.value.find((item) => item.conversationId === id)
    if (!found) {
      return
    }
    const updated: ConversationView = { ...found, title: title || found.title, updatedAt: new Date().toISOString() }
    items.value = [updated, ...items.value.filter((item) => item.conversationId !== id)]
  }

  return { items, loading, error, load, create, rename, remove, touch }
})
