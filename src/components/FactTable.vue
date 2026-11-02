<script setup lang="ts">
import { computed } from 'vue'
import type { Fact } from '@/api/types'

const props = defineProps<{ facts: Fact[] }>()

/**
 * 同一条事实常常被多份证据各抽一次（同一张表在相邻块里重复出现），
 * 直接渲染会得到四行一模一样的结果，看起来像 bug。这里按「指标 + 期间 + 数值 + 单位 + 口径」
 * 去重，保留首次出现的位置。
 */
const unique = computed<Fact[]>(() => {
  const seen = new Set<string>()
  const out: Fact[] = []
  for (const fact of props.facts) {
    const key = [fact.metric, fact.period, fact.value, fact.unit ?? '', fact.scope ?? ''].join('\u0001')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(fact)
  }
  return out
})
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