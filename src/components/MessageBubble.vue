<script setup lang="ts">
import { computed, provide } from 'vue'
import type { ChatResponse } from '@/api/types'
import type { ChatMessage } from '@/types/ui'
import AnswerText from '@/components/AnswerText.vue'
import EvidenceStrip, { type EvidenceItem } from '@/components/EvidenceStrip.vue'
import FactTable from '@/components/FactTable.vue'
import AgentTimeline from '@/components/AgentTimeline.vue'
import ApprovalCard from '@/components/ApprovalCard.vue'
import StageLine from '@/components/StageLine.vue'
import CopyAnswerButton from '@/components/CopyAnswerButton.vue'
import { labelForWarning } from '@/labels'
import { CITE_SOURCE } from '@/utils/citeSource'

const props = defineProps<{ message: ChatMessage; activeCite: number | null }>()
const emit = defineEmits<{
  cite: [number]
  chip: [number]
  panel: []
  decide: [decision: 'APPROVE' | 'EDIT' | 'REJECT', note: string]
}>()

const response = computed<ChatResponse | null>(() => props.message.response ?? null)
const citations = computed(() => response.value?.citations ?? [])

// 角标只认「第 N 条」这个序号，正文里写的是 [E3]；真正要打开的 chunk 在这里查
provide(CITE_SOURCE, computed(() => citations.value.map((c) => c.childChunkId ?? null)))

const CONFIDENCE: Record<string, { text: string; cls: string }> = {
  high: { text: '高置信', cls: 'fa-chip--ok' },
  medium: { text: '中置信', cls: 'fa-chip--warn' },
  low: { text: '低置信', cls: 'fa-chip--warn' },
  insufficient: { text: '证据不足', cls: 'fa-chip--accent' },
}

const confidence = computed(() => {
  const raw = response.value?.confidence
  if (!raw) return null
  return CONFIDENCE[raw] ?? { text: raw, cls: 'fa-chip--mute' }
})

const hasInlineCite = computed(() => /\[E\d+\]/.test(props.message.text))
const assumed = computed(() => citations.value.length > 0 && !hasInlineCite.value)

/** 生成中：证据已确定（meta 到达）但 answer 还没来 —— 先把证据摆出来，用户不用干等 */
const previewItems = computed<EvidenceItem[]>(() => {
  if (response.value) return []
  return (props.message.evidencePreview ?? []).map((item) => ({
    no: item.no,
    title: item.docTitle ?? '',
    page: pageText(item),
    type: typeLabel[item.evidenceType ?? ''] ?? item.evidenceType,
  }))
})

/** meta 给的是候选全集，final 只保留模型真用到的：差多少要说清，否则观众以为证据丢了 */
const droppedNote = computed(() => {
  const preview = props.message.evidencePreview?.length ?? 0
  const used = citations.value.length
  if (!response.value || preview <= used) return ''
  return '其余 ' + (preview - used) + ' 条未被引用'
})
/** 本轮总耗时：流式结束时 ChatView 写入 message.timings.totalMs；历史消息没有这项就不显示 */
const elapsed = computed(() => {
  const ms = props.message.timings?.totalMs
  if (ms == null || ms <= 0) return ''
  return '用时 ' + (ms / 1000).toFixed(1) + 's'
})

const warnings = computed(() => (response.value?.warnings ?? []).filter((code) => code !== 'evidence_insufficient'))

const typeLabel: Record<string, string> = { TABLE: '表格', TEXT: '正文', NARRATIVE: '叙述' }

function pageText(c: { pageStart: number | null; pageEnd: number | null }): string {
  if (c.pageStart == null) return '—'
  return c.pageStart === c.pageEnd || c.pageEnd == null ? '第 ' + c.pageStart + ' 页' : '第 ' + c.pageStart + '-' + c.pageEnd + ' 页'
}

function timeText(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}
</script>

<template>
  <!-- 用户提问：右对齐气泡（朱砂淡底），「问」印章在右侧；气泡内文字仍左对齐，长句才好读 -->
  <article v-if="message.role === 'USER'" class="entry user fa-fade-up">
    <div class="body">
      <p class="question">{{ message.text }}</p>
      <div class="meta"><span class="fa-num">{{ timeText(message.at) }}</span></div>
    </div>

  </article>

  <article v-else class="entry answer fa-fade-up">
    <div class="body">
      <div class="brand">
        <span class="app-mark" aria-label="lora">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
            <path d="M4 19V7l8-3 8 3v12" />
            <path d="M4 19h16M9 19v-5h6v5" />
          </svg>
        </span>
        <span class="brand-name">lora</span>
      </div>
      <div class="head">
        <span v-if="confidence" class="fa-chip" :class="confidence.cls">{{ confidence.text }}</span>
        <StageLine
          v-if="message.pending"
          :phase="message.stage?.phase ?? null"
          :label="message.stage?.label ?? null"
          :started-at="message.at"
        />
        <span v-if="elapsed" class="fa-num when">{{ elapsed }}</span>
      </div>

      <AgentTimeline v-if="message.agent" :agent="message.agent" />

      <ApprovalCard
        v-if="message.agent?.status === 'WAITING_APPROVAL'"
        :plan="message.agent.plan"
        :evidence-count="message.agent.evidence.length"
        :busy="message.agentBusy === true"
        @decide="(decision, note) => emit('decide', decision, note)"
      />

      <EvidenceStrip v-if="previewItems.length" class="preview" :items="previewItems" :max="4" />

      <div v-if="message.pending && !message.text" class="skeleton">
        <div class="fa-skeleton" style="height: 15px; width: 92%" />
        <div class="fa-skeleton" style="height: 15px; width: 78%" />
        <div class="fa-skeleton" style="height: 15px; width: 46%" />
      </div>

      <div v-else-if="message.error" class="error">
        <span class="error-tag">本轮失败</span>
        <p>{{ message.error }}</p>
      </div>

      <template v-else>
        <div class="answer-body" :class="{ live: message.streaming }">
          <AnswerText
            :text="message.text"
            :citations="citations.length"
            :active="activeCite"
            @cite="emit('cite', $event)"
          />
          <span v-if="message.streaming" class="caret" aria-hidden="true" />
        </div>

        <FactTable :facts="response?.facts ?? []" />

        <p v-if="assumed" class="assume">正文未标注编号，下面按顺序对应证据 E1–E{{ citations.length }}。</p>

        <p v-if="response?.note" class="note">{{ response.note }}</p>

        <div v-if="response && !message.streaming" class="actions">
          <span v-if="droppedNote" class="fa-faint dropped">{{ droppedNote }}</span>
          <CopyAnswerButton :answer="message.text" :citations="citations" :streaming="message.streaming" />
          <button type="button" class="link" @click="emit('panel')">诊断</button>
        </div>

        <!-- 警告只在正文里露第一条，其余收进右侧诊断：两边都铺开会让同一条提示出现两次 -->
        <div v-if="warnings.length" class="warns">
          <span class="warn">{{ labelForWarning(warnings[0] ?? '') }}</span>
          <span v-if="warnings.length > 1" class="fa-faint more">等 {{ warnings.length }} 条</span>
          <button type="button" class="link" @click="emit('panel')">看诊断</button>
        </div>
      </template>
    </div>
  </article>
</template>

<style scoped>
.entry {
  padding: 18px 0 20px;
}

/* 不再用横线分隔（2026-10-30 ST18 需求 3）：相邻两条之间只留白，同一轮问答再紧一点 */
.entry + .entry { margin-top: 2px; }
.entry.user + .entry.answer { padding-top: 6px; }
.entry.user { display: flex; justify-content: flex-end; }

.gutter { padding-top: 2px; display: none; }

/* 只在答案前面留一个应用图标（需求 7）：问句不再有印章，靠右对齐区分 */
.brand {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
}

.brand-name {
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--ink-2);
  line-height: 1;
}

.app-mark {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--rule-strong);
  border-radius: 7px;
  background: var(--paper-raised);
  color: var(--accent);
}

.body { min-width: 0; }

/* 宽度必须是「整行」，否则 flex 项的 shrink-to-fit 会让 `.question` 的 78% 去参照一个已经很窄的盒子，
   表现就是问句被压成两三个字一行（2026-10-30 现场反馈） */
.user .body { width: 100%; display: flex; flex-direction: column; align-items: flex-end; }

.question {
  margin: 0;
  padding: 8px 13px 9px;
  max-width: 78%;
  width: fit-content;
  background: var(--accent-soft);
  border: 1px solid rgba(178, 58, 40, 0.18);
  border-radius: var(--radius) var(--radius) 5px var(--radius);
  font-size: 13.5px;
  line-height: 1.65;
  font-weight: 500;
  color: var(--ink);
  text-align: left;
  letter-spacing: 0.01em;
}

.answer .body { width: 100%; }

.meta { margin-top: 6px; font-size: 10.5px; color: var(--ink-4); }
.user .meta { text-align: right; }

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  min-height: 22px;
}

.when { margin-left: auto; font-size: 10.5px; color: var(--ink-4); }

.link {
  background: transparent;
  border: 0;
  padding: 0;
  font-size: 11px;
  color: var(--ink-4);
  cursor: pointer;
  border-bottom: 1px solid var(--rule-strong);
}

.link:hover { color: var(--accent); border-color: var(--accent); }

.skeleton { display: flex; flex-direction: column; gap: 9px; padding-top: 4px; }

.error { border-left: 2px solid var(--accent); padding: 6px 0 6px 12px; }
.error-tag { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; color: var(--accent); text-transform: uppercase; }
.error p { margin: 4px 0 0; font-size: 12.5px; color: var(--ink-2); }

.preview { margin-bottom: 10px; }
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--rule);
}
.actions :deep(.copy), .actions .link { margin-left: 0; }
.actions .dropped { margin-right: auto; font-size: 11px; }

.assume { margin: 12px 0 0; font-size: 11px; color: var(--gold); }

/* 流式时在最后一行末尾放一根光标，读起来像「正在写」；不改变排版（inline-block 跟在文字后） */
.answer-body { position: relative; }
.caret {
  display: inline-block;
  width: 2px;
  height: 15px;
  margin-left: 2px;
  vertical-align: -2px;
  background: var(--accent);
  animation: fa-caret 1s steps(2, start) infinite;
}

@keyframes fa-caret { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }

.note {
  margin: 12px 0 0;
  padding: 9px 12px;
  background: var(--paper-sink);
  border-left: 2px solid var(--rule-strong);
  border-radius: 0 8px 8px 0;
  font-size: 12px;
  color: var(--ink-2);
  line-height: 1.75;
}

.warns { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 12px; }
.warn { font-size: 11px; color: var(--ink-3); display: inline-flex; align-items: center; gap: 5px; }
.warn::before { content: ""; width: 4px; height: 4px; border-radius: 50%; background: var(--gold); }
.more { font-size: 11px; }
</style>