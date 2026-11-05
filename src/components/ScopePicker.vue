<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChatScope, SelectableDocument } from '@/api/types'

const props = defineProps<{ scope: ChatScope; docs: SelectableDocument[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:scope': [value: ChatScope] }>()

const open = ref(false)
const codeDraft = ref('')

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

/**
 * 勾选全部走「就地切换」，不再用 el-select 的弹出面板。
 *
 * 原来那三个多选框是 el-select，下拉面板 portal 到 body 上：
 * 点第一份文档时，这次点击落在 popover 内容之外 → popover 判定「点了外面」直接收起，
 * 选完一份就得重新展开一次。改成内联清单后，点击发生在 popover 内部，面板不会关。
 */
function toggleDoc(id: number): void {
  const ids = [...props.scope.documentIds]
  const at = ids.indexOf(id)
  if (at >= 0) ids.splice(at, 1)
  else ids.push(id)
  setDocs(ids)
}

function toggleCode(code: string): void {
  const codes = [...props.scope.query.companyCodes]
  const at = codes.indexOf(code)
  if (at >= 0) codes.splice(at, 1)
  else codes.push(code)
  setCompanyCodes(codes)
}

function addCode(): void {
  const v = codeDraft.value.trim()
  if (!/^\d{6}$/.test(v)) return
  if (!props.scope.query.companyCodes.includes(v)) toggleCode(v)
  codeDraft.value = ''
}

function toggleDocType(value: string): void {
  const types = [...props.scope.query.docTypes]
  const at = types.indexOf(value)
  if (at >= 0) types.splice(at, 1)
  else types.push(value)
  setDocTypes(types)
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
        <div class="field-head">
          <label class="fa-eyebrow">文档</label>
          <span class="fa-faint field-tip">点一下加，再点一下去掉</span>
        </div>

        <div class="picklist" role="group" aria-label="选择文档">
          <button
            v-for="opt in docOptions"
            :key="opt.value"
            type="button"
            class="pick"
            :class="{ on: scope.documentIds.includes(opt.value) }"
            :aria-pressed="scope.documentIds.includes(opt.value)"
            @click="toggleDoc(opt.value)"
          >
            <span class="box" aria-hidden="true">
              <svg v-if="scope.documentIds.includes(opt.value)" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3">
                <path d="M5 12.5l4.5 4.5L19 7" />
              </svg>
            </span>
            <span class="pick-main">
              <span class="pick-t">{{ opt.label }}</span>
              <span class="pick-d">{{ opt.meta }}</span>
            </span>
          </button>
          <p v-if="!docOptions.length" class="fa-faint pick-empty">还没有已就绪的文档。</p>
        </div>
      </div>

      <div v-else-if="scope.kind === 'FILTER'" class="field">
        <label class="fa-eyebrow">公司代码</label>
        <div class="tagbar">
          <span v-for="code in scope.query.companyCodes" :key="code" class="tag">
            {{ code }}
            <button type="button" class="tag-x" :aria-label="'移除 ' + code" @click="toggleCode(code)">×</button>
          </span>
          <input
            v-model="codeDraft"
            class="tag-input"
            inputmode="numeric"
            placeholder="输入 6 位代码，回车"
            @keydown.enter.prevent="addCode"
          />
        </div>
        <div class="presets">
          <button
            v-for="code in ['300059', '600519']"
            :key="code"
            type="button"
            class="preset"
            :class="{ on: scope.query.companyCodes.includes(code) }"
            @click="toggleCode(code)"
          >
            {{ scope.query.companyCodes.includes(code) ? '✓ ' : '+ ' }}{{ code }}
          </button>
        </div>

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
        <div class="chips">
          <button
            v-for="opt in DOC_TYPE_OPTIONS"
            :key="opt.value"
            type="button"
            class="chip"
            :class="{ on: scope.query.docTypes.includes(opt.value) }"
            @click="toggleDocType(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
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

.field { display: flex; flex-direction: column; gap: 6px; }
.field label { margin-top: 2px; }
.field-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.field-tip { font-size: 10.5px; }

/* 文档：内联清单，点一次勾一个，面板不关 */
.picklist {
  display: flex;
  flex-direction: column;
  max-height: 176px;
  overflow-y: auto;
  border: 1px solid var(--rule);
  border-radius: 10px;
  background: var(--paper-raised);
  padding: 4px;
}

.pick {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.pick:hover { background: var(--paper-sink); }
.pick.on { background: var(--accent-soft); }

.box {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 15px;
  height: 15px;
  margin-top: 2px;
  border: 1px solid var(--rule-strong);
  border-radius: 4px;
  background: var(--paper-raised);
  color: var(--paper-raised);
}

.pick.on .box { border-color: var(--accent); background: var(--accent); }

.pick-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pick-t { font-size: 12.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pick-d { font-size: 10.5px; color: var(--ink-4); }
.pick-empty { padding: 10px; font-size: 11.5px; }

/* 公司代码：标签 + 输入框，回车添加 */
.tagbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  padding: 5px 6px;
  border: 1px solid var(--rule);
  border-radius: 8px;
  background: var(--paper-raised);
  min-height: 34px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 3px 1px 8px;
  border-radius: 999px;
  background: var(--paper-sink);
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-2);
}

.tag-x {
  border: 0;
  background: transparent;
  padding: 0 4px;
  color: var(--ink-4);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.tag-x:hover { color: var(--accent); }

.tag-input {
  flex: 1;
  min-width: 110px;
  border: 0;
  background: transparent;
  font-size: 12px;
  color: var(--ink);
  outline: none;
}

.tag-input::placeholder { color: var(--ink-4); }

.presets { display: flex; gap: 6px; }

.preset {
  border: 1px solid var(--rule);
  background: transparent;
  border-radius: 999px;
  padding: 2px 9px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-3);
  cursor: pointer;
}

.preset:hover { border-color: var(--ink-4); }
.preset.on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

/* 报告类型：多选胶囊 */
.chips { display: flex; flex-wrap: wrap; gap: 6px; }

.chip {
  border: 1px solid var(--rule);
  background: transparent;
  border-radius: 999px;
  padding: 3px 11px;
  font-size: 11.5px;
  color: var(--ink-3);
  cursor: pointer;
}

.chip:hover { border-color: var(--ink-4); }
.chip.on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

.years { display: flex; align-items: center; gap: 8px; }
.years :deep(.el-input-number) { flex: 1; }

.pop-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--rule);
  padding-top: 10px;
  font-size: 11px;
}
</style>
