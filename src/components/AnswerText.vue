<script setup lang="ts">
import { computed } from 'vue'
import { parseAnswer } from '@/utils/answer'
import AnswerSegments from '@/components/AnswerSegments.vue'

const props = defineProps<{ text: string; citations: number; active?: number | null }>()
const emit = defineEmits<{ cite: [number] }>()

const blocks = computed(() => parseAnswer(props.text))

/** 小标题层级上限 4：再深在正文里已经看不出层次，不如加粗 */
function headingTag(level: number | undefined): string {
  return 'h' + Math.min(Math.max(level ?? 3, 2), 4)
}

/**
 * 数值单元格：右对齐 + 等宽数字。
 *
 * 为什么只在「整格就是数」时右对齐：中文表里有很多「2025年下半年」这种带年份的列，
 * 整列右对齐会把它们挤到右边、和左边标签拉开一大段空隙，反而更难读。
 */
const NUMERIC_CELL = /^[（(]?[-+]?[\d,，.]+\s*(?:%|％|亿|万元|亿元|元|万|倍|个|人|户|只)?[)）]?$/

function isNumeric(cell: { kind: string; text?: string }[]): boolean {
  const text = cell
    .filter((s) => s.kind === 'text' || s.kind === 'bold')
    .map((s) => s.text ?? '')
    .join('')
    .trim()
  return text.length > 0 && text.length <= 16 && NUMERIC_CELL.test(text)
}
</script>

<template>
  <div class="answer">
    <template v-for="(block, bi) in blocks" :key="bi">
      <component :is="headingTag(block.level)" v-if="block.kind === 'heading'" class="heading">
        <AnswerSegments
          :segments="block.segments"
          :citations="citations"
          :active="active"
          @cite="emit('cite', $event)"
        />
      </component>

      <div v-else-if="block.kind === 'table'" class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th v-for="(cell, ci) in block.header" :key="ci">
                <AnswerSegments
                  :segments="cell"
                  :citations="citations"
                  :active="active"
                  @cite="emit('cite', $event)"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in block.rows" :key="ri">
              <td v-for="(cell, ci) in row" :key="ci" :class="{ num: isNumeric(cell) }">
                <AnswerSegments
                  :segments="cell"
                  :citations="citations"
                  :active="active"
                  @cite="emit('cite', $event)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ol v-else-if="block.kind === 'ordered'" class="ordered">
        <li v-for="(item, ii) in block.items" :key="ii">
          <AnswerSegments
            :segments="item"
            :citations="citations"
            :active="active"
            @cite="emit('cite', $event)"
          />
        </li>
      </ol>

      <ul v-else-if="block.kind === 'bullet'" class="bullet">
        <li v-for="(item, ii) in block.items" :key="ii">
          <AnswerSegments
            :segments="item"
            :citations="citations"
            :active="active"
            @cite="emit('cite', $event)"
          />
        </li>
      </ul>

      <blockquote v-else-if="block.kind === 'quote'" class="quote">
        <AnswerSegments
          :segments="block.segments"
          :citations="citations"
          :active="active"
          @cite="emit('cite', $event)"
        />
      </blockquote>

      <hr v-else-if="block.kind === 'divider'" class="divider" />

      <p v-else class="para">
        <AnswerSegments
          :segments="block.segments"
          :citations="citations"
          :active="active"
          @cite="emit('cite', $event)"
        />
      </p>
    </template>
  </div>
</template>

<style scoped>
.answer {
  font-family: var(--serif);
  font-size: 16.5px;
  line-height: 1.95;
  color: var(--ink);
  letter-spacing: 0.012em;
}

/* 段距 14px：6px 时整篇像一段长文，分不清「这段说结论」和「这段说数据」（阶段 17 D3） */
.para { margin: 0 0 14px; }
.para:last-child { margin-bottom: 0; }

/*
 * 小标题分三级：h2 是一节的标题（## 一、营业总收入），h3 是子节，h4 只是加粗一行。
 * 三级字号必须拉开，否则「五节结构」在屏幕上看起来还是一片同质文字。
 */
.heading {
  margin: 22px 0 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.5;
}

h2.heading { font-size: 20px; }
h3.heading { font-size: 17px; }
h4.heading { font-size: 15.5px; }

.heading:first-child { margin-top: 0; }

.ordered,
.bullet {
  margin: 2px 0 14px;
  padding-left: 22px;
}

.ordered li,
.bullet li { margin: 4px 0; }

/* 注段：左侧 3px 竖线 + 浅底，和正文区分开；不给左边距太大，窄屏会挤 */
.quote {
  margin: 14px 0 0;
  padding: 8px 0 8px 12px;
  border-left: 3px solid var(--rule);
  color: var(--ink-2);
  font-size: 14.5px;
  line-height: 1.85;
}

.divider {
  margin: 18px 0;
  border: 0;
  border-top: 1px solid var(--rule);
}

/* 窄屏横向滚动：7 列的表在手机上是撑不下的，宁可让表格自己滚，也不要撑破整页 */
.table-wrap {
  margin: 8px 0 12px;
  overflow-x: auto;
  border: 1px solid var(--rule);
  border-radius: 8px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14.5px;
  line-height: 1.7;
}

.table th,
.table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--rule);
  text-align: left;
  white-space: nowrap;
}

.table th {
  background: var(--accent-soft);
  font-weight: 600;
  color: var(--ink-2);
}

/* 数字列右对齐 + 等宽：金额逐位对齐才能一眼看出量级差异 */
.table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
}

.table tbody tr:last-child td { border-bottom: 0; }
</style>
