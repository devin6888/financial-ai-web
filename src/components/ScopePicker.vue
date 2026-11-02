<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChatScope, SelectableDocument } from '@/api/types'

const props = defineProps<{ scope: ChatScope; docs: SelectableDocument[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:scope': [value: ChatScope] }>()

const open = ref(false)

function clone(): ChatScope {
  return {
    kind: props.scope.kind,
    documentIds: [...props.scope.documentIds],
    query: {
      companyCodes: [...props.scope.query.companyCodes],
      years: [...props.scope.query.years],
      docTypes: [...props.scope.query.docTypes],
      industries: [...props.scope.query.industries],
    },
  }
}

function setKind(kind: ChatScope['kind']): void {
  emit('update:scope', { ...clone(), kind })
}

function setDocs(ids: number[]): void {
  emit('update:scope', { ...clone(), documentIds: ids })
}

function setCompanyCodes(codes: string[]): void {
  const next = clone()
  next.query.companyCodes = codes
  emit('update:scope', next)
}

function setYears(values: (number | undefined)[]): void {
  const next = clone()
  next.query.years = values.filter((v): v is number => typeof v === 'number')
  emit('update:scope', next)
}

function setDocTypes(values: string[]): void {
  const next = clone()
  next.query.docTypes = values
  emit('update:scope', next)
}

const DOC_TYPE_OPTIONS = [
  { value: 'ANNUAL', label: '年报' },
  { value: 'SEMI_ANNUAL', label: '半年报' },
  { value: 'Q1', label: '一季报' },
  { value: 'Q3', label: '三季报' },
]

const label = computed(() => {
  const s = props.scope
  if (s.kind === 'CORPUS') return '全库检索'
  if (s.kind === 'DOCUMENTS') return s.documentIds.length ? s.documentIds.length + ' 份指定文档' : '未选文档'
  const parts: string[] = []
  if (s.query.companyCodes.length) parts.push(s.query.companyCodes.join('/'))
  if (s.query.years.length) parts.push(s.query.years.join('/'))
  if (s.query.docTypes.length) parts.push(s.query.docTypes.map((t) => DOC_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t).join('/'))
  return parts.length ? '条件 · ' + parts.join(' · ') : '条件范围（未设条件=全库）'
})

const docOptions = computed(() =>
  props.docs.map((d) => ({
    value: d.id,
    label: d.title,
    meta: [d.companyName, d.docYear ? d.docYear + '年' : null].filter(Boolean).join(' · '),
  })),
)
</script>

<template>
  <el-popover v-model:visible="open" placement="bottom-start" :width="372" trigger="click" popper-class="scope-pop">
    <template #reference>
      <button class="scope-btn" :disabled="disabled" type="button">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4c3 4 3 12 0 16M12 4c-3 4-3 12 0 16" />
        </svg>
        <span class="scope-label">{{ label }}</span>
        <svg class="chev" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </template>

    <div class="pop">
      <div class="pop-head">
        <span class="fa-eyebrow">检索范围</span>
        <span class="fa-faint pop-tip">只影响本轮提问</span>
      </div>

      <div class="kinds">
        <button
          v-for="option in [{ v: 'CORPUS', t: '全库', d: '所有可检索文档' }, { v: 'DOCUMENTS', t: '选文档', d: '指定几份' }, { v: 'FILTER', t: '按条件', d: '公司/年份/类型' }]"
          :key="option.v"
          class="kind"
          :class="{ on: scope.kind === option.v }"
          type="button"
          @click="setKind(option.v as ChatScope['kind'])"
        >
          <span class="kind-t">{{ option.t }}</span>
          <span class="kind-d">{{ option.d }}</span>
        </button>
      </div>

      <div v-if="scope.kind === 'DOCUMENTS'" class="field">
        <label class="fa-eyebrow">文档</label>
        <el-select
          :model-value="scope.documentIds"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          placeholder="选择已就绪的文档"
          style="width: 100%"
          @update:model-value="(v: number[]) => setDocs(v)"
        >
          <el-option v-for="opt in docOptions" :key="opt.value" :value="opt.value" :label="opt.label">
            <div class="opt">
              <span>{{ opt.label }}</span>
              <span class="fa-faint">{{ opt.meta }}</span>
            </div>
          </el-option>
        </el-select>
      </div>

      <div v-else-if="scope.kind === 'FILTER'" class="field">
        <label class="fa-eyebrow">公司代码</label>
        <el-select
          :model-value="scope.query.companyCodes"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="如 300059，可多选"
          style="width: 100%"
          @update:model-value="(v: string[]) => setCompanyCodes(v)"
        >
          <el-option v-for="code in ['300059', '600519']" :key="code" :value="code" :label="code" />
        </el-select>

        <label class="fa-eyebrow">年份区间</label>
        <div class="years">
          <el-input-number
            :model-value="scope.query.years[0]"
            :min="2000"
            :max="2100"
            :controls="false"
            placeholder="起"
            @update:model-value="(v: number | undefined) => setYears([v, scope.query.years[1]])"
          />
          <span class="fa-faint">—</span>
          <el-input-number
            :model-value="scope.query.years[1]"
            :min="2000"
            :max="2100"
            :controls="false"
            placeholder="止"
            @update:model-value="(v: number | undefined) => setYears([scope.query.years[0], v])"
          />
        </div>

        <label class="fa-eyebrow">报告类型</label>
        <el-select
          :model-value="scope.query.docTypes"
          multiple
          placeholder="不限"
          style="width: 100%"
          @update:model-value="(v: string[]) => setDocTypes(v)"
        >
          <el-option v-for="opt in DOC_TYPE_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
        </el-select>
      </div>

      <div class="pop-foot">
        <span class="fa-faint">{{ docs.length }} 份文档可检索</span>
        <button class="fa-btn fa-btn--sm" type="button" @click="open = false">完成</button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.scope-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--rule-strong);
  background: var(--paper-raised);
  color: var(--ink-2);
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  max-width: 360px;
}

.scope-btn:hover { border-color: var(--ink-4); }
.scope-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.scope-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chev { color: var(--ink-4); }

.pop { display: flex; flex-direction: column; gap: 12px; }
.pop-head { display: flex; align-items: baseline; justify-content: space-between; }
.pop-tip { font-size: 10.5px; }

.kinds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }

.kind {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 9px;
  border: 1px solid var(--rule);
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}

.kind:hover { background: var(--paper-sink); }
.kind.on { border-color: var(--accent); background: var(--accent-soft); }
.kind-t { font-size: 12.5px; color: var(--ink); }
.kind-d { font-size: 10.5px; color: var(--ink-4); }

.field { display: flex; flex-direction: column; gap: 5px; }
.field label { margin-top: 2px; }
.years { display: flex; align-items: center; gap: 8px; }
.years :deep(.el-input-number) { flex: 1; }
.opt { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; }

.pop-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--rule);
  padding-top: 10px;
  font-size: 11px;
}
</style>