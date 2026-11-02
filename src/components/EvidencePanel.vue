<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import { fetchPageImage } from '@/api/documents'
import type { ChatTrace, Citation } from '@/api/types'
import { labelForWarning } from '@/labels'

const props = defineProps<{
  citations: Citation[]
  active: number | null
  warnings: string[]
  trace: ChatTrace | null
  sufficient: boolean
  note: string | null
  tab?: 'evidence' | 'diagnose' | 'page'
}>()

const emit = defineEmits<{ close: []; select: [number] }>()

type PanelTab = 'evidence' | 'diagnose' | 'page'

const tab = ref<PanelTab>(props.tab ?? 'evidence')

watch(
  () => props.tab,
  (value) => {
    if (value) tab.value = value
  },
)

watch(
  () => props.active,
  (value) => {
    if (value) tab.value = 'evidence'
  },
)

const selected = computed<Citation | null>(() => {
  if (!props.active) return props.citations[0] ?? null
  return props.citations[props.active - 1] ?? null
})


// ------------------------------------------------------------ 原文页（阶段 12）

const pageNo = ref<number | null>(null)
const pageUrl = ref<string | null>(null)
const pageSize = ref<{ w: number; h: number } | null>(null)
const pageLoading = ref(false)
const pageError = ref<string | null>(null)
/** blob URL 必须显式回收，否则每翻一页内存里就多一张 300 KB 的图 */
let objectUrl: string | null = null

/** 当前页上要画的框：bbox 是归一化坐标（0~1），按百分比定位直接能用。 */
const boxes = computed(() => {
  const list = selected.value?.bbox ?? []
  const page = pageNo.value
  if (!page) return []
  return list.filter((b) => b.page === page)
})

async function loadPage(documentId: number, page: number): Promise<void> {
  pageLoading.value = true
  pageError.value = null
  try {
    const image = await fetchPageImage(documentId, page)
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = image.url
    pageUrl.value = image.url
    pageSize.value = image.width && image.height ? { w: image.width, h: image.height } : null
    pageNo.value = page
  } catch (e) {
    pageUrl.value = null
    pageNo.value = page
    pageError.value = e instanceof ApiError ? e.message : '原文页加载失败'
  } finally {
    pageLoading.value = false
  }
}

/** 打开当前选中证据所在的页；多页块先落在 pageStart。 */
function openSelectedPage(): void {
  const c = selected.value
  if (!c || c.pageStart == null) return
  if (pageNo.value === c.pageStart && pageUrl.value) return
  void loadPage(c.documentId, c.pageStart)
}

function turnPage(delta: number): void {
  const c = selected.value
  if (!c || pageNo.value == null) return
  const next = pageNo.value + delta
  if (next < 1) return
  void loadPage(c.documentId, next)
}

watch(tab, (value) => {
  if (value === 'page') openSelectedPage()
})

// 换证据时如果正停在原文页签，直接翻到新证据那页
watch(
  () => props.active,
  () => {
    if (tab.value === 'page') openSelectedPage()
  },
)

onBeforeUnmount(() => {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
})

const EVIDENCE_TYPE: Record<string, string> = { TABLE: '表格', TEXT: '正文', NARRATIVE: '叙述' }

function pageText(c: Citation): string {
  if (c.pageStart == null) return '未标注页码'
  return c.pageStart === c.pageEnd || c.pageEnd == null ? '第 ' + c.pageStart + ' 页' : '第 ' + c.pageStart + '-' + c.pageEnd + ' 页'
}

function rowText(c: Citation): string {
  const ref = c.tableRef
  if (!ref || ref.rowStart == null) return ''
  return ref.rowEnd && ref.rowEnd !== ref.rowStart ? '第 ' + ref.rowStart + '-' + ref.rowEnd + ' 行' : '第 ' + ref.rowStart + ' 行'
}

const metrics = computed(() => {
  const t = props.trace
  if (!t) return []
  const rows: { k: string; v: string }[] = []
  rows.push({ k: 'trace', v: t.traceId })
  if (t.retrieval) {
    rows.push({ k: '查询类型', v: t.retrieval.queryType ?? '—' })
    rows.push({ k: '路由', v: t.retrieval.quRoute + (t.retrieval.quDegraded ? ' (降级)' : '') })
    rows.push({ k: '检索式', v: t.retrieval.query })
    rows.push({ k: 'Dense / Sparse', v: t.retrieval.denseHits + ' / ' + t.retrieval.sparseHits })
    rows.push({ k: '融合 / 返回', v: t.retrieval.fusedCount + ' / ' + t.retrieval.returned })
    rows.push({ k: '精排', v: t.retrieval.rerankStatus + (t.retrieval.rerankModel ? ' · ' + t.retrieval.rerankModel : '') })
    rows.push({ k: '召回耗时', v: 'dense ' + t.retrieval.denseMs + 'ms · sparse ' + t.retrieval.sparseMs + 'ms · fuse ' + t.retrieval.fuseMs + 'ms · rerank ' + t.retrieval.rerankMs + 'ms' })
  }
  rows.push({ k: '上下文', v: t.contextBlocks + ' 块 / ' + t.contextTokens + ' tokens' })
  rows.push({ k: '引用', v: '保留 ' + t.citationsEmitted + ' · 丢弃 ' + t.citationsDropped })
  rows.push({ k: '耗时', v: '上下文 ' + t.contextMs + 'ms · 生成 ' + t.answerMs + 'ms' })
  rows.push({ k: '记忆', v: '短期 ' + t.memory.shortTermMessages + ' · 摘要 ' + t.memory.summaryChars + ' 字 · 长期 ' + t.memory.longTermItems + (t.memory.gateHit ? ' · 闸门命中' : '') })
  return rows
})
</script>

<template>
  <aside class="panel fa-slide-in" aria-label="证据与诊断">
    <header class="panel-head">
      <div class="tabs">
        <button type="button" class="tab" :class="{ on: tab === 'evidence' }" @click="tab = 'evidence'">
          证据 <span class="fa-num n">{{ citations.length }}</span>
        </button>
        <button
          v-if="citations.length"
          type="button"
          class="tab"
          :class="{ on: tab === 'page' }"
          @click="tab = 'page'"
        >原文</button>
        <button type="button" class="tab" :class="{ on: tab === 'diagnose' }" @click="tab = 'diagnose'">诊断</button>
      </div>
      <button class="fa-icon-btn" title="收起面板（Esc）" aria-label="收起" @click="emit('close')">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <div v-if="tab === 'evidence'" class="fa-scroll panel-body">
      <div v-if="!citations.length" class="empty">
        <p class="fa-serif">这一轮没有引用</p>
        <p class="fa-faint">{{ sufficient ? '模型给出了答案但没有标注出处，可在诊断里看提示。' : '证据不足，所以没有可引用的原文。' }}</p>
      </div>

      <template v-else>
        <!-- 选中项的详情：先给「这一段在哪」，再给「是什么」 -->
        <section v-if="selected" class="detail">
          <div class="detail-top">
            <span class="e-badge">E{{ active || 1 }}</span>
            <span class="fa-chip fa-chip--mute">{{ EVIDENCE_TYPE[selected.evidenceType] ?? selected.evidenceType }}</span>
            <span class="fa-faint page">{{ pageText(selected) }}</span>
          </div>
          <h4 class="fa-title-md doc">{{ selected.docTitle || '未命名文档' }}</h4>
          <p class="section-path">{{ selected.sectionPath || '未标注章节' }}</p>

          <dl class="fa-kv">
            <template v-if="selected.unit"><dt>单位</dt><dd>{{ selected.unit }}</dd></template>
            <template v-if="selected.scope"><dt>口径</dt><dd>{{ selected.scope }}</dd></template>
            <template v-if="rowText(selected)"><dt>表格行</dt><dd>{{ rowText(selected) }}</dd></template>
            <dt>文档</dt><dd class="fa-num">#{{ selected.documentId }}</dd>
            <dt>子块</dt><dd class="fa-num">#{{ selected.childChunkId }}<span v-if="selected.parentChunkId" class="fa-faint"> · 父 #{{ selected.parentChunkId }}</span></dd>
          </dl>

          <p class="hint">编号 [E{{ active || 1 }}] 与答案正文里的角标一一对应；点下面的条目可切换。</p>
        </section>

        <div class="fa-rule-label list-label">全部证据</div>

        <button
          v-for="(c, i) in citations"
          :key="c.childChunkId + '-' + i"
          type="button"
          class="ev-item"
          :class="{ on: (active || 1) === i + 1 }"
          @click="emit('select', i + 1)"
        >
          <span class="e-badge sm">{{ i + 1 }}</span>
          <span class="ev-main">
            <span class="ev-title">{{ c.docTitle || '未命名文档' }}</span>
            <span class="ev-meta">
              <span>{{ pageText(c) }}</span>
              <span class="dot">·</span>
              <span>{{ EVIDENCE_TYPE[c.evidenceType] ?? c.evidenceType }}</span>
              <span v-if="c.sectionPath" class="dot">·</span>
              <span v-if="c.sectionPath" class="ev-section">{{ c.sectionPath }}</span>
            </span>
          </span>
        </button>
      </template>

      <section v-if="warnings.length" class="warns">
        <div class="fa-rule-label">注意</div>
        <div v-for="code in warnings" :key="code" class="warn">
          <span class="warn-dot" />
          <span class="warn-text">{{ labelForWarning(code) }}</span>
          <span class="warn-code fa-mono">{{ code }}</span>
        </div>
      </section>

      <section v-if="note" class="note">
        <div class="fa-rule-label">说明</div>
        <p>{{ note }}</p>
      </section>
    </div>

    <div v-else-if="tab === 'page'" class="fa-scroll panel-body page-body">
      <div v-if="!selected" class="empty">
        <p class="fa-serif">没有可看的原文</p>
        <p class="fa-faint">这一轮没有引用证据。</p>
      </div>

      <template v-else>
        <div class="page-bar">
          <span class="e-badge">{{ active || 1 }}</span>
          <span class="page-doc">{{ selected.docTitle || '未命名文档' }}</span>
          <span class="page-turn">
            <button type="button" class="fa-icon-btn" :disabled="pageNo === null || pageNo <= 1" title="上一页" @click="turnPage(-1)">‹</button>
            <span class="fa-num page-no">{{ pageNo ?? selected.pageStart ?? '—' }}</span>
            <button type="button" class="fa-icon-btn" title="下一页" @click="turnPage(1)">›</button>
          </span>
        </div>

        <div v-if="pageLoading" class="page-stage">
          <div class="fa-skeleton" style="height: 420px; width: 100%" />
        </div>

        <div v-else-if="pageError" class="page-stage page-miss">
          <p class="fa-serif">这一页取不到原文</p>
          <p class="fa-faint">{{ pageError }}</p>
        </div>

        <div v-else-if="pageUrl" class="page-stage">
          <div class="page-shot">
            <img :src="pageUrl" :alt="'第 ' + pageNo + ' 页原文'" />
            <span
              v-for="(b, i) in boxes"
              :key="i"
              class="hl"
              :style="{ left: b.x * 100 + '%', top: b.y * 100 + '%', width: b.w * 100 + '%', height: b.h * 100 + '%' }"
            />
          </div>
        </div>

        <p class="hint">
          高亮框是块在 PDF 里的原始坐标（归一化），由后端从 document_chunk.bbox 读出，不是模型给的。
          <span v-if="selected.pageStart !== selected.pageEnd && selected.pageEnd">本块跨第 {{ selected.pageStart }}–{{ selected.pageEnd }} 页。</span>
        </p>
      </template>
    </div>

    <div v-else class="fa-scroll panel-body">
      <div v-if="!metrics.length" class="empty">
        <p class="fa-serif">没有诊断数据</p>
        <p class="fa-faint">这条消息来自历史记录，当时未保存 trace。</p>
      </div>
      <template v-else>
        <div class="fa-rule-label">检索链路</div>
        <dl class="fa-kv diag">
          <template v-for="row in metrics" :key="row.k">
            <dt>{{ row.k }}</dt>
            <dd class="fa-mono">{{ row.v }}</dd>
          </template>
        </dl>
        <p class="hint">诊断只给演示与排查用：面试时可以指着它说清「这一句是怎么来的」。</p>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.panel {
  width: var(--evidence-w);
  flex: 0 0 var(--evidence-w);
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--rule);
  background: var(--paper-raised);
  min-height: 0;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 42px;
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--rule);
}

.tabs { display: flex; gap: 14px; }

.tab {
  position: relative;
  background: transparent;
  border: 0;
  padding: 0 0 10px;
  margin-bottom: -11px;
  font-size: 12px;
  color: var(--ink-4);
  cursor: pointer;
  letter-spacing: 0.04em;
}

.tab.on { color: var(--ink); }
.tab.on::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--accent); }
.n { font-size: 10px; color: var(--ink-4); }

.panel-body { padding: 16px; }

.detail { padding-bottom: 14px; border-bottom: 1px solid var(--rule); }
.detail-top { display: flex; align-items: center; gap: 8px; }

.e-badge {
  display: inline-grid;
  place-items: center;
  min-width: 30px;
  height: 20px;
  padding: 0 6px;
  background: var(--accent);
  color: #fff8ee;
  font-family: var(--mono);
  font-size: 11px;
  border-radius: 6px;
}

.e-badge.sm { min-width: 22px; height: 18px; font-size: 10px; align-self: flex-start; margin-top: 2px; }
.page { font-size: 11px; }
.doc { margin: 10px 0 2px; }
.section-path { margin: 0 0 12px; color: var(--ink-3); font-size: 12px; }

.hint { margin: 12px 0 0; font-size: 11px; color: var(--ink-4); line-height: 1.6; }

.list-label { margin: 14px 0 6px; }

.ev-item {
  display: flex;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 9px 8px;
  border: 1px solid transparent;
  border-bottom: 1px solid var(--rule);
  background: transparent;
  cursor: pointer;
  transition: background 150ms var(--ease);
}

.ev-item:hover { background: var(--paper-sink); }
.ev-item.on { border-color: var(--rule-strong); background: rgba(239, 233, 221, 0.55); }

.ev-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ev-title { font-size: 12.5px; color: var(--ink); }
.ev-meta { display: flex; flex-wrap: wrap; gap: 4px; font-size: 10.5px; color: var(--ink-4); }
.ev-section { display: inline-block; max-width: 100%; vertical-align: bottom; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { opacity: 0.6; }

.warns { margin-top: 18px; }
.warn { display: flex; align-items: baseline; gap: 7px; padding: 6px 0; border-bottom: 1px dashed var(--rule); }
.warn-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--gold); flex: 0 0 5px; transform: translateY(-2px); }
.warn-text { font-size: 11.5px; color: var(--ink-2); }
.warn-code { margin-left: auto; font-size: 9.5px; color: var(--ink-4); }

.note { margin-top: 16px; }
.note p { margin: 6px 0 0; font-size: 12px; color: var(--ink-2); line-height: 1.75; }
.diag { margin-top: 10px; }
.page-body { padding: 14px; }

.page-bar { display: flex; align-items: center; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid var(--rule); }
.page-doc { flex: 1; min-width: 0; font-size: 11.5px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.page-turn { display: inline-flex; align-items: center; gap: 2px; }
.page-no { font-size: 11px; color: var(--ink-3); min-width: 22px; text-align: center; }

.page-stage { margin-top: 12px; }

/* 纸面阴影 + 细边：看起来像一张放在桌上的纸，而不是一块贴在墙上的白板 */
.page-shot {
  position: relative;
  border: 1px solid var(--rule-strong);
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 8px 22px rgba(23, 22, 20, 0.1);
}

.page-shot img { display: block; width: 100%; height: auto; }

/* 朱砂半透明底 + 实线边：既能看清原文，又能一眼定位 */
.hl {
  position: absolute;
  border: 1.5px solid var(--accent);
  background: rgba(178, 58, 40, 0.14);
  border-radius: 2px;
  box-shadow: 0 0 0 9999px rgba(23, 22, 20, 0.05);
  pointer-events: none;
}

.page-miss { padding: 20px 4px; }
.page-miss p { margin: 0; font-size: 12px; }
.page-miss .fa-serif { font-size: 14px; margin-bottom: 6px; }

.empty { padding: 24px 4px; }
.empty p { margin: 0; font-size: 12px; }
.empty .fa-serif { font-size: 14px; margin-bottom: 6px; }
</style>