<script setup lang="ts">
import { computed } from 'vue'

/** 证据条里的一格。no 是 [E#] 的编号；title 只做 hover 提示，不占宽度。 */
export interface EvidenceItem {
  no: number
  title: string
  page: string
  type: string | null
}

/**
 * 证据条：一行 chip，超出 max 折叠成「+N」。
 *
 * 为什么固定一行（ST13 §6.1）：证据条在流式过程中会先出现（meta 到达），
 * 然后正文才逐字出现。如果它换行、撑高，正文顶端会往下跳 —— 演示时观众会看到页面抖一下。
 * 所以这里 nowrap + 折叠，高度恒定。
 *
 * 两种状态：
 * - 生成中（interactive=false，数据来自 meta.evidence）：只是「证据已就绪」的预览，点了没反应；
 * - 已生成（interactive=true，数据来自 final.citations）：可点，联动右侧证据面板与原页高亮。
 */
const props = defineProps<{
  items: EvidenceItem[]
  active?: number | null
  interactive?: boolean
  max?: number
  /** 折叠处的说明文案，例如「其余 4 条未被引用」 */
  note?: string
}>()

const emit = defineEmits<{ select: [number] }>()

const shown = computed(() => props.items.slice(0, props.max ?? 4))
const rest = computed(() => Math.max(0, props.items.length - shown.value.length))
</script>

<template>
  <div v-if="items.length" class="strip">
    <span class="fa-eyebrow label">证据</span>
    <button
      v-for="item in shown"
      :key="item.no"
      type="button"
      class="chip"
      :class="{ on: interactive && active === item.no, ghost: !interactive }"
      :disabled="!interactive"
      :title="item.title"
      @click="emit('select', item.no)"
    >
      <span class="no fa-num">E{{ item.no }}</span>
      <span v-if="item.type" class="type">{{ item.type }}</span>
      <span class="page fa-num">{{ item.page }}</span>
    </button>
    <span v-if="rest" class="more fa-num">+{{ rest }}</span>
    <span v-if="note" class="note">{{ note }}</span>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  overflow: hidden;
  white-space: nowrap;
}

.label { flex: 0 0 auto; }

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--rule-strong);
  border-radius: 999px;
  background: var(--paper-raised);
  color: var(--ink-2);
  font-size: 11px;
  cursor: pointer;
  transition: border-color 160ms var(--ease), background 160ms var(--ease), color 160ms var(--ease);
}

.chip:hover:not(:disabled) {
  border-color: var(--ink-4);
  color: var(--ink);
}

.chip.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-strong);
}

.chip.ghost {
  cursor: default;
  opacity: 0.85;
}

.no { font-weight: 600; }
.type { color: var(--ink-3); }
.page { color: var(--ink-3); }
.chip.on .type, .chip.on .page { color: var(--accent-strong); }

.more {
  font-size: 11px;
  color: var(--ink-4);
}

.note {
  font-size: 10.5px;
  color: var(--ink-4);
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
