<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AgentAmbiguity, ApprovalPick } from '@/api/agent'

/**
 * 人工审批卡（阶段 22 B 重做）。
 *
 * 这一版回答三个问题：**为什么停**（reasons）、**系统听成了什么**（understood）、
 * **可以改成什么**（候选 chips + 一句补充）。
 *
 * 交互约定：
 * 1) 候选只在「该维度真的有多个取值」时出现，点一下就是选定；再点一次取消；
 * 2) 补充文本非空时按钮变成「按补充继续」，走 EDIT（后端把文本拼进检索式并抽年份）；
 * 3) 决定只能提交一次（busy 后全部禁用）；
 * 4) 卡片上明确说「还没开始检索」—— 审批的是理解与检索条件，不是答案。
 */
const props = defineProps<{
  plan: string[]
  ambiguity: AgentAmbiguity | null
  busy: boolean
}>()
const emit = defineEmits<{
  decide: [decision: 'APPROVE' | 'EDIT' | 'REJECT', note: string, pick: ApprovalPick]
}>()

const note = ref('')
const trimmed = computed(() => note.value.trim())
const year = ref<number | null>(null)
const allYears = ref(false)
const company = ref<string | null>(null)
const canReject = computed(() => !props.busy && trimmed.value.length > 0)

const reasons = computed(() => props.ambiguity?.reasons ?? [])
const candidates = computed(() => props.ambiguity?.candidates ?? [])
const understood = computed(() => props.ambiguity?.understood ?? null)

const REASON_LABEL: Record<string, string> = {
  year_not_specified: '没说看哪一年',
  company_not_specified: '没说看哪家公司',
}

const hint = computed(() => {
  const parts = reasons.value.map((r) => REASON_LABEL[r] ?? r)
  return parts.length ? parts.join('、') + '，确认后才会检索并生成' : '确认检索条件后才会开始检索'
})

const scopeText = computed(() => {
  const years = understood.value?.scopeYears ?? []
  return years.length ? years.join(' / ') + ' 年' : '—'
})

const metricText = computed(() => {
  const metrics = understood.value?.metrics ?? []
  return metrics.length ? metrics.join('、') : '未识别到指标'
})

const companyText = computed(() => {
  const codes = understood.value?.companyCodes ?? []
  return codes.length ? codes.join('、') : '未指定'
})

const yearText = computed(() => {
  const from = understood.value?.yearFrom ?? 0
  const to = understood.value?.yearTo ?? 0
  if (!from && !to) return '未指定（按范围里全部年份）'
  if (from && to && from !== to) return from + '–' + to + ' 年'
  return (from || to) + ' 年'
})

function pickYear(value: number): void {
  if (props.busy) return
  allYears.value = false
  year.value = year.value === value ? null : value
}

function pickAllYears(): void {
  if (props.busy) return
  year.value = null
  allYears.value = !allYears.value
}

function pickCompany(code: string): void {
  if (props.busy) return
  company.value = company.value === code ? null : code
}

function chosen(): ApprovalPick {
  const pick: ApprovalPick = {}
  if (year.value !== null) {
    pick.yearFrom = year.value
    pick.yearTo = year.value
  }
  if (company.value) pick.companyCodes = [company.value]
  return pick
}

function submit(): void {
  if (props.busy) return
  emit('decide', trimmed.value ? 'EDIT' : 'APPROVE', trimmed.value, chosen())
}

function reject(): void {
  if (!canReject.value) return
  emit('decide', 'REJECT', trimmed.value, {})
}
</script>

<template>
  <section class="approval">
    <header>
      <span class="mark">先确认一下理解</span>
      <span class="fa-faint">{{ hint }}</span>
    </header>

    <ul v-if="reasons.length" class="reasons">
      <li v-for="reason in reasons" :key="reason" class="fa-chip fa-chip--accent">
        {{ REASON_LABEL[reason] ?? reason }}
      </li>
    </ul>

    <table v-if="understood" class="understood">
      <tbody>
        <tr>
          <th>检索范围</th>
          <td>{{ scopeText }}</td>
          <th>年份</th>
          <td>{{ yearText }}</td>
        </tr>
        <tr>
          <th>公司</th>
          <td>{{ companyText }}</td>
          <th>指标</th>
          <td>{{ metricText }}</td>
        </tr>
      </tbody>
    </table>

    <div v-if="candidates.length" class="cands">
      <button
        v-for="item in candidates"
        :key="item.kind + '-' + item.value"
        type="button"
        class="cand"
        :class="{
          on:
            (item.kind === 'YEAR' && year === item.value) ||
            (item.kind === 'ALL_YEARS' && allYears) ||
            (item.kind === 'COMPANY' && company === item.value),
        }"
        :disabled="busy"
        @click="
          item.kind === 'YEAR'
            ? pickYear(Number(item.value))
            : item.kind === 'ALL_YEARS'
              ? pickAllYears()
              : pickCompany(String(item.value))
        "
      >
        {{ item.label }}
      </button>
    </div>

    <textarea
      v-model="note"
      class="note"
      rows="2"
      :disabled="busy"
      placeholder="也可以补一句，例如：只看 2024 年的总营收"
    />

    <p class="fa-faint meta">还没开始检索；确认后才召回证据并生成答案。</p>

    <div class="actions">
      <button type="button" class="btn primary" :disabled="busy" @click="submit">
        {{ trimmed ? '按补充继续' : '按这个继续' }}
      </button>
      <button type="button" class="btn danger" :disabled="!canReject" @click="reject">驳回</button>
      <span v-if="busy" class="fa-faint">正在提交…</span>
    </div>
  </section>
</template>

<style scoped>
.approval {
  border: 1px solid var(--accent);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 10px;
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}
header {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.mark {
  color: var(--accent);
  font-weight: 600;
  font-size: 13px;
}
.reasons {
  display: flex;
  gap: 6px;
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  flex-wrap: wrap;
}
.understood {
  margin: 8px 0 0;
  border-collapse: collapse;
  font-size: 13px;
}
.understood th {
  text-align: left;
  font-weight: 500;
  color: var(--ink-mute);
  padding: 2px 10px 2px 0;
  white-space: nowrap;
}
.understood td {
  padding: 2px 16px 2px 0;
}
.cands {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.cand {
  border: 1px solid var(--rule-strong);
  background: var(--panel);
  color: var(--ink);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
}
.cand.on {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.cand:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.note {
  width: 100%;
  box-sizing: border-box;
  margin-top: 10px;
  border: 1px solid var(--rule-strong);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  resize: vertical;
  background: var(--panel);
  color: var(--ink);
}
.meta {
  margin: 6px 0 0;
  font-size: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
  flex-wrap: wrap;
}
.btn {
  border: 1px solid var(--rule-strong);
  background: var(--panel);
  color: var(--ink);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.btn.danger {
  color: var(--warn);
  border-color: var(--warn);
}
</style>
