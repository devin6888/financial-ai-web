<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

/**
 * 阶段状态行：四个点（理解 / 检索 / 精排 / 生成）+ 当前文案 + 已用秒数。
 *
 * 三条设计约束（对应 ST13 §5）：
 * 1) 文案只用后端 stage.label，前端不自己编阶段名 —— 否则两边说法会分叉，
 *    演示时观众问「你界面上写的『分析中』是后端哪一步」就答不上来。
 * 2) 秒数是本地真实计时（setInterval 200ms），不做假进度条：真实即使慢也诚实。
 * 3) 后端没发的阶段就不点亮（比如检索无候选时没有「精排」），不猜。
 */
const props = defineProps<{
  /** 当前阶段标识，null = 还没收到第一个 stage */
  phase: string | null
  /** 后端给的中文文案 */
  label: string | null
  /** 本轮请求的发出时刻（ISO 串），秒数从它算起，切阶段不清零 */
  startedAt: string
}>()

const STEPS = [
  { phase: 'understanding', text: '理解' },
  { phase: 'retrieving', text: '检索' },
  { phase: 'reranking', text: '精排' },
  { phase: 'generating', text: '生成' },
]

const elapsed = ref(0)
let timer: number | undefined

const startedMs = Date.parse(props.startedAt)
const origin = Number.isFinite(startedMs) ? startedMs : Date.now()

const currentIndex = computed(() => {
  const index = STEPS.findIndex((step) => step.phase === props.phase)
  return index < 0 ? -1 : index
})

const seconds = computed(() => (elapsed.value / 1000).toFixed(1))

onMounted(() => {
  // 200ms 一次：再快没有意义（人眼分辨不出），再慢秒数会跳格
  timer = window.setInterval(() => {
    elapsed.value = Math.max(0, Date.now() - origin)
  }, 200)
  elapsed.value = Math.max(0, Date.now() - origin)
})

onUnmounted(() => {
  if (timer !== undefined) window.clearInterval(timer)
  timer = undefined
})
</script>

<template>
  <span class="stage-line">
    <span class="steps" aria-hidden="true">
      <i
        v-for="(step, index) in STEPS"
        :key="step.phase"
        class="dot"
        :class="{ done: currentIndex > index, on: currentIndex === index }"
        :title="step.text"
      />
    </span>
    <span class="label">{{ label ?? '正在处理' }}</span>
    <span class="elapsed fa-num">已用 {{ seconds }}s</span>
  </span>
</template>

<style scoped>
.stage-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--ink-3);
  white-space: nowrap;
}

.steps {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--rule-strong);
  transition: background 200ms var(--ease), transform 200ms var(--ease);
}

.dot.done {
  background: var(--ink-4);
}

.dot.on {
  background: var(--accent);
  transform: scale(1.5);
  animation: stage-pulse 1.1s ease-in-out infinite;
}

@keyframes stage-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.label {
  color: var(--ink-2);
}

.elapsed {
  font-size: 10.5px;
  color: var(--ink-4);
}
</style>
