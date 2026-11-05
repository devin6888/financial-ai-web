<script setup lang="ts">
import { computed } from 'vue'
import type { Fact } from '@/api/types'
import { uniqueFacts } from '@/utils/facts'

const props = defineProps<{ facts: Fact[] }>()

/** 去重规则与「复制为 Markdown」共用一份（见 utils/facts.ts）：页面几行，复制就几行。 */
const unique = computed<Fact[]>(() => uniqueFacts(props.facts))
</script>

<template>
  <div v-if="unique.length" class="facts">
    <div class="fa-rule-label head">数值</div>
    <table class="tbl">
      <thead>
        <tr>
          <th class="metric">指标</th>
          <th class="period">期间</th>
          <th class="value">数值</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(fact, i) in unique" :key="i">
          <td class="metric">
            <span>{{ fact.metric }}</span>
            <span v-if="fact.scope" class="sub">{{ fact.scope }}</span>
          </td>
          <td class="period fa-num">{{ fact.period }}</td>
          <td class="value">
            <span class="fa-num num">{{ fact.value }}</span>
            <span v-if="fact.unit" class="unit">{{ fact.unit }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.facts { margin-top: 16px; }
.head { margin-bottom: 6px; }

.tbl { width: 100%; border-collapse: collapse; }

th {
  text-align: left;
  font-weight: 500;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-4);
  padding: 0 0 6px;
  border-bottom: 1px solid var(--rule-strong);
}

td {
  padding: 8px 0;
  border-bottom: 1px solid var(--rule);
  vertical-align: baseline;
}

.metric { width: 42%; font-size: 12.5px; color: var(--ink-2); }
.metric .sub { display: block; font-size: 10.5px; color: var(--ink-4); margin-top: 1px; }
.period { width: 20%; font-size: 11.5px; color: var(--ink-3); }
.value { text-align: right; }
.num { font-size: 14px; color: var(--ink); }
.unit { font-size: 10.5px; color: var(--ink-4); margin-left: 4px; }
</style>