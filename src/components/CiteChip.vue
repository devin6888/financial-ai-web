<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from 'vue'
import { getChunk, type ChunkDetail } from '@/api/documents'
import { CITE_SOURCE } from '@/utils/citeSource'

/**
 * 正文里的一个引用角标（2026-10-30 ST18 需求 5）。
 *
 * 三件事：
 * 1. 显示**纯数字**（原来显示 E1，读起来像编号而不是「第 1 条证据」）；
 * 2. 悬停 ~200ms 后弹出该块原文（懒加载 + 会话级缓存，用户可能一次都不悬停）；
 * 3. 点击行为不变：打开右侧证据面板的原文页。
 *
 * 弹层用 Teleport + fixed 定位，不放在按钮内部：
 * 正文区域有 overflow 裁切，任何 absolute 子元素都会被裁掉半边。
 */
const props = defineProps<{ number: number; citations: number; active?: number | null }>()
const emit = defineEmits<{ cite: [number] }>()

const source = inject(CITE_SOURCE, null)

/** 会话级缓存：同一条证据的正文通常只取一次，翻来覆去悬停不该重复打接口 */
const cache = new Map<number, ChunkDetail>()

const chunkId = computed(() => source?.value?.[props.number - 1] ?? null)
/** 越界 = 死链（点击无效）；chunkId 缺失只是「没有悬浮卡」，点击照样打开证据面板 */
const dead = computed(() => props.number > props.citations)

const open = ref(false)
const loading = ref(false)
const detail = ref<ChunkDetail | null>(null)
const style = ref<Record<string, string>>({})
const chipRef = ref<HTMLElement | null>(null)
let showTimer: number | undefined
let hideTimer: number | undefined

function scheduleShow(): void {
  window.clearTimeout(hideTimer)
  if (dead.value || chunkId.value == null) return
  showTimer = window.setTimeout(() => void load(), 200)
}

function scheduleHide(): void {
  window.clearTimeout(showTimer)
  hideTimer = window.setTimeout(() => { open.value = false }, 160)
}

async function load(): Promise<void> {
  const id = chunkId.value
  const element = chipRef.value
  if (id == null || !element) return
  position(element)
  open.value = true
  const cached = cache.get(id)
  if (cached) { detail.value = cached; return }
  loading.value = true
  try {
    const fetched = await getChunk(id)
    cache.set(id, fetched)
    detail.value = fetched
  } catch {
    // 悬停卡失败不弹错误：用户真正的动作是点击，那边有完整的错误处理
    detail.value = null
  } finally {
    loading.value = false
  }
}

/** 卡片宽 340、最多向上顶到 12px；左边夹在窗口内，避免贴边被切 */
function position(element: HTMLElement): void {
  const rect = element.getBoundingClientRect()
  const width = 340
  const left = Math.min(Math.max(12, rect.left - 20), window.innerWidth - width - 12)
  style.value = {
    left: left + 'px',
    top: Math.max(12, rect.top - 10) + 'px',
    width: width + 'px',
  }
}

const pageText = computed(() => {
  const d = detail.value
  if (!d) return ''
  if (d.pageStart == null) return '—'
  return d.pageStart === d.pageEnd || d.pageEnd == null ? '第 ' + d.pageStart + ' 页' : '第 ' + d.pageStart + '-' + d.pageEnd + ' 页'
})

const preview = computed(() => {
  const text = detail.value?.content ?? ''
  return text.length > 420 ? text.slice(0, 420) + '…' : text
})

onBeforeUnmount(() => { window.clearTimeout(showTimer); window.clearTimeout(hideTimer) })
</script>

<template>
  <button
    ref="chipRef"
    type="button"
    class="cite"
    :class="{ 'cite--dead': dead, 'cite--on': active === number }"
    :title="dead ? '这条编号没有对应证据' : chunkId == null ? '第 ' + number + ' 条证据' : '第 ' + number + ' 条证据，悬停看原文'"
    @mouseenter="scheduleShow"
    @mouseleave="scheduleHide"
    @focus="scheduleShow"
    @blur="scheduleHide"
    @click="!dead && emit('cite', number)"
  >{{ number }}</button>

  <Teleport to="body">
    <div
      v-if="open"
      class="cite-card"
      :style="style"
      @mouseenter="scheduleShow"
      @mouseleave="scheduleHide"
    >
      <div class="card-head">
        <span class="card-no fa-num">E{{ number }}</span>
        <span class="card-page fa-num">{{ pageText }}</span>
      </div>
      <p v-if="loading" class="card-loading">正在取原文…</p>
      <template v-else-if="detail">
        <p class="card-path">{{ detail.sectionPath || detail.title || detail.docTitle }}</p>
        <pre class="card-body">{{ preview }}</pre>
        <p class="card-foot">点击编号在右侧打开原文页</p>
      </template>
      <p v-else class="card-loading">这块原文取不到，点击编号看原文页</p>
    </div>
  </Teleport>
</template>

<style scoped>
.cite {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  margin: 0 2px;
  border: 1px solid rgba(178, 58, 40, 0.32);
  border-radius: 3px;
  background: var(--accent-soft);
  color: var(--accent);
  font-family: var(--mono);
  font-size: 9.5px;
  line-height: 1;
  vertical-align: 1.5px;
  cursor: pointer;
  transition: all 140ms var(--ease);
}

.cite:hover { background: var(--accent); color: #fff8ee; }
.cite--on { background: var(--accent); color: #fff8ee; }
.cite--dead { border-color: var(--rule); background: transparent; color: var(--ink-4); cursor: default; }

.cite-card {
  position: fixed;
  transform: translateY(-100%);
  z-index: 3000;
  padding: 10px 12px 9px;
  border: 1px solid var(--rule-strong);
  border-radius: 9px;
  background: var(--paper-raised);
  box-shadow: 0 10px 30px rgba(23, 22, 20, 0.14);
}

.card-head { display: flex; align-items: center; gap: 8px; }
.card-no { font-size: 10px; color: var(--accent); letter-spacing: 0.06em; }
.card-page { margin-left: auto; font-size: 10px; color: var(--ink-4); }
.card-path { margin: 5px 0 6px; font-size: 11px; color: var(--ink-3); line-height: 1.5; }

.card-body {
  margin: 0;
  max-height: 210px;
  overflow: auto;
  font-family: var(--serif);
  font-size: 11.5px;
  line-height: 1.75;
  color: var(--ink-2);
  white-space: pre-wrap;
  word-break: break-word;
}

.card-loading { margin: 6px 0 2px; font-size: 11px; color: var(--ink-4); }
.card-foot { margin: 7px 0 0; padding-top: 6px; border-top: 1px solid var(--rule); font-size: 10px; color: var(--ink-4); }
</style>
