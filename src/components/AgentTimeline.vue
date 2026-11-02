<script setup lang="ts">
import { computed } from 'vue'
import type { AgentRunView, AgentStep } from '@/api/agent'
import { AGENT_STATUS, nodeLabel } from '@/labels'

/**
 * 深度分析时间线：先给「打算做什么」（计划里的子问题），再给「已经做了什么」（节点与耗时）。
 *
 * 为什么不复用 StageLine：那条是「当前正在做什么」的单行，会被下一次 stage 覆盖；
 * 这里要留下完整轨迹 —— 面试演示时它正好回答「Agent 到底怎么工作的」。
 */
const props = defineProps<{ agent: AgentRunView }>()

const statusText = computed(() => AGENT_STATUS[props.agent.status] ?? props.agent.status)

const steps = computed<AgentStep[]>(() => props.agent.steps ?? [])

/** 时间线节点名 + 耗时：耗时为 0 或缺失时不显示 0ms（假精确） */
function duration(step: AgentStep): string {
  const ms = step.durationMs
  if (ms == null || ms <= 0) return ''
  return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms'
}
</script>

<template>
  <section class="agent">
    <header class="bar">
      <span class="fa-chip fa-chip--mute">深度分析</span>
      <span class="status" :class="{ waiting: agent.status === 'WAITING_APPROVAL' }">{{ statusText }}</span>
      <span class="fa-faint fa-num run">{{ agent.runId.slice(0, 8) }}</span>
    </header>

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
  font-size: 12px;
}
.status {
  color: var(--ink-weak);
}
.status.waiting {
  color: var(--accent);
  font-weight: 600;
}
.run {
  margin-left: auto;
  font-size: 11px;
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
