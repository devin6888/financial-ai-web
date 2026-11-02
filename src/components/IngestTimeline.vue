<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { getIngest, retryIngest } from '@/api/ingest'
import type { IngestStep, IngestView } from '@/api/ingest'
import { describe } from '@/stores/session'

/**
 * 入库执行记录（阶段 19）。
 *
 * 设计要点：
 * 1) **只有未完成的文档展示步骤**；DONE 只展示摘要（页数/块数/耗时），因为中间步骤对结果没有意义。
 * 2) **当前这一步必须能看出「在动」**：脉冲点 + 行内流光条 + 秒数每秒自增。
 *    秒数不依赖轮询（轮询 2 秒一次，看起来像卡住），而是本地 setInterval 按 startedAt 算。
 * 3) 动效只给 RUNNING 行，避免整页都在闪；prefers-reduced-motion 下全部静止。
 */
const props = defineProps<{ documentId: number | null }>()
const emit = defineEmits<{ (event: 'retried', documentId: number): void }>()

const view = ref<IngestView | null>(null)
const error = ref<string | null>(null)
const retrying = ref(false)
/** 每秒刷新一次的时间戳：只驱动「已用 12s」，不触发网络请求。 */
const now = ref(Date.now())

let pollTimer: number | null = null
let tickTimer: number | null = null

const running = computed(() => view.value?.state === 'RUNNING')

onMounted(load)
onBeforeUnmount(stop)

watch(
  () => props.documentId,
  () => {
    stop()
    view.value = null
    error.value = null
    void load()
  },
)

async function load(): Promise<void> {
  if (!props.documentId) return
  try {
    view.value = await getIngest(props.documentId)
    error.value = null
  } catch (e) {
    error.value = describe(e)
  }
  sync()
}

/** 定时器只在「还在跑」时开：完成的文档不该继续消耗请求。 */
function sync(): void {
  stopPolling()
  if (running.value && props.documentId) {
    pollTimer = window.setInterval(() => void refresh(), 2000)
  }
  if (running.value && tickTimer === null) {
    tickTimer = window.setInterval(() => {
      now.value = Date.now()
    }, 1000)
  }
  if (!running.value) stopTick()
}

async function refresh(): Promise<void> {
  if (!props.documentId) return
  try {
    view.value = await getIngest(props.documentId)
    error.value = null
  } catch {
    // 轮询失败不弹错：下一轮会自愈，否则解析期间会刷屏
  }
  sync()
}

function stop(): void {
  stopPolling()
  stopTick()
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

function stopTick(): void {
  if (tickTimer !== null) {
    window.clearInterval(tickTimer)
    tickTimer = null
  }
}

async function retry(): Promise<void> {
  if (!props.documentId) return
  retrying.value = true
  try {
    await retryIngest(props.documentId)
    ElMessage.success('已重新提交解析')
    emit('retried', props.documentId)
    await load()
  } catch (e) {
    ElMessage.error('重试失败：' + describe(e))
  } finally {
    retrying.value = false
  }
}

/** 当前步已跑秒数（按 startedAt 现算，与轮询无关）。 */
function runningSeconds(step: IngestStep): number {
  const start = step.startedAt ?? view.value?.startedAt
  if (!start) return 0
  const from = Date.parse(start)
  if (Number.isNaN(from)) return 0
  return Math.max(0, Math.round((now.value - from) / 1000))
}

/** 整条 run 的已用时长。 */
const liveText = computed(() => {
  if (!view.value?.startedAt) return '—'
  const from = Date.parse(view.value.startedAt)
  if (Number.isNaN(from)) return '—'
  return '已用 ' + formatMs(Math.max(0, now.value - from))
})

/** 毫秒转人话：<1s 给一位小数，<60s 给秒，其余给「3m20s」。 */
function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—'
  if (ms < 1000) return (ms / 1000).toFixed(1) + 's'
  if (ms < 60_000) return (ms / 1000).toFixed(1) + 's'
  const total = Math.round(ms / 1000)
  return Math.floor(total / 60) + 'm' + String(total % 60).padStart(2, '0') + 's'
}

/** 状态文案（只给读屏与 title 用，视觉上靠颜色与图标区分）。 */
function statusText(step: IngestStep): string {
  return (
    { RUNNING: '进行中', OK: '完成', FAILED: '失败', SKIPPED: '跳过', PENDING: '未执行' }[step.status] ??
    step.status
  )
}
</script>

<template>
  <section
    v-if="view && view.state !== 'NONE'"
    class="tl"
    :class="'tl--' + view.state.toLowerCase()"
  >
    <header class="tl-head">
      <span class="fa-eyebrow">执行记录</span>
      <span v-if="view.attempt" class="tl-attempt fa-num">第 {{ view.attempt }} 次</span>
      <span v-if="view.state !== 'DONE'" class="tl-step-no fa-num">
        第 {{ view.currentStep }}/{{ view.totalSteps }} 步
      </span>
      <span class="tl-spacer" />
      <span v-if="running" class="tl-live"><i class="tl-pulse" aria-hidden="true" />{{ liveText }}</span>
      <span v-else-if="view.state === 'DONE'" class="tl-total fa-num">共 {{ formatMs(view.summary.totalMs) }}</span>
      <span v-else class="tl-badge">失败</span>
    </header>

    <!-- DONE：只回摘要，不回中间步骤 -->
    <div v-if="view.state === 'DONE'" class="tl-summary">
      <span v-if="view.summary.pages" class="tl-fact"><b class="fa-num">{{ view.summary.pages }}</b> 页</span>
      <span v-if="view.summary.chunks" class="tl-fact"><b class="fa-num">{{ view.summary.chunks }}</b> 块</span>
      <span class="tl-fact">解析 <b class="fa-num">{{ formatMs(view.summary.parseMs) }}</b></span>
      <span class="tl-fact">切块 <b class="fa-num">{{ formatMs(view.summary.chunkMs) }}</b></span>
      <span class="tl-fact">向量化 <b class="fa-num">{{ formatMs(view.summary.embedMs) }}</b></span>
      <span v-if="view.summary.embedded !== undefined" class="tl-fact fa-faint">
        新嵌 {{ view.summary.embedded }} · 复用 {{ view.summary.reused ?? 0 }}
      </span>
    </div>

    <ol v-else class="tl-list">
      <li
        v-for="step in view.steps"
        :key="step.seq"
        class="tl-item"
        :class="'is-' + step.status.toLowerCase()"
        :title="statusText(step)"
      >
        <span class="tl-rail" aria-hidden="true"><i class="tl-dot" /></span>
        <div class="tl-body">
          <div class="tl-line">
            <span class="tl-label">{{ step.label }}</span>
            <span v-if="step.retry > 0" class="tl-retry fa-num">重试 {{ step.retry }}</span>
            <span class="tl-gap" />
            <span v-if="step.status === 'RUNNING'" class="tl-time fa-num is-live">
              {{ runningSeconds(step) }}s
            </span>
            <span v-else-if="step.durationMs !== null" class="tl-time fa-num">{{ formatMs(step.durationMs) }}</span>
            <span v-else class="tl-time fa-faint">—</span>
          </div>
          <div v-if="step.detail" class="tl-detail">{{ step.detail }}</div>
          <!-- 流光条：只有「当前执行」这一步有，作为「正在动」的第二重信号 -->
          <div v-if="step.status === 'RUNNING'" class="tl-flow" aria-hidden="true"><i /></div>
        </div>
      </li>
    </ol>

    <div v-if="view.state === 'FAILED'" class="tl-error">
      <div class="tl-error-text">{{ view.error || '解析失败' }}</div>
      <button type="button" class="fa-btn fa-btn--accent fa-btn--sm" :disabled="retrying" @click="retry">
        {{ retrying ? '重试中…' : '重试' }}
      </button>
    </div>

    <p v-if="error" class="tl-error-text">{{ error }}</p>
  </section>
</template>

<style scoped>
.tl {
  margin-top: 16px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--paper-raised);
  padding: 12px 14px 10px;
}

.tl-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--rule);
}

.tl-attempt {
  font-size: 10.5px;
  color: var(--ink-4);
  border: 1px solid var(--rule);
  border-radius: var(--radius-pill);
  padding: 0 7px;
  line-height: 16px;
}

.tl-step-no { font-size: 11px; color: var(--ink-3); letter-spacing: 0.04em; }
.tl-spacer { flex: 1; }

.tl-live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

/* 头部的小脉冲：与行内脉冲点同频，形成「整块在跳」的观感 */
.tl-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: tl-breathe 1.6s var(--ease) infinite;
}

.tl-total { font-size: 11px; color: var(--ink-3); }

.tl-badge {
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: var(--accent);
  border: 1px solid rgba(178, 58, 40, 0.35);
  background: var(--accent-soft);
  border-radius: var(--radius-pill);
  padding: 0 8px;
  line-height: 17px;
}

.tl-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  padding-top: 10px;
  font-size: 11.5px;
  color: var(--ink-3);
}

.tl-fact b { color: var(--ink); font-weight: 600; }

.tl-list { list-style: none; margin: 0; padding: 6px 0 0; }

.tl-item {
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 0 10px;
  padding: 6px 6px 6px 0;
  border-radius: var(--radius-sm);
  transition: background 200ms var(--ease);
}

.tl-item.is-running { background: linear-gradient(90deg, var(--accent-soft), transparent 68%); }

/* 竖向主线：最后一行不画 */
.tl-rail { position: relative; display: flex; justify-content: center; padding-top: 5px; }
.tl-item:not(:last-child) .tl-rail::after {
  content: '';
  position: absolute;
  top: 15px;
  bottom: -10px;
  width: 1px;
  background: var(--rule);
}

.tl-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--rule-strong);
  position: relative;
  z-index: 1;
}

.tl-item.is-ok .tl-dot { background: var(--teal); }
.tl-item.is-failed .tl-dot { background: var(--accent); }
.tl-item.is-skipped .tl-dot { background: var(--gold); }
.tl-item.is-pending .tl-dot { background: transparent; border: 1px solid var(--rule-strong); }

.tl-item.is-running .tl-dot {
  background: var(--accent);
  width: 7px;
  height: 7px;
  animation: tl-ring 1.6s var(--ease) infinite;
}

.tl-body { min-width: 0; }
.tl-line { display: flex; align-items: baseline; gap: 8px; }

.tl-label { font-size: 12.5px; color: var(--ink); letter-spacing: 0.01em; }
.tl-item.is-pending .tl-label { color: var(--ink-4); }
.tl-item.is-running .tl-label { color: var(--accent); font-weight: 600; }

.tl-retry {
  font-size: 10px;
  color: var(--gold);
  border: 1px solid rgba(169, 124, 47, 0.35);
  border-radius: var(--radius-pill);
  padding: 0 6px;
  line-height: 15px;
}

.tl-gap { flex: 1; }
.tl-time { font-size: 11px; color: var(--ink-3); }
.tl-time.is-live { color: var(--accent); }

.tl-detail {
  margin-top: 2px;
  font-size: 11px;
  color: var(--ink-4);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 行内流光：2px 轨道 + 40% 宽的浅色块往返 */
.tl-flow {
  position: relative;
  height: 2px;
  margin-top: 6px;
  border-radius: 1px;
  background: var(--paper-sink);
  overflow: hidden;
}

.tl-flow i {
  position: absolute;
  inset: 0 auto 0 0;
  width: 40%;
  background: linear-gradient(90deg, transparent, rgba(178, 58, 40, 0.55), transparent);
  animation: tl-sweep 2.4s var(--ease) infinite;
}

.tl-error {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--rule);
}

.tl-error-text {
  flex: 1;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--accent);
  word-break: break-word;
}

@keyframes tl-breathe {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.86); }
}

@keyframes tl-ring {
  0% { box-shadow: 0 0 0 0 rgba(178, 58, 40, 0.45); }
  70% { box-shadow: 0 0 0 7px rgba(178, 58, 40, 0); }
  100% { box-shadow: 0 0 0 0 rgba(178, 58, 40, 0); }
}

@keyframes tl-sweep {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}

@media (prefers-reduced-motion: reduce) {
  .tl-pulse,
  .tl-item.is-running .tl-dot { animation: none; }
  /* 流光条静止时会停在左端像「进度 0」，直接不显示 */
  .tl-flow { display: none; }
}
</style>
