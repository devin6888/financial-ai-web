<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { fetchStats, type Stats } from '@/api/stats'
import { listMemories } from '@/api/memories'
import type { MemoryView } from '@/api/types'
import PageHeader from '@/components/PageHeader.vue'
import { useConversationStore } from '@/stores/conversation'
import { useSessionStore } from '@/stores/session'
import { describe } from '@/stores/session'

const router = useRouter()
const session = useSessionStore()
const store = useConversationStore()

const stats = ref<Stats | null>(null)
const memories = ref<MemoryView[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const STATUS_LABEL: Record<string, string> = { DONE: '已就绪', PARSING: '解析中', PENDING: '排队中', FAILED: '失败' }
const DOC_TYPE: Record<string, string> = { ANNUAL: '年报', SEMI_ANNUAL: '半年报', Q1: '一季报', Q3: '三季报' }
const TYPE_LABEL: Record<string, string> = { INSTRUCTION: '明确要求', CONTEXTUAL: '情境', WATCHLIST: '关注' }

onMounted(async () => {
  try {
    const [s, m] = await Promise.all([fetchStats(), listMemories(), store.load()])
    stats.value = s
    memories.value = m.slice(0, 4)
  } catch (e) {
    error.value = describe(e)
  } finally {
    loading.value = false
  }
})

const kpis = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: '可检索文档', value: s.documents, unit: '份', note: s.companies + ' 家公司' },
    { label: '活跃子块', value: s.activeChildren, unit: '块', note: '父块 ' + s.activeParents },
    { label: '我的会话', value: s.conversations, unit: '个', note: '含历史追问' },
    { label: '长期记忆', value: s.memories, unit: '条', note: '偏好与关注点' },
  ]
})

const statusBar = computed(() => {
  const s = stats.value
  if (!s) return []
  return Object.entries(s.documentsByStatus).filter(([, n]) => n > 0)
})

function memoryPreview(text: string): string {
  return text.length > 46 ? text.slice(0, 46) + '…' : text
}

function go(path: string): void {
  void router.push(path)
}
</script>

<template>
  <div class="fa-page">
    <PageHeader
      eyebrow="OVERVIEW"
      title="把一份年报问成一张有出处的答案"
      desc="混合检索 + 引用校验 + 多轮记忆。下面这些数字都来自当前账号可读的语料，不是演示用的假数据。"
    >
      <template #actions>
        <button type="button" class="fa-btn" @click="go('/documents')">上传文档</button>
        <button type="button" class="fa-btn fa-btn--solid" @click="go('/chat')">开始提问</button>
      </template>
    </PageHeader>

    <div class="fa-scroll">
      <div class="wrap">
        <p v-if="error" class="error">{{ error }}</p>

        <!-- KPI：大字号宋体数字，一眼看到规模 -->
        <section class="kpis">
          <div v-for="(kpi, i) in kpis" :key="kpi.label" class="kpi" :style="{ animationDelay: i * 60 + 'ms' }">
            <div class="fa-eyebrow">{{ kpi.label }}</div>
            <div class="kpi-value">
              <span class="fa-serif num">{{ kpi.value }}</span>
              <span class="unit">{{ kpi.unit }}</span>
            </div>
            <div class="fa-faint kpi-note">{{ kpi.note }}</div>
          </div>
          <div v-if="loading && !kpis.length" class="kpi">
            <div class="fa-skeleton" style="height: 54px" />
          </div>
        </section>

        <div class="grid">
          <!-- 语料 -->
          <section class="card span-2">
            <div class="card-head">
              <div class="fa-rule-label">语料</div>
              <button type="button" class="fa-btn fa-btn--quiet fa-btn--sm" @click="go('/documents')">全部文档 →</button>
            </div>

            <div class="status-line">
              <span v-for="[status, count] in statusBar" :key="status" class="fa-chip" :class="status === 'DONE' ? 'fa-chip--ok' : status === 'FAILED' ? 'fa-chip--accent' : 'fa-chip--warn'">
                {{ STATUS_LABEL[status] ?? status }} <span class="fa-num">{{ count }}</span>
              </span>
            </div>

            <table class="doc-table">
              <thead>
                <tr><th>文档</th><th>公司</th><th>期间</th><th class="r">块</th></tr>
              </thead>
              <tbody>
                <tr v-for="doc in stats?.recent ?? []" :key="doc.id">
                  <td class="title">{{ doc.title }}</td>
                  <td class="fa-num">{{ doc.companyCode ?? '—' }}</td>
                  <td class="fa-num">{{ doc.docYear ?? '—' }} {{ DOC_TYPE[doc.docType ?? ''] ?? '' }}</td>
                  <td class="r fa-num">{{ doc.chunkCount }}</td>
                </tr>
              </tbody>
            </table>
            <div v-if="loading" class="fa-skeleton" style="height: 90px; margin-top: 12px" />
          </section>

          <!-- 会话 -->
          <section class="card">
            <div class="card-head">
              <div class="fa-rule-label">最近会话</div>
              <button type="button" class="fa-btn fa-btn--quiet fa-btn--sm" @click="go('/chat')">新会话 →</button>
            </div>
            <ul class="list">
              <li v-for="conv in store.items.slice(0, 5)" :key="conv.conversationId">
                <button type="button" class="list-item" @click="go('/chat/' + conv.conversationId)">
                  <span class="list-title">{{ conv.title }}</span>
                  <span class="fa-num list-meta">{{ new Date(conv.updatedAt).toLocaleDateString('zh-CN') }}</span>
                </button>
              </li>
              <li v-if="!store.items.length" class="empty-row">还没有会话，问第一个问题就会有一条。</li>
            </ul>
          </section>

          <!-- 记忆 -->
          <section class="card">
            <div class="card-head">
              <div class="fa-rule-label">长期记忆</div>
              <button type="button" class="fa-btn fa-btn--quiet fa-btn--sm" @click="go('/memories')">管理 →</button>
            </div>
            <ul class="list">
              <li v-for="m in memories" :key="m.id" class="mem">
                <span class="fa-chip fa-chip--mute">{{ TYPE_LABEL[m.type] ?? m.type }}</span>
                <span class="mem-text">{{ memoryPreview(m.content) }}</span>
              </li>
              <li v-if="!memories.length" class="empty-row">没有记忆。可以让它「记住：回答先给结论」。</li>
            </ul>
          </section>

          <!-- 系统 -->
          <section class="card span-2 system">
            <div class="fa-rule-label">这套系统现在跑在什么上面</div>
            <div class="sys-grid">
              <div class="sys"><div class="fa-eyebrow">向量</div><div class="sys-v">pgvector · 1024 维</div></div>
              <div class="sys"><div class="fa-eyebrow">中文检索</div><div class="sys-v">PostgreSQL + zhparser</div></div>
              <div class="sys"><div class="fa-eyebrow">精排</div><div class="sys-v">qwen3-rerank</div></div>
              <div class="sys"><div class="fa-eyebrow">账号</div><div class="sys-v">{{ session.displayName }} · 租户 {{ session.user?.tenantId ?? '—' }}</div></div>
            </div>
            <p class="sys-note">数据只列当前账号有权读取的文档；换一个账号登录，数字会变——这是租户与 ACL 两层过滤的结果。</p>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap { max-width: 1180px; margin: 0 auto; padding: 26px 32px 40px; }

.kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
}

.kpi { padding: 18px 20px 16px; border-right: 1px solid var(--rule); animation: fa-fade-up 320ms var(--ease-out) both; }
.kpi:last-child { border-right: 0; }

.kpi-value { display: flex; align-items: baseline; gap: 5px; margin-top: 10px; }
.num { font-size: 40px; line-height: 1; letter-spacing: -0.02em; }
.unit { font-size: 11px; color: var(--ink-4); }
.kpi-note { margin-top: 6px; font-size: 10.5px; }

.grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: 18px;
}

.card {
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  padding: 16px 18px 18px;
}

.span-2 { grid-column: span 2; }

.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }

.status-line { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }

.doc-table { width: 100%; border-collapse: collapse; }
.doc-table th {
  text-align: left;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-4);
  font-weight: 500;
  padding: 0 0 7px;
  border-bottom: 1px solid var(--rule-strong);
}
.doc-table td { padding: 9px 0; border-bottom: 1px solid var(--rule); font-size: 12.5px; }
.doc-table .title { max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-table .r { text-align: right; }

.list { list-style: none; margin: 0; padding: 0; }

.list-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 9px 0;
  border-bottom: 1px solid var(--rule);
  background: transparent;
  border-left: 0;
  border-right: 0;
  border-top: 0;
  text-align: left;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--ink);
}

.list-item:hover { color: var(--accent); }
.list-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list-meta { font-size: 10.5px; color: var(--ink-4); flex-shrink: 0; }

.mem { display: flex; align-items: center; gap: 8px; padding: 9px 0; border-bottom: 1px solid var(--rule); }
.mem-text { font-size: 12px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.empty-row { padding: 12px 0; font-size: 11.5px; color: var(--ink-4); }

.sys-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 12px; }
.sys { border-left: 2px solid var(--rule); padding-left: 10px; }
.sys-v { font-size: 12.5px; margin-top: 4px; color: var(--ink); }
.sys-note { margin: 14px 0 0; font-size: 11px; color: var(--ink-4); }
.error { color: var(--accent); font-size: 12.5px; }

@media (max-width: 1100px) {
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: span 1; }
  .sys-grid { grid-template-columns: repeat(2, 1fr); }
}

/* 全站圆角（2026-10-28）：大面板 16px，行项同曲率 */
.card,
.list-item,
.kpi { border-radius: var(--radius-lg); }

.card { overflow: hidden; }
</style>