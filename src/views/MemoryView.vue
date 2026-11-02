<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { createMemory, deleteMemory, listMemories } from '@/api/memories'
import type { MemoryView } from '@/api/types'
import PageHeader from '@/components/PageHeader.vue'
import { MEMORY_TYPES } from '@/labels'
import { describe } from '@/stores/session'

/**
 * 长期记忆页（阶段 9 的 long_term_memory）。
 *
 * 这里只做「显式写入」：后端不会自动从对话里提炼记忆（ST9 D2）—— 提炼准确率无法评估，
 * 写错一条会污染之后所有回答。所以界面上必须让用户看清自己在写什么、写到哪个 key。
 *
 * 同一 key 再写不同内容 → 旧行变 SUPERSEDED、version+1（保留历史，见 C12），
 * 列表里只会显示 ACTIVE 的那一条。
 */
const memories = ref<MemoryView[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)
const filter = ref<string>('')

const form = ref({ type: 'INSTRUCTION', key: 'answer.style', content: '', importance: 50 })

const KEY_SUGGESTIONS = [
  { value: 'answer.style', label: '回答风格' },
  { value: 'answer.language', label: '回答语言' },
  { value: 'analysis.must_cite', label: '必须标注出处' },
  { value: 'instruction.general', label: '通用要求' },
  { value: 'instruction.negative', label: '禁止事项' },
  { value: 'focus.company.300059', label: '长期关注某公司' },
]

const shown = computed(() =>
  filter.value ? memories.value.filter((item) => item.type === filter.value) : memories.value,
)

const counts = computed(() => {
  const map: Record<string, number> = {}
  for (const item of memories.value) map[item.type] = (map[item.type] ?? 0) + 1
  return map
})

const typeLabel = (type: string) => MEMORY_TYPES.find((item) => item.value === type)?.label ?? type

onMounted(load)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    memories.value = await listMemories()
  } catch (e) {
    error.value = describe(e)
  } finally {
    loading.value = false
  }
}

async function submit(): Promise<void> {
  const content = form.value.content.trim()
  if (!content) {
    ElMessage.warning('内容不能为空')
    return
  }
  if (!/^[a-z][a-z0-9._-]{0,127}$/.test(form.value.key)) {
    ElMessage.warning('key 只能用小写字母开头，可含数字、点、下划线、短横线')
    return
  }
  saving.value = true
  try {
    await createMemory({
      type: form.value.type,
      key: form.value.key,
      content,
      importance: form.value.importance,
    })
    ElMessage.success('已写入（同 key 的旧记录会被标记为 SUPERSEDED）')
    form.value.content = ''
    await load()
  } catch (e) {
    ElMessage.error('写入失败：' + describe(e))
  } finally {
    saving.value = false
  }
}

async function remove(item: MemoryView): Promise<void> {
  try {
    await ElMessageBox.confirm('删除后这条记忆不再参与回答（保留审计记录）。', '删除记忆', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteMemory(item.id)
    await load()
  } catch (e) {
    ElMessage.error('删除失败：' + describe(e))
  }
}

function timeText(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN').format(date)
}
</script>

<template>
  <div class="fa-page">
    <PageHeader
      eyebrow="MEMORY"
      title="长期记忆"
      desc="写在这里的偏好与关注点，会在之后每一轮回答里作为「背景信息」注入；但它们永远不会被当成引用来源。"
    >
      <template #actions>
        <button type="button" class="fa-btn" :disabled="loading" @click="load">刷新</button>
      </template>
    </PageHeader>

    <div class="fa-scroll">
      <div class="wrap">
        <p v-if="error" class="error">{{ error }}</p>

        <div class="cols">
          <!-- 写一条 -->
          <section class="compose">
            <div class="fa-rule-label">写一条</div>

            <div class="types">
              <button
                v-for="item in MEMORY_TYPES"
                :key="item.value"
                type="button"
                class="type-btn"
                :class="{ 'type-btn--on': form.type === item.value }"
                @click="form.type = item.value"
              >
                {{ item.label }}
              </button>
            </div>

            <label class="field">
              <span class="fa-eyebrow">key</span>
              <input v-model="form.key" class="fa-field fa-mono" list="key-suggestions" spellcheck="false" />
              <datalist id="key-suggestions">
                <option v-for="item in KEY_SUGGESTIONS" :key="item.value" :value="item.value">{{ item.label }}</option>
              </datalist>
            </label>

            <label class="field">
              <span class="fa-eyebrow">内容</span>
              <textarea
                v-model="form.content"
                class="fa-field textarea"
                rows="4"
                maxlength="300"
                placeholder="例如：每个结论后面都标注 [E1] 这样的出处"
              />
              <span class="counter fa-num">{{ form.content.length }} / 300</span>
            </label>

            <label class="field">
              <span class="fa-eyebrow">重要度 <span class="fa-num imp">{{ form.importance }}</span></span>
              <input v-model.number="form.importance" type="range" min="0" max="100" step="10" class="range" />
            </label>

            <button type="button" class="fa-btn fa-btn--solid submit" :disabled="saving" @click="submit">
              {{ saving ? '写入中…' : '写入记忆' }}
            </button>

            <p class="hint">同一 key 写不同内容会升版本，旧版标记 SUPERSEDED 但保留审计记录。重要度高的会优先进入提示词。</p>
          </section>

          <!-- 已有记忆 -->
          <section class="list">
            <div class="list-head">
              <div class="fa-rule-label">已有记忆 <span class="fa-num count">{{ shown.length }}</span></div>
              <div class="filters">
                <button type="button" class="fa-chip" :class="filter === '' ? 'fa-chip--accent' : 'fa-chip--mute'" @click="filter = ''">
                  全部 <span class="fa-num">{{ memories.length }}</span>
                </button>
                <button
                  v-for="item in MEMORY_TYPES"
                  :key="item.value"
                  type="button"
                  class="fa-chip"
                  :class="filter === item.value ? 'fa-chip--accent' : 'fa-chip--mute'"
                  @click="filter = item.value"
                >
                  {{ item.label }} <span class="fa-num">{{ counts[item.value] ?? 0 }}</span>
                </button>
              </div>
            </div>

            <div v-if="loading && !memories.length" class="fa-skeleton" style="height: 96px" />

            <article v-for="item in shown" :key="item.id" class="item fa-fade-up">
              <div class="item-side">
                <span class="fa-chip fa-chip--mute">{{ typeLabel(item.type) }}</span>
                <span class="ver fa-num">v{{ item.version }}</span>
              </div>
              <div class="item-main">
                <div class="key fa-mono">{{ item.key }}</div>
                <p class="content fa-serif">{{ item.content }}</p>
                <div class="meta fa-faint">
                  <span>重要度 <span class="fa-num">{{ item.importance }}</span></span>
                  <span>更新 <span class="fa-num">{{ timeText(item.updatedAt) }}</span></span>
                </div>
              </div>
              <button type="button" class="fa-btn fa-btn--quiet fa-btn--sm del" @click="remove(item)">删除</button>
            </article>

            <div v-if="!loading && !shown.length" class="empty">
              <div class="empty-title fa-serif">{{ filter ? '这一类还没有记忆' : '还没有长期记忆' }}</div>
              <p>{{ filter ? '换个筛选条件看看。' : '写一条「回答先给结论」，下一轮开始它就会生效。' }}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap { max-width: 1180px; margin: 0 auto; padding: 24px 32px 40px; }

.cols { display: grid; grid-template-columns: 366px 1fr; gap: 20px; align-items: start; }

.compose {
  border: 1px solid var(--rule-strong);
  background: var(--paper-raised);
  padding: 16px 16px 14px;
  position: sticky;
  top: 20px;
}

.types { display: flex; gap: 6px; margin: 12px 0 14px; }

.type-btn {
  flex: 1;
  padding: 7px 4px;
  border: 1px solid var(--rule);
  background: var(--paper);
  font-size: 11.5px;
  color: var(--ink-3);
  cursor: pointer;
  transition: all 150ms var(--ease);
}

.type-btn--on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong); }

.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; position: relative; }
.fa-field { height: 32px; }
.textarea { height: auto; padding: 8px 9px; line-height: 1.7; resize: vertical; font-family: inherit; }
.counter { position: absolute; right: 2px; bottom: -14px; font-size: 9.5px; color: var(--ink-4); }

.imp { color: var(--accent); }

.range { width: 100%; accent-color: var(--accent); }

.submit { width: 100%; height: 34px; margin-top: 2px; }

.hint { margin: 12px 0 0; font-size: 10.5px; color: var(--ink-4); line-height: 1.7; }

.list-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
.count { color: var(--ink-3); }
.filters { display: flex; gap: 6px; flex-wrap: wrap; }
.filters .fa-chip { cursor: pointer; }

.item {
  display: grid;
  grid-template-columns: 96px 1fr auto;
  gap: 14px;
  padding: 14px 0 14px;
  border-bottom: 1px solid var(--rule);
  align-items: start;
}

.item-side { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.ver { font-size: 9.5px; color: var(--ink-4); letter-spacing: 0.08em; }
.key { font-size: 10.5px; color: var(--ink-4); letter-spacing: 0.04em; }
.content { margin: 6px 0 8px; font-size: 14.5px; line-height: 1.85; color: var(--ink); }
.meta { display: flex; gap: 16px; font-size: 10px; }
.del { opacity: 0; transition: opacity 150ms var(--ease); }
.item:hover .del { opacity: 1; }

.empty { padding: 34px 0; }
.empty-title { font-size: 18px; margin-bottom: 6px; }
.empty p { margin: 0; font-size: 12px; color: var(--ink-4); }

.error { color: var(--accent); font-size: 12.5px; }

@media (max-width: 980px) {
  .cols { grid-template-columns: 1fr; }
  .compose { position: static; }
  .item { grid-template-columns: 1fr auto; }
  .item-side { grid-column: span 2; flex-direction: row; align-items: center; }
}

/* 全站圆角（2026-10-28） */
.compose,
.item { border-radius: var(--radius-lg); }

.type-btn { border-radius: var(--radius); }
</style>