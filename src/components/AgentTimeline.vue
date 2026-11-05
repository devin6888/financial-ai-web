<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AgentRunView, AgentStep } from '@/api/agent'
import { AGENT_STATUS, nodeLabel } from '@/labels'

/**
 * 深度分析时间线：先给「打算做什么」（计划里的子问题），再给「已经做了什么」（节点与耗时）。
 *
 * 为什么不复用 StageLine：那条是「当前正在做什么」的单行，会被下一次 stage 覆盖；
 * 这里要留下完整轨迹 —— 面试演示时它正好回答「Agent 到底怎么工作的」。
 *
 * 默认收起（2026-11-03 用户要求）：一条回答后面铺 9 行「节点 + 耗时」会把答案挤出屏幕，
 * 而多数人只想要答案。收起后一行摘要仍然回答「跑了多久、卡在哪」，
 * 想研究过程的人点一下就能展开 —— 信息不丢，只是不再挡路。
 */
const props = defineProps<{ agent: AgentRunView }>()

/** 用户手动开合的结果；null = 还没点过，按状态取默认值。 */
const manual = ref<boolean | null>(null)

/** 默认收起；只有「失败」默认展开 —— 那时步骤就是唯一的排错线索。 */
const open = computed(() => manual.value ?? props.agent.status === 'FAILED')

const statusText = computed(() => AGENT_STATUS[props.agent.status] ?? props.agent.status)

const steps = computed<AgentStep[]>(() => props.agent.steps ?? [])

const running = computed(
  () => props.agent.status === 'RUNNING' || props.agent.status === 'WAITING_APPROVAL',
)

/** 耗时文案：0 或缺失时不显示 0ms（假精确）。 */
function durationText(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms'
}

function duration(step: AgentStep): string {
  return durationText(step.durationMs ?? 0)
}

const totalText = computed(() =>
  durationText(steps.value.reduce((sum, step) => sum + (step.durationMs ?? 0), 0)),
)

const lastStep = computed(() => {
  const last = steps.value[steps.value.length - 1]
  return last ? nodeLabel(last.node) : ''
})

/** 收起时的那一行：跑到哪一步 / 几步 / 合计多久。 */
const brief = computed(() => {
  const parts: string[] = []
  if (running.value && lastStep.value) parts.push('正在：' + lastStep.value)
  if (steps.value.length > 0) parts.push(steps.value.length + ' 步')
  if (totalText.value) parts.push('合计 ' + totalText.value)
  return parts.join(' · ')
})
</script>

<template>
  <section class="agent" :class="{ open }">
    <button
      type="button"
      class="bar"
      :aria-expanded="open"
      :title="open ? '收起执行过程' : '展开执行过程'"
      @click="manual = !open"
    >
      <svg class="chev" :class="{ on: open }" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
        <path
          d="M4 2.5 8 6l-4 3.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="fa-chip fa-chip--mute">深度分析</span>
      <span class="status" :class="{ waiting: agent.status === 'WAITING_APPROVAL' }">{{ statusText }}</span>
      <span class="fa-faint fa-num brief">{{ brief }}</span>
      <span class="fa-faint fa-num run">{{ agent.runId.slice(0, 8) }}</span>
    </button>

    <template v-if="open">
      <ol v-if="agent.plan.length" class="plan">
        <li v-for="(item, index) in agent.plan" :key="index">{{ item }}</li>
      </ol>

      <ol v-if="steps.length" class="track">
        <li v-for="step in steps" :key="step.seq" class="node" :class="'is-' + step.status.toLowerCase()">
          <span class="dot" aria-hidden="true" />
          <span class="name">{{ nodeLabel(step.node) }}</span>
          <span v-if="duration(step)" class="fa-num ms">{{ duration(step) }}</span>
          <span v-if="step.summary" class="summary">{{ step.summary }}</span>
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.agent {
  border: 1px solid var(--rule);
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 4%, transparent);
  padding: 10px 12px;
  margin-bottom: 10px;
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font-size: 12px;
  font-family: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.bar:hover .chev {
  color: var(--ink);
}
.chev {
  flex: none;
  color: var(--ink-weak);
  transition: transform 0.15s ease;
}
.chev.on {
  transform: rotate(90deg);
}
.status {
  color: var(--ink-weak);
}
.status.waiting {
  color: var(--accent);
  font-weight: 600;
}
.brief {
  margin-left: auto;
  font-size: 11px;
}
.run {
  font-size: 11px;
  opacity: 0.7;
}
.plan {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--ink);
}
.plan li {
  margin: 2px 0;
}
.track {
  list-style: none;
  margin: 10px 0 2px;
  padding: 0;
  border-left: 1px dashed var(--rule-strong);
  margin-left: 3px;
}
.node {
  position: relative;
  padding: 2px 0 2px 14px;
  font-size: 12px;
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}
.dot {
  position: absolute;
  left: -4px;
  top: 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--rule-strong);
}
.is-ok .dot {
  background: var(--ok, #2e7d5b);
}
.is-skipped .dot {
  background: var(--accent);
}
.is-failed .dot {
  background: var(--warn);
}
.name {
  color: var(--ink);
}
.ms {
  color: var(--ink-weak);
  font-size: 11px;
}
.summary {
  color: var(--ink-weak);
  font-size: 12px;
  flex-basis: 100%;
  padding-left: 0;
}
</style>
