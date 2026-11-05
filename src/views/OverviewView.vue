<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChatDotRound, Collection, Document, Files, Tickets } from '@element-plus/icons-vue'

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

/**
 * 四块 KPI 共用一套字阶，只有主指标（文档数）拿强调色、放大一档：
 * 层次靠「面积 + 底色 + 一个强调色」，不靠四种彩色数字。
 */
const kpis = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    {
      label: '可检索文档',
      value: s.documents,
      unit: '份',
      note: s.companies + ' 家公司',
      tone: 'tone-doc',
      icon: Document,
      primary: true,
    },
    {
      label: '活跃子块',
      value: s.activeChildren,
      unit: '块',
      note: '父块 ' + s.activeParents,
      tone: 'tone-chunk',
      icon: Tickets,
      primary: false,
    },
    {
      label: '我的会话',
      value: s.conversations,
      unit: '个',
      note: '含历史追问',
      tone: 'tone-conv',
      icon: ChatDotRound,
      primary: false,
    },
    {
      label: '长期记忆',
      value: s.memories,
      unit: '条',
      note: '偏好与关注点',
      tone: 'tone-mem',
      icon: Collection,
      primary: false,
    },
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

        <!-- 便当盒：主卡（2×2）+ 四块指标卡（1×1）+ 两张清单（2×1）+ 一条脚注（4×1） -->
        <section class="bento" aria-label="概览">
          <!-- 主卡：语料 -->
          <article class="tile hero">
            <header class="hero-head">
              <span class="tile-icon"><el-icon><Files /></el-icon></span>
              <div class="hero-title">
                <h2>语料</h2>
                <p>当前账号可读的年报，以及它们切出来的规模</p>
              </div>
              <button type="button" class="hero-link" @click="go('/documents')">全部文档 →</button>
            </header>

            <div class="chips">
              <span
                v-for="[status, count] in statusBar"
                :key="status"
                class="chip"
                :class="'chip--' + status.toLowerCase()"
              >
                {{ STATUS_LABEL[status] ?? status }} <b>{{ count }}</b>
              </span>
            </div>

            <table class="doc-table">
              <thead>
                <tr><th>文档</th><th>公司</th><th>期间</th><th class="r">块</th></tr>
              </thead>
              <tbody>
                <tr v-for="doc in stats?.recent ?? []" :key="doc.id">
                  <td class="title">{{ doc.title }}</td>
                  <td class="num">{{ doc.companyCode ?? '—' }}</td>
                  <td class="num">{{ doc.docYear ?? '—' }} {{ DOC_TYPE[doc.docType ?? ''] ?? '' }}</td>
                  <td class="r num">{{ doc.chunkCount }}</td>
                </tr>
              </tbody>
            </table>

            <p class="hero-foot">
              数字只统计当前账号有权读取的文档；换一个账号登录，这里会变 —— 租户与 ACL 两层过滤的结果。
            </p>
          </article>

          <!-- 指标卡：主指标拿强调色，其余靠底色区分 -->
          <article
            v-for="(kpi, i) in kpis"
            :key="kpi.label"
            class="tile kpi"
            :class="[kpi.tone, kpi.primary ? 'kpi--primary' : '']"
            :style="{ animationDelay: i * 60 + 'ms' }"
          >
            <span class="kpi-label">{{ kpi.label }}</span>
            <div class="kpi-value">
              <span class="kpi-num">{{ kpi.value }}</span>
              <span class="kpi-unit">{{ kpi.unit }}</span>
            </div>
            <span class="kpi-note">{{ kpi.note }}</span>
            <el-icon class="kpi-icon"><component :is="kpi.icon" /></el-icon>
          </article>

          <!-- 最近会话 -->
          <article class="tile panel span-2">
            <header class="panel-head">
              <span class="panel-icon"><el-icon><ChatDotRound /></el-icon></span>
              <div class="panel-title">
                <h3>最近会话</h3>
                <p>点开接着问，上下文还在</p>
              </div>
              <button type="button" class="link" @click="go('/chat')">新会话 →</button>
            </header>
            <ul class="list">
              <li v-for="conv in store.items.slice(0, 4)" :key="conv.conversationId">
                <button type="button" class="list-item" @click="go('/chat/' + conv.conversationId)">
                  <span class="list-title">{{ conv.title }}</span>
                  <span class="list-meta">{{ new Date(conv.updatedAt).toLocaleDateString('zh-CN') }}</span>
                </button>
              </li>
              <li v-if="!store.items.length" class="empty-row">还没有会话，问第一个问题就会有一条。</li>
            </ul>
          </article>

          <!-- 长期记忆 -->
          <article class="tile panel span-2">
            <header class="panel-head">
              <span class="panel-icon"><el-icon><Collection /></el-icon></span>
              <div class="panel-title">
                <h3>长期记忆</h3>
                <p>它记住的偏好与关注点</p>
              </div>
              <button type="button" class="link" @click="go('/memories')">管理 →</button>
            </header>
            <ul class="list">
              <li v-for="m in memories" :key="m.id" class="mem">
                <span class="mem-chip">{{ TYPE_LABEL[m.type] ?? m.type }}</span>
                <span class="mem-text">{{ memoryPreview(m.content) }}</span>
              </li>
              <li v-if="!memories.length" class="empty-row">没有记忆。可以让它「记住：回答先给结论」。</li>
            </ul>
          </article>

          <!-- 脚注：最轻的一条，虚线、无底色 -->
          <article class="tile strip span-4">
            <span class="strip-label">这套系统现在跑在什么上面</span>
            <div class="sys-grid">
              <div class="sys"><span class="sys-k">向量</span><span class="sys-v">pgvector · 1024 维</span></div>
              <div class="sys"><span class="sys-k">中文检索</span><span class="sys-v">PostgreSQL + zhparser</span></div>
              <div class="sys"><span class="sys-k">精排</span><span class="sys-v">qwen3-rerank</span></div>
              <div class="sys">
                <span class="sys-k">账号</span>
                <span class="sys-v">{{ session.displayName }} · 租户 {{ session.user?.tenantId ?? '—' }}</span>
              </div>
            </div>
          </article>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
  配色取自本项目的「纸墨·朱批」体系：所有瓦片都是暖纸色系里 8%~12% 的极轻着色，
  和 /chat、/documents 的底色同源，不引入冷色。
  层次 = 面积（2×2 主卡）+ 底色深浅 + 字号；强调色只有一个（朱红），只落在主指标数字与链接。
*/
.wrap {
  --bento-ink: var(--ink);
  --bento-muted: var(--ink-3);
  --bento-faint: var(--ink-4);
  --bento-line: var(--rule);
  --bento-accent: var(--accent);

  max-width: 1180px;
  margin: 0 auto;
  padding: 26px 32px 40px;
}

.bento {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: minmax(104px, auto);
  grid-auto-flow: dense;
  gap: 16px;
}

.tile {
  position: relative;
  border: 1px solid var(--rule);
  border-radius: 20px;
  background: var(--paper-raised);
  padding: 20px 22px;
  overflow: hidden;
  color: var(--bento-ink);
}

.span-2 { grid-column: span 2; }
.span-4 { grid-column: span 4; }

/* ---------- 主卡：语料（暖米色，整页面积最大的一块） ---------- */
.hero {
  grid-column: span 2;
  grid-row: span 2;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: #f8f1e2;
  border-color: var(--rule-strong);
}

.hero-head { display: flex; align-items: flex-start; gap: 12px; }

.tile-icon {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.66);
  color: var(--ink-2);
  font-size: 17px;
}

.hero-title { flex: 1; min-width: 0; }

.hero-title h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--bento-ink);
}

.hero-title p {
  margin: 3px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--bento-muted);
}

.hero-link {
  flex: none;
  padding: 5px 12px;
  border: 1px solid var(--rule-strong);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.6);
  color: var(--ink-2);
  font-size: 11.5px;
  cursor: pointer;
  transition: background 0.15s var(--ease), border-color 0.15s var(--ease);
}

.hero-link:hover {
  background: var(--paper-raised);
  border-color: var(--ink-4);
}

.chips { display: flex; flex-wrap: wrap; gap: 6px; }

.chip {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.62);
  color: var(--bento-muted);
}

.chip b { font-family: var(--mono); font-size: 11px; font-weight: 600; color: var(--ink-2); }
.chip--done b { color: var(--teal); }
.chip--parsing b,
.chip--pending b { color: #8a6a34; }
.chip--failed b { color: var(--bento-accent); }

.doc-table { width: 100%; border-collapse: collapse; }

.doc-table th {
  padding: 0 0 7px;
  border-bottom: 1px solid var(--rule-strong);
  font-family: var(--mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-align: left;
  color: var(--bento-faint);
}

.doc-table td {
  padding: 8px 0;
  border-bottom: 1px solid var(--bento-line);
  font-size: 12.5px;
  color: var(--ink-2);
}

.doc-table tr:last-child td { border-bottom: 0; }
.doc-table .title { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-table .num { font-family: var(--mono); font-size: 11px; color: var(--bento-faint); }
.doc-table .r { text-align: right; }

.hero-foot {
  margin: auto 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--bento-faint);
}

/* ---------- 指标卡：一卡一层纸色，最深也只到 #f9ece5 ---------- */
.kpi {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
  min-height: 104px;
  animation: fa-fade-up 320ms var(--ease-out) both;
  transition: transform 0.18s var(--ease), box-shadow 0.18s var(--ease);
}

.kpi:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(23, 22, 20, 0.05);
}

.kpi-label {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--bento-muted);
}

.kpi-value { display: flex; align-items: baseline; gap: 5px; }

.kpi-num {
  font-family: var(--serif);
  font-size: 34px;
  /* 行高锁死，44px 的主指标与 34px 的次指标占同样高度，四块严格等高 */
  line-height: 46px;
  letter-spacing: -0.02em;
  color: var(--bento-ink);
  font-variant-numeric: tabular-nums;
}

.kpi-unit { font-size: 11px; color: var(--bento-muted); }
.kpi-note { font-size: 11.5px; color: var(--bento-faint); }

.kpi-icon {
  position: absolute;
  top: 18px;
  right: 20px;
  font-size: 18px;
  color: var(--bento-faint);
  opacity: 0.6;
}

.tone-doc { background: #f9ece5; }
.tone-chunk { background: #f8f2e0; }
.tone-conv { background: #edf1ec; }
.tone-mem { background: #f4efe8; }

.tone-doc .kpi-icon { color: #b06a52; opacity: 0.75; }
.tone-chunk .kpi-icon { color: #8a6a34; opacity: 0.75; }
.tone-conv .kpi-icon { color: var(--teal); opacity: 0.7; }
.tone-mem .kpi-icon { color: #7a6a55; opacity: 0.75; }

.tone-doc.kpi--primary .kpi-num {
  font-size: 44px;
  color: var(--bento-accent);
}

/* ---------- 清单卡：最白的一层 ---------- */
.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--paper-raised);
}

.panel-head { display: flex; align-items: center; gap: 10px; }

.panel-icon {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: var(--paper-sink);
  color: var(--ink-3);
  font-size: 15px;
}

.panel-title { flex: 1; min-width: 0; }

.panel-title h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--bento-ink);
}

.panel-title p { margin: 2px 0 0; font-size: 11px; color: var(--bento-faint); }

.link {
  flex: none;
  border: 0;
  background: transparent;
  padding: 0;
  font-size: 11.5px;
  color: var(--bento-muted);
  cursor: pointer;
}

.link:hover { color: var(--bento-accent); }

.list { list-style: none; margin: 0; padding: 0; }

.list-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px 0;
  border: 0;
  border-bottom: 1px solid var(--bento-line);
  background: transparent;
  text-align: left;
  font-size: 12.5px;
  color: var(--ink-2);
  cursor: pointer;
}

.list-item:hover { color: var(--bento-accent); }
.list-item:last-child { border-bottom: 0; }
.list-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list-meta { flex-shrink: 0; font-family: var(--mono); font-size: 10.5px; color: var(--bento-faint); }

.mem { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--bento-line); }
.mem:last-child { border-bottom: 0; }

.mem-chip {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--paper-sink);
  font-size: 10px;
  color: var(--ink-3);
}

.mem-text { font-size: 12px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.empty-row { padding: 12px 0; font-size: 11.5px; color: var(--bento-faint); }

/* ---------- 脚注条：虚线、透明底，最轻的一层 ---------- */
.strip {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 14px 20px;
  border-style: dashed;
  border-color: var(--rule-strong);
  background: transparent;
}

.strip-label {
  flex: none;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--bento-faint);
}

.sys-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.sys { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.sys-k { flex: none; font-size: 10.5px; color: var(--bento-faint); }
.sys-v {
  font-size: 12px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error { color: var(--accent); font-size: 12.5px; }

@media (max-width: 1100px) {
  .bento { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hero { grid-row: span 1; }
  .span-4 { grid-column: span 2; }
  .strip { flex-direction: column; align-items: flex-start; gap: 8px; }
  .sys-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 720px) {
  .wrap { padding: 18px 16px 32px; }
  .bento { grid-template-columns: minmax(0, 1fr); }
  .span-2 { grid-column: span 1; }
  .span-4 { grid-column: span 1; }
  .sys-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
