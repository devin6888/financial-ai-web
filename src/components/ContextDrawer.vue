<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { patchContext } from '@/api/conversations'
import type { ContextView, SelectableDocument } from '@/api/types'
import { describe } from '@/stores/session'

/**
 * 会话结构化上下文（conversation_context）的查看与编辑。
 *
 * 为什么公司只能看不能改：ContextPatch 要的是 company_id（数据库主键），
 * 而界面里用户只知道证券代码/公司名。硬要改就得先加一个「代码 -> id」的端点，
 * 属于为一个小功能扩接口；公司本来也会被第一轮的 CompanyResolver 自动填上（C13）。
 * 年份 / 文档 / 当前指标这三项用户最常纠正，所以开放编辑。
 */
const props = defineProps<{
  modelValue: boolean
  conversationId: number | null
  context: ContextView | null
  docs: SelectableDocument[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved', value: ContextView): void
}>()

const yearFrom = ref<number | null>(null)
const yearTo = ref<number | null>(null)
const documentIds = ref<number[]>([])
const currentMetric = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

watch(
  () => [props.modelValue, props.context] as const,
  ([open, ctx]) => {
    if (!open) {
      return
    }
    yearFrom.value = ctx?.yearFrom ?? null
    yearTo.value = ctx?.yearTo ?? null
    documentIds.value = ctx?.documentIds ?? []
    currentMetric.value = ctx?.currentMetric ?? ''
    error.value = null
  },
  { immediate: true },
)

async function save(): Promise<void> {
  if (!props.conversationId) {
    return
  }
  saving.value = true
  error.value = null
  try {
    const updated = await patchContext(props.conversationId, {
      yearFrom: yearFrom.value,
      yearTo: yearTo.value,
      documentIds: documentIds.value,
      currentMetric: currentMetric.value.trim() || null,
    })
    emit('saved', updated)
    visible.value = false
  } catch (e) {
    error.value = describe(e)
  } finally {
    saving.value = false
  }
}

async function clear(): Promise<void> {
  if (!props.conversationId) {
    return
  }
  saving.value = true
  error.value = null
  try {
    const updated = await patchContext(props.conversationId, { clear: true })
    emit('saved', updated)
    visible.value = false
  } catch (e) {
    error.value = describe(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-drawer v-model="visible" title="会话上下文" size="420px">
    <p class="intro">
      指代消解用的槽位。下一轮问「那净利润呢」时，后端会用这里的公司和年份补全问题。
      系统只采用与本轮问题不冲突的槽位（冲突会加 <code>context_inferred_ignored_*</code> 警告）。
    </p>

    <el-form label-width="96px" label-position="left">
      <el-form-item label="公司">
        <el-input
          :model-value="context?.companyName ? context.companyName + '（' + (context.companyCode ?? '') + '）' : '未识别'"
          disabled
        />
      </el-form-item>

      <el-form-item label="年份区间">
        <div class="years">
          <el-input-number v-model="yearFrom" :min="1990" :max="2100" placeholder="起始年" />
          <span class="dash">–</span>
          <el-input-number v-model="yearTo" :min="1990" :max="2100" placeholder="结束年" />
        </div>
      </el-form-item>

      <el-form-item label="文档">
        <el-select v-model="documentIds" multiple filterable collapse-tags placeholder="不限定" class="full">
          <el-option v-for="doc in docs" :key="doc.id" :label="doc.title" :value="doc.id" />
        </el-select>
      </el-form-item>

      <el-form-item label="当前指标">
        <el-input v-model="currentMetric" placeholder="例如：净利润" />
      </el-form-item>
    </el-form>

    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="error" />

    <div class="actions">
      <el-button :loading="saving" @click="clear">清空上下文</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </div>
  </el-drawer>
</template>

<style scoped>
.intro {
  margin: 0 0 16px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--fa-text-weak);
}

.years {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dash {
  color: var(--fa-text-weak);
}

.full {
  width: 100%;
}

.error {
  margin-bottom: 12px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
</style>
