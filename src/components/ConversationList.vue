<script setup lang="ts">
import { computed } from 'vue'
import type { ConversationView } from '@/api/types'

const props = defineProps<{ items: ConversationView[]; currentId: number | null; loading: boolean }>()
const emit = defineEmits<{
  select: [id: number]
  create: []
  rename: [id: number, title: string]
  remove: [id: number]
}>()

interface Group { label: string; items: ConversationView[] }

function dayKey(value: string): string {
  const date = new Date(value)
  const today = new Date()
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = (startOf(today) - startOf(date)) / 86400000
  if (diff <= 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff < 7) return '本周'
  return '更早'
}

const groups = computed<Group[]>(() => {
  const order = ['今天', '昨天', '本周', '更早']
  const bucket = new Map<string, ConversationView[]>()
  for (const item of props.items) {
    const key = dayKey(item.updatedAt)
    const list = bucket.get(key) ?? []
    list.push(item)
    bucket.set(key, list)
  }
  return order.filter((key) => bucket.has(key)).map((key) => ({ label: key, items: bucket.get(key) ?? [] }))
})

function clock(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : pad(d.getMonth() + 1) + '/' + pad(d.getDate())
}

function scopeLabel(item: ConversationView): string {
  const scope = item.scope
  if (!scope || scope.kind === 'CORPUS') return '全库'
  if (scope.kind === 'DOCUMENTS') return scope.documentIds.length + ' 份文档'
  return '条件范围'
}

async function rename(item: ConversationView): Promise<void> {
  try {
    const result = await ElMessageBox.prompt('新的会话标题', '重命名', {
      inputValue: item.title,
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValidator: (value: string) => (value && value.trim() ? true : '标题不能为空'),
    })
    const title = String((result as { value?: string }).value ?? '').trim()
    if (title) emit('rename', item.conversationId, title)
  } catch {
    // 取消：不做任何事
  }
}

async function remove(item: ConversationView): Promise<void> {
  try {
    await ElMessageBox.confirm('删除后不可恢复（逻辑删除，数据仍留痕）', '删除会话「' + item.title + '」', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    emit('remove', item.conversationId)
  } catch {
    // 取消
  }
}
</script>

<template>
  <aside class="conv-pane" aria-label="会话列表">
    <div class="pane-head">
      <div>
        <div class="fa-eyebrow">CONVERSATIONS</div>
        <div class="pane-title">会话 <span class="fa-num count">{{ items.length }}</span></div>
      </div>
      <button class="fa-icon-btn" title="新建会话" aria-label="新建会话" @click="emit('create')">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>

    <div class="fa-scroll list">
      <div v-if="loading && !items.length" class="loading">
        <div v-for="i in 5" :key="i" class="fa-skeleton" :style="{ height: '34px', marginBottom: '10px' }" />
      </div>

      <div v-else-if="!items.length" class="empty">
        <p class="fa-serif">还没有会话</p>
        <p class="fa-faint">在右边问第一个问题，会自动建一条。</p>
      </div>

      <template v-for="group in groups" :key="group.label">
        <div class="group-label">{{ group.label }}</div>
        <div
          v-for="item in group.items"
          :key="item.conversationId"
          class="conv-item"
          :class="{ active: item.conversationId === currentId }"
          role="button"
          tabindex="0"
          @click="emit('select', item.conversationId)"
          @keydown.enter="emit('select', item.conversationId)"
        >
          <div class="conv-title">{{ item.title }}</div>
          <div class="conv-meta">
            <span class="fa-num">{{ clock(item.updatedAt) }}</span>
            <span class="dot">·</span>
            <span>{{ scopeLabel(item) }}</span>
          </div>
          <div class="conv-actions">
            <button class="mini" title="重命名" @click.stop="rename(item)">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                <path d="M4 20h4l10-10-4-4L4 16z" />
              </svg>
            </button>
            <button class="mini" title="删除" @click.stop="remove(item)">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />
              </svg>
            </button>
          </div>
        </div>
      </template>
    </div>

    <div class="pane-foot">
      <span class="fa-faint">作用域是「本轮」的，改完下一轮生效</span>
    </div>
  </aside>
</template>

<style scoped>
.conv-pane {
  width: var(--side-w);
  flex: 0 0 var(--side-w);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--rule);
  background: rgba(255, 252, 246, 0.45);
}

.pane-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 16px 12px 18px;
  border-bottom: 1px solid var(--rule);
}

.pane-title {
  font-family: var(--sans);
  font-size: 15px;
  margin-top: 3px;
}

.count { color: var(--ink-4); font-size: 11px; margin-left: 2px; }

.list { padding: 10px 10px 20px; }

.group-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--ink-4);
  padding: 12px 8px 6px;
}

.conv-item {
  position: relative;
  padding: 8px 10px 9px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 150ms var(--ease);
}

.conv-item:hover { background: var(--paper-sink); }
.conv-item.active { background: var(--paper-raised); box-shadow: 0 0 0 1px var(--rule); }

.conv-item.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 2px;
  background: var(--accent);
}

.conv-title {
  font-size: 13px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 44px;
}

.conv-meta { margin-top: 3px; display: flex; gap: 5px; font-size: 10.5px; color: var(--ink-4); }
.dot { opacity: 0.6; }

.conv-actions { position: absolute; right: 6px; top: 7px; display: none; gap: 2px; }
.conv-item:hover .conv-actions { display: flex; }

.mini {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  color: var(--ink-3);
  border-radius: 10px;
  cursor: pointer;
}

.mini:hover { color: var(--accent); border-color: rgba(178, 58, 40, 0.4); }

.empty { padding: 26px 10px; }
.empty p { margin: 0; font-size: 12px; }
.empty .fa-serif { font-size: 14px; margin-bottom: 4px; }

.pane-foot { border-top: 1px solid var(--rule); padding: 9px 18px; font-size: 10.5px; }
</style>