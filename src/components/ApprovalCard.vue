<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * 人工审批卡（HITL）。
 *
 * 三条与后端一致的规则（ST11 §14）：
 * 1) APPROVE 不需要理由；EDIT 与 REJECT **必须**有理由，否则按钮不可点；
 * 2) 决定只能提交一次（提交后按钮全部禁用，等流里的下一段）；
 * 3) 卡片上方就说清「现在还没有答案」—— 审批的是分析计划，不是答案。
 */
const props = defineProps<{ plan: string[]; evidenceCount: number; busy: boolean }>()
const emit = defineEmits<{ decide: [decision: 'APPROVE' | 'EDIT' | 'REJECT', note: string] }>()

const note = ref('')
const trimmed = computed(() => note.value.trim())
const canEdit = computed(() => !props.busy && trimmed.value.length > 0)

function approve(): void {
  if (props.busy) return
  emit('decide', 'APPROVE', '')
}
function edit(): void {
  if (!canEdit.value) return
  emit('decide', 'EDIT', trimmed.value)
}
function reject(): void {
  if (!canEdit.value) return
  emit('decide', 'REJECT', trimmed.value)
}
</script>

<template>
  <section class="approval">
    <header>
      <span class="mark">需要你确认一下理解</span>
      <span class="fa-faint">问题里有多个可能的主体或年份，确认后才会检索并生成</span>
    </header>
    <p v-if="plan.length" class="plan-label">计划：</p>
    <ol v-if="plan.length" class="plan">
      <li v-for="(item, index) in plan" :key="index">{{ item }}</li>
    </ol>
    <p class="fa-faint meta">已检索到 {{ evidenceCount }} 条候选证据</p>

    <textarea
      v-model="note"
      class="note"
      rows="2"
      :disabled="busy"
      placeholder="修改意见 / 驳回理由（EDIT 与 REJECT 必填）"
    />

    <div class="actions">
      <button type="button" class="btn primary" :disabled="busy" @click="approve">通过，生成答案</button>
      <button type="button" class="btn" :disabled="!canEdit" @click="edit">按意见修改</button>
      <button type="button" class="btn danger" :disabled="!canEdit" @click="reject">驳回</button>
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
.plan-label {
  margin: 8px 0 0;
  font-size: 13px;
}
.plan {
  margin: 2px 0 0;
  padding-left: 18px;
  font-size: 13px;
}
.meta {
  margin: 6px 0 8px;
  font-size: 12px;
}
.note {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--rule-strong);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  resize: vertical;
  background: var(--panel);
  color: var(--ink);
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
