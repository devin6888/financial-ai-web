<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { Citation } from '@/api/types'
import { buildCopyText } from '@/utils/copyAnswer'

/**
 * 「复制为 Markdown」按钮（计划 ST16 Task 4 §4.7）。
 *
 * 三件容易做错的事：
 * 1) 流式生成中要禁用 —— 复制到一半的答案粘到别处是残句；
 * 2) `navigator.clipboard` 只在 https / localhost 可用，内网 http 部署会抛，
 *    所以要降级到 `document.execCommand('copy')`；
 * 3) 复制成功要给反馈（2 秒复位），否则用户会连点三次。
 */
const props = defineProps<{ answer: string; citations: Citation[]; streaming?: boolean }>()

const state = ref<'idle' | 'done' | 'error'>('idle')
const message = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

const disabled = computed(() => props.streaming === true || !props.answer.trim())

function resetLater(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    state.value = 'idle'
    message.value = ''
  }, 2000)
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 落到下面的兜底：非安全上下文（http）会直接 reject
  }
  return legacyCopy(text)
}

/** 老浏览器 / 非 https：用一个临时 textarea + execCommand */
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(area)
  return ok
}

async function onCopy(): Promise<void> {
  if (disabled.value) return
  const text = buildCopyText(props.answer, props.citations)
  if (!text) {
    state.value = 'error'
    message.value = '没有可复制的内容'
    resetLater()
    return
  }
  const ok = await copyText(text)
  state.value = ok ? 'done' : 'error'
  message.value = ok ? '已复制为 Markdown' : '复制失败，请手动选择答案文本'
  resetLater()
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <button
    type="button"
    class="copy"
    :class="{ done: state === 'done' }"
    :disabled="disabled"
    :title="streaming ? '答案生成中' : '复制为 Markdown'"
    aria-label="复制为 Markdown"
    @click="onCopy"
  >
    <span aria-hidden="true">{{ state === 'done' ? '✓' : '⧉' }}</span>
    <span>{{ state === 'done' ? '已复制' : '复制' }}</span>
  </button>
  <span class="sr" role="status" aria-live="polite">{{ message }}</span>
</template>

<style scoped>
.copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-4);
  font-family: var(--sans, inherit);
  font-size: 12px;
  line-height: 1.6;
  cursor: pointer;
  transition: all 140ms var(--ease);
}

.copy:hover:not(:disabled) { color: var(--accent); border-color: rgba(178, 58, 40, 0.25); }
.copy:disabled { opacity: 0.45; cursor: default; }
.copy.done { color: var(--accent); }

/* 视觉隐藏但仍被读屏播报 */
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>
