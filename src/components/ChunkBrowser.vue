<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { ApiError } from '@/api/client'
import { fetchPageImage, listChunks } from '@/api/documents'
import type { ChunkBrief } from '@/api/types'
import { EVIDENCE_TYPE } from '@/labels'

/**
 * 切块可视化：左边是块列表（Parent 粗体、Child 缩进），右边是选中块的正文与原文页。
 *
 * 为什么值得单独做一个抽屉：RAG 出问题时，90% 的原因在切块 —— 表格被切断了、
 * 标题没进 section_path、一块里塞了三张表。面试时打开这个抽屉，能直接讲清「我们怎么切的」。
 */
const props = defineProps<{
  modelValue: boolean
  documentId: number | null
  documentTitle: string | null
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const chunks = ref<ChunkBrief[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const selected = ref<ChunkBrief | null>(null)
const pageUrl = ref<string | null>(null)
const pageSize = ref<{ w: number; h: number } | null>(null)
const pageLoading = ref(false)
const pageError = ref<string | null>(null)
let objectUrl: string | null = null

const parents = computed(() => chunks.value.filter((c) => c.chunkLevel === 'PARENT'))
const childCount = computed(() => chunks.value.filter((c) => c.chunkLevel === 'CHILD').length)

const group = computed(() => {
  const map = new Map<number | null, ChunkBrief[]>()
  for (const chunk of chunks.value) {
    const key = chunk.chunkLevel === 'PARENT' ? chunk.id : chunk.parentId
    const list = map.get(key) ?? []
    list.push(chunk)
    map.set(key, list)
  }
  return map
})

/** 选中块的 bbox：库里是 {top,left,right,bottom} 归一化坐标，这里换成 CSS 百分比。 */
const box = computed(() => {
  const raw = selected.value?.bboxJson
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { top: number; left: number; right: number; bottom: number }
    return {
      left: parsed.left * 100 + '%',
      top: parsed.top * 100 + '%',
      width: (parsed.right - parsed.left) * 100 + '%',
      height: (parsed.bottom - parsed.top) * 100 + '%',
    }
  } catch {
    return null
  }
})

watch(
  () => [props.modelValue, props.documentId] as const,
  async ([open, id]) => {
    if (!open || !id) return
    await load(id)
  },
)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) release()
  },
)

onBeforeUnmount(release)

async function load(id: number): Promise<void> {
  loading.value = true
  error.value = null
  chunks.value = []
  selected.value = null
  release()
  try {
    chunks.value = await listChunks(id)
    selected.value = chunks.value.find((c) => c.chunkLevel === 'CHILD') ?? chunks.value[0] ?? null
    if (selected.value) await showPage(selected.value)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '切块加载失败'
  } finally {
    loading.value = false
  }
}

async function pick(chunk: ChunkBrief): Promise<void> {
  selected.value = chunk
  await showPage(chunk)
}

async function showPage(chunk: ChunkBrief): Promise<void> {
  if (!props.documentId || chunk.pageStart == null) {
    release()
    return
  }
  pageLoading.value = true
  pageError.value = null
  try {
    const image = await fetchPageImage(props.documentId, chunk.pageStart, 120)
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = image.url
    pageUrl.value = image.url
    pageSize.value = image.width && image.height ? { w: image.width, h: image.height } : null
  } catch (e) {
    pageUrl.value = null
    pageError.value = e instanceof ApiError ? e.message : '原文页加载失败'
  } finally {
    pageLoading.value = false
  }
}

function release(): void {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = null
  pageUrl.value = null
  pageSize.value = null
}

function pageText(chunk: ChunkBrief): string {
  if (chunk.pageStart == null) return '未标注页码'
  return chunk.pageStart === chunk.pageEnd || chunk.pageEnd == null
    ? '第 ' + chunk.pageStart + ' 页'
    : '第 ' + chunk.pageStart + '-' + chunk.pageEnd + ' 页'
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    size="880px"
    :with-header="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="browser">
      <header class="head">
        <div>
          <div class="fa-eyebrow">CHUNKS</div>
          <h3 class="fa-title-md title">{{ documentTitle || '切块预览' }}</h3>
        </div>
        <div class="head-right">
          <span class="fa-chip fa-chip--mute">父块 <span class="fa-num">{{ parents.length }}</span></span>
          <span class="fa-chip fa-chip--mute">子块 <span class="fa-num">{{ childCount }}</span></span>
          <button type="button" class="fa-icon-btn" title="关闭" @click="emit('update:modelValue', false)">×</button>
        </div>
      </header>

      <p v-if="error" class="error">{{ error }}</p>

      <div v-if="loading" class="stage">
        <div class="fa-skeleton" style="height: 100%; width: 100%" />
      </div>

      <div v-else class="body">
        <div class="list fa-scroll">
          <template v-for="parent in parents" :key="parent.id">
            <button
              type="button"
              class="row parent"
              :class="{ on: selected?.id === parent.id }"
              @click="pick(parent)"
            >
              <span class="badge p">P</span>
              <span class="row-main">
                <span class="row-title">{{ parent.title || parent.sectionPath || '（无标题）' }}</span>
                <span class="row-meta fa-mono">#{{ parent.id }} · {{ parent.tokenCount }}t · {{ pageText(parent) }}</span>
              </span>
            </button>
            <button
              v-for="child in group.get(parent.id) ?? []"
              :key="child.id"
              type="button"
              class="row child"
              :class="{ on: selected?.id === child.id }"
              @click="pick(child)"
            >
              <span class="badge" :class="child.chunkType === 'TABLE' ? 't' : 'x'">
                {{ child.chunkType === 'TABLE' ? 'T' : 'C' }}
              </span>
              <span class="row-main">
                <span class="row-preview">{{ child.preview }}</span>
                <span class="row-meta fa-mono">#{{ child.id }} · {{ child.tokenCount }}t · {{ EVIDENCE_TYPE[child.chunkType] ?? child.chunkType }} · {{ pageText(child) }}</span>
              </span>
            </button>
          </template>
          <p v-if="!chunks.length" class="empty">这份文档还没有 ACTIVE 切块。</p>
        </div>

        <div class="detail fa-scroll">
          <template v-if="selected">
            <div class="detail-head">
              <span class="fa-chip" :class="selected.chunkType === 'TABLE' ? 'fa-chip--accent' : 'fa-chip--mute'">
                {{ EVIDENCE_TYPE[selected.chunkType] ?? selected.chunkType }}
              </span>
              <span class="fa-faint fa-mono">#{{ selected.id }} · chunk_index {{ selected.chunkIndex }} · {{ selected.tokenCount }} tokens · {{ selected.contentLength }} 字</span>
            </div>
            <p class="path">{{ selected.sectionPath || '未标注章节' }}</p>
            <pre class="content">{{ selected.preview }}<span v-if="selected.contentLength > 220" class="more">…（仅显示前 220 字）</span></pre>

            <div class="fa-rule-label">原文位置</div>
            <div v-if="pageLoading" class="stage-sm"><div class="fa-skeleton" style="height: 240px" /></div>
            <p v-else-if="pageError" class="fa-faint small">{{ pageError }}（该块可能没有 bbox）</p>
            <div v-else-if="pageUrl" class="shot">
              <img :src="pageUrl" :alt="pageText(selected)" />
              <span v-if="box" class="hl" :style="box" />
            </div>
            <p v-else class="fa-faint small">这一块没有坐标（例如整段展开的兜底块）。</p>
          </template>
          <p v-else class="empty">选左边任意一块，看它的正文与原文位置。</p>
        </div>
      </div>
    </div>
  </el-drawer>
</template>
<style scoped>
.browser { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 4px 2px 14px; border-bottom: 1px solid var(--rule); }
.title { margin: 4px 0 0; }
.head-right { display: flex; align-items: center; gap: 8px; }
.fa-icon-btn { font-size: 18px; line-height: 1; }

.stage { flex: 1; min-height: 320px; }

.body { display: grid; grid-template-columns: 350px 1fr; gap: 0; flex: 1; min-height: 0; margin-top: 12px; }

.list { border-right: 1px solid var(--rule); padding-right: 10px; min-height: 0; }

.row { display: flex; gap: 8px; width: 100%; text-align: left; padding: 7px 8px; border: 1px solid transparent; border-radius: 8px; background: transparent; cursor: pointer; }
.row:hover { background: var(--paper-sink); }
.row.on { border-color: var(--rule-strong); background: rgba(239, 233, 221, 0.6); }
.row.parent { margin-top: 6px; }
.row.child { padding-left: 20px; }

.badge { flex: 0 0 18px; height: 18px; display: inline-grid; place-items: center; border-radius: 5px; font-family: var(--mono); font-size: 9.5px; border: 1px solid var(--rule-strong); color: var(--ink-3); }
.badge.p { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.badge.t { background: var(--accent-soft); color: var(--accent); border-color: rgba(178, 58, 40, 0.3); }

.row-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.row-title { font-size: 12px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-preview { font-size: 11.5px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-meta { font-size: 9.5px; color: var(--ink-4); }

.detail { padding-left: 16px; min-height: 0; }
.detail-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.path { margin: 8px 0 10px; font-size: 12px; color: var(--ink-3); }

.content { margin: 0 0 16px; padding: 12px 14px; background: var(--paper-sink); border-radius: 8px; font-family: var(--serif); font-size: 12.5px; line-height: 1.85; color: var(--ink-2); white-space: pre-wrap; word-break: break-word; max-height: 210px; overflow: auto; }
.more { color: var(--ink-4); font-family: var(--sans); font-size: 10.5px; }

.stage-sm { margin-top: 8px; }

.shot { position: relative; border: 1px solid var(--rule-strong); border-radius: 4px; overflow: hidden; background: #fff; box-shadow: 0 8px 22px rgba(23, 22, 20, 0.1); }
.shot img { display: block; width: 100%; height: auto; }
.hl { position: absolute; border: 1.5px solid var(--accent); background: rgba(178, 58, 40, 0.12); border-radius: 2px; pointer-events: none; }

.small { font-size: 11px; }
.empty { padding: 16px 6px; font-size: 12px; color: var(--ink-3); }
.error { margin: 10px 0; font-size: 12px; color: var(--accent); }
</style>
