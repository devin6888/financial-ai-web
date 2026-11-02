<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'

import { getDocument, listDocuments, uploadDocument } from '@/api/documents'
import type { DocumentDetail, DocumentRow } from '@/api/types'
import ChunkBrowser from '@/components/ChunkBrowser.vue'
import IngestTimeline from '@/components/IngestTimeline.vue'
import PageHeader from '@/components/PageHeader.vue'
import { DOC_TYPES, docTypeLabel } from '@/labels'
import { describe } from '@/stores/session'

/**
 * 文档页：上传 + 状态轮询 + 列表。
 *
 * 为什么用 /api/documents 而不是 /api/scope/documents：后者只返回「可检索」的文档
 * （DONE + 有 ACTIVE 块版本），于是刚上传完还在 PENDING 的文档会从界面上消失 ——
 * 用户第一反应是「上传失败了」。这个页面必须能看到全生命周期。
 *
 * 轮询用固定 2 秒而不是退避：解析一份 5 MB 年报在本机约 1~3 分钟，
 * 2 秒的代价可以忽略；退避反而会让「刚变 DONE」晚十几秒才显示。
 */
const rows = ref<DocumentRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const uploading = ref(false)
const progress = ref(0)
const detail = ref<DocumentDetail | null>(null)
const detailOpen = ref(false)
const chunkOpen = ref(false)
const chunkDocId = ref<number | null>(null)
const chunkTitle = ref<string | null>(null)
const uploadOpen = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const form = ref({
  companyCode: '',
  companyName: '',
  market: 'SZ',
  docType: 'ANNUAL',
  docYear: new Date().getFullYear(),
  title: '',
})
const file = ref<File | null>(null)

let timer: number | null = null
let polls = 0

/**
 * 是否还有文档在「处理中」。
 *
 * 不能用 parseStatus 判定：解析完成（DONE）之后还有切块 + 向量化几十秒，
 * 那一段状态已经是 DONE、进度却只有 55%。判据必须是进度本身。
 */
const hasPending = computed(() =>
  rows.value.some((row) => row.parseStatus !== 'FAILED' && row.parseProgress < 100),
)

const statusCounts = computed(() => {
  const counts: Record<string, number> = { DONE: 0, PARSING: 0, PENDING: 0, FAILED: 0 }
  for (const row of rows.value) {
    counts[row.parseStatus] = (counts[row.parseStatus] ?? 0) + 1
  }
  return counts
})

onMounted(load)
onBeforeUnmount(stopPolling)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    rows.value = await listDocuments(50)
    syncPolling()
  } catch (e) {
    error.value = describe(e)
  } finally {
    loading.value = false
  }
}

/** 只有「还有文档在解析」时才开定时器；一轮最多 150 次（5 分钟）。 */
function syncPolling(): void {
  if (hasPending.value && timer === null && polls < 150) {
    timer = window.setInterval(refresh, 2000)
  }
  if (!hasPending.value) {
    stopPolling()
  }
}

async function refresh(): Promise<void> {
  polls += 1
  try {
    rows.value = await listDocuments(50)
  } catch {
    // 轮询失败不弹错（下一轮会自愈），避免解析期间刷屏
  }
  if (polls >= 150 || !hasPending.value) {
    stopPolling()
  }
}

function stopPolling(): void {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}

function pickFile(): void {
  fileInput.value?.click()
}

function onInputChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const picked = input.files?.[0] ?? null
  file.value = picked
  if (picked && !form.value.title) {
    form.value.title = picked.name.replace(/\.pdf$/i, '')
  }
}

function onDrop(event: DragEvent): void {
  const dropped = event.dataTransfer?.files?.[0] ?? null
  if (!dropped) return
  if (!dropped.name.toLowerCase().endsWith('.pdf')) {
    ElMessage.warning('只接受 PDF 文件')
    return
  }
  file.value = dropped
  if (!form.value.title) form.value.title = dropped.name.replace(/\.pdf$/i, '')
}

async function submit(): Promise<void> {
  if (!file.value) {
    ElMessage.warning('请选择 PDF 文件')
    return
  }
  const required: Array<[string, string]> = [
    [form.value.companyCode, '公司代码'],
    [form.value.companyName, '公司名称'],
    [form.value.title, '文档标题'],
  ]
  for (const [value, label] of required) {
    if (!value.trim()) {
      ElMessage.warning(label + '不能为空')
      return
    }
  }

  const body = new FormData()
  body.append('file', file.value)
  body.append('companyCode', form.value.companyCode.trim())
  body.append('companyName', form.value.companyName.trim())
  body.append('market', form.value.market)
  body.append('docType', form.value.docType)
  body.append('docYear', String(form.value.docYear))
  body.append('title', form.value.title.trim())

  uploading.value = true
  progress.value = 0
  try {
    const result = await uploadDocument(body, (ratio) => {
      progress.value = Math.round(ratio * 100)
    })
    ElMessage.success('已上传，解析在后台进行（documentId=' + result.documentId + '）')
    file.value = null
    form.value.title = ''
    uploadOpen.value = false
    polls = 0
    await load()
  } catch (e) {
    ElMessage.error('上传失败：' + describe(e))
  } finally {
    uploading.value = false
  }
}

async function openDetail(row: DocumentRow): Promise<void> {
  try {
    detail.value = await getDocument(row.id)
    detailOpen.value = true
  } catch (e) {
    ElMessage.error('读取详情失败：' + describe(e))
  }
}

/** 重试成功后：详情与列表都要重读（状态已从 FAILED 变成 PENDING，进度归零）。 */
async function onRetried(): Promise<void> {
  if (!detail.value) return
  const id = detail.value.id
  try {
    detail.value = await getDocument(id)
  } catch (e) {
    ElMessage.error('读取详情失败：' + describe(e))
  }
  polls = 0
  await load()
}

/** 从详情弹窗进切块抽屉：先记下文档 id 与标题，再打开抽屉（抽屉自己拉数据）。 */
function openChunks(): void {
  if (!detail.value) return
  chunkDocId.value = detail.value.id
  chunkTitle.value = detail.value.title
  chunkOpen.value = true
}

function statusClass(status: string): string {
  if (status === 'DONE') return 'fa-chip--ok'
  if (status === 'FAILED') return 'fa-chip--accent'
  return 'fa-chip--warn'
}

/** 进度条颜色：完成=teal，失败=accent，进行中=accent 渐变由 CSS 处置。 */
function barClass(row: DocumentRow): string {
  if (row.parseStatus === 'FAILED') return 'fail'
  return row.parseProgress >= 100 ? 'done' : ''
}

function statusText(status: string): string {
  return { DONE: '已就绪', PARSING: '解析中', PENDING: '排队中', FAILED: '失败' }[status] ?? status
}

function timeText(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN').format(date)
}
</script>

<template>
  <div class="fa-page">
    <PageHeader
      eyebrow="CORPUS"
      title="语料"
      desc="上传 PDF 后解析、切块、向量化都在后台完成；这里能看到每一份文档的全生命周期，包括失败的。"
    >
      <template #actions>
        <span v-if="hasPending" class="live"><i class="dot" />自动刷新中</span>
        <button type="button" class="fa-btn" :disabled="loading" @click="load">刷新</button>
        <button type="button" class="fa-btn fa-btn--solid" @click="uploadOpen = !uploadOpen">
          {{ uploadOpen ? '收起上传' : '上传 PDF' }}
        </button>
      </template>
    </PageHeader>

    <div class="fa-scroll">
      <div class="wrap">
        <p v-if="error" class="error">{{ error }}</p>

        <!-- 上传面板：默认收起，避免抢列表的注意力 -->
        <section v-if="uploadOpen" class="upload fa-fade-up">
          <div class="upload-head">
            <div class="fa-rule-label">新增文档</div>
            <p class="upload-note">同一份 PDF（内容哈希相同）重复上传不会重复解析，会直接返回已有 documentId。</p>
          </div>

          <div class="upload-body">
            <div
              class="dropzone"
              :class="{ 'dropzone--filled': !!file }"
              @click="pickFile"
              @dragover.prevent
              @drop.prevent="onDrop"
            >
              <input ref="fileInput" type="file" accept="application/pdf" class="hidden" @change="onInputChange" />
              <div class="dz-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                </svg>
              </div>
              <div class="dz-title">{{ file ? file.name : '把 PDF 拖到这里，或点击选择' }}</div>
              <div class="dz-sub">{{ file ? Math.round(file.size / 1024) + ' KB' : '支持 .pdf，单份年报约 5 MB' }}</div>
            </div>

            <div class="fields">
              <label class="field">
                <span class="fa-eyebrow">公司代码</span>
                <input v-model="form.companyCode" class="fa-field" placeholder="300059" />
              </label>
              <label class="field">
                <span class="fa-eyebrow">公司名称</span>
                <input v-model="form.companyName" class="fa-field" placeholder="东方财富" />
              </label>
              <label class="field">
                <span class="fa-eyebrow">市场</span>
                <select v-model="form.market" class="fa-field">
                  <option value="SZ">深市 SZ</option>
                  <option value="SH">沪市 SH</option>
                  <option value="BJ">北交所 BJ</option>
                </select>
              </label>
              <label class="field">
                <span class="fa-eyebrow">报告类型</span>
                <select v-model="form.docType" class="fa-field">
                  <option v-for="item in DOC_TYPES" :key="item.value" :value="item.value">{{ item.label }}</option>
                </select>
              </label>
              <label class="field">
                <span class="fa-eyebrow">报告年度</span>
                <input v-model.number="form.docYear" class="fa-field fa-num" type="number" min="1990" max="2100" />
              </label>
              <label class="field span-2">
                <span class="fa-eyebrow">标题</span>
                <input v-model="form.title" class="fa-field" placeholder="默认取文件名" />
              </label>
            </div>
          </div>

          <div v-if="uploading" class="bar"><div class="bar-fill" :style="{ width: progress + '%' }" /></div>

          <div class="upload-foot">
            <span class="fa-faint">上传后立即返回，解析走 Kafka 异步链路</span>
            <button type="button" class="fa-btn fa-btn--accent" :disabled="uploading" @click="submit">
              {{ uploading ? '上传中 ' + progress + '%' : '上传并解析' }}
            </button>
          </div>
        </section>

        <!-- 状态概览 -->
        <div class="chips">
          <span v-for="(count, status) in statusCounts" :key="status" class="fa-chip" :class="statusClass(String(status))">
            {{ statusText(String(status)) }} <span class="fa-num">{{ count }}</span>
          </span>
          <span class="fa-chip fa-chip--mute">共 <span class="fa-num">{{ rows.length }}</span> 份</span>
        </div>

        <section class="table-card">
          <table class="doc-table">
            <thead>
              <tr>
                <th>文档</th>
                <th>公司</th>
                <th>期间</th>
                <th>状态</th>
                <th class="prog-head">进度</th>
                <th class="r">页</th>
                <th class="r">块</th>
                <th>入库</th>
                <th class="r">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id">
                <td class="title">
                  <div class="t-main">{{ row.title }}</div>
                  <div class="t-sub fa-mono">#{{ row.id }}</div>
                </td>
                <td>
                  <div class="t-main">{{ row.companyName || '—' }}</div>
                  <div class="t-sub fa-num">{{ row.companyCode || '—' }}</div>
                </td>
                <td class="fa-num">{{ row.docYear ?? '—' }} <span class="fa-faint">{{ docTypeLabel(row.docType) }}</span></td>
                <td><span class="fa-chip" :class="statusClass(row.parseStatus)">{{ statusText(row.parseStatus) }}</span></td>
                <td class="prog-cell">
                  <div class="prog-bar"><i :class="barClass(row)" :style="{ width: row.parseProgress + '%' }" /></div>
                  <div class="prog-meta">
                    <span class="fa-num">{{ row.parseProgress }}%</span>
                    <span v-if="row.parseStatus !== 'FAILED'" class="stage fa-faint">{{ row.progressStage || '排队中' }}</span>
                  </div>
                </td>
                <td class="r fa-num">{{ row.pagesParsed ?? '—' }}</td>
                <td class="r fa-num">{{ row.chunkCount }}</td>
                <td class="fa-num fa-faint">{{ timeText(row.createdAt) }}</td>
                <td class="r"><button type="button" class="fa-btn fa-btn--quiet fa-btn--sm" @click="openDetail(row)">详情</button></td>
              </tr>
            </tbody>
          </table>

          <div v-if="loading && !rows.length" class="loading">
            <div class="fa-skeleton" style="height: 120px" />
          </div>
          <div v-if="!loading && !rows.length" class="empty">
            <div class="empty-title fa-serif">还没有文档</div>
            <p>上传一份年报，几秒钟后就能在这里看到它的状态。</p>
            <button type="button" class="fa-btn" @click="uploadOpen = true">上传第一份</button>
          </div>
        </section>
      </div>
    </div>

    <el-dialog v-model="detailOpen" title="文档详情" width="600px">
      <template #footer>
        <button type="button" class="fa-btn fa-btn--quiet fa-btn--sm" @click="openChunks">看切块</button>
      </template>
      <dl v-if="detail" class="fa-kv">
        <div><dt>id</dt><dd class="fa-mono">{{ detail.id }}</dd></div>
        <div><dt>标题</dt><dd>{{ detail.title }}</dd></div>
        <div><dt>状态</dt><dd><span class="fa-chip" :class="statusClass(detail.parseStatus)">{{ statusText(detail.parseStatus) }}</span></dd></div>
        <div><dt>进度</dt><dd class="fa-num">{{ detail.parseProgress }}% <span class="fa-faint">{{ detail.progressStage || '' }}</span></dd></div>
        <div><dt>解析器</dt><dd class="fa-mono">{{ detail.parser || '—' }} {{ detail.parserVersion || '' }}</dd></div>
        <div><dt>页数</dt><dd class="fa-num">{{ detail.pagesParsed ?? '—' }}</dd></div>
        <div><dt>活跃块版本</dt><dd class="fa-num">v{{ detail.activeChunkVersion ?? '—' }}</dd></div>
        <div v-if="detail.parseError"><dt>解析错误</dt><dd class="err">{{ detail.parseError }}</dd></div>
        <div><dt>解析产物</dt><dd class="fa-mono weak">{{ detail.parsedObjectKey || '—' }}</dd></div>
      </dl>

      <!-- 未完成的文档才需要看步骤；DONE 只回摘要，组件自己判断 -->
      <IngestTimeline
        v-if="detailOpen && detail"
        :document-id="detail.id"
        @retried="onRetried"
      />
    </el-dialog>

    <ChunkBrowser v-model="chunkOpen" :document-id="chunkDocId" :document-title="chunkTitle" />
  </div>
</template>

<style scoped>
.wrap { max-width: 1240px; margin: 0 auto; padding: 24px 32px 40px; }

.live { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--teal); }
.dot { width: 5px; height: 5px; border-radius: 50%; background: var(--teal); animation: fa-pulse 1.6s infinite; }

.upload {
  border: 1px solid var(--rule-strong);
  background: var(--paper-raised);
  padding: 16px 18px 14px;
  margin-bottom: 18px;
}

.upload-head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
.upload-note { margin: 0; font-size: 11px; color: var(--ink-4); }

.upload-body { display: grid; grid-template-columns: 232px 1fr; gap: 16px; }

.dropzone {
  border: 1px dashed var(--rule-strong);
  background: var(--paper-sink);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 18px 12px;
  cursor: pointer;
  transition: all 160ms var(--ease);
  text-align: center;
}

.dropzone:hover, .dropzone--filled { border-color: var(--accent); background: var(--accent-soft); }
.dz-icon { color: var(--ink-3); }
.dz-title { font-size: 12px; color: var(--ink); line-height: 1.5; word-break: break-all; }
.dz-sub { font-size: 10.5px; color: var(--ink-4); }
.hidden { display: none; }

.fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 12px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.span-2 { grid-column: span 2; }
.fa-field { height: 32px; }
select.fa-field { appearance: none; background-image: none; }

.bar { height: 2px; background: var(--rule); margin: 14px 0 0; }
.bar-fill { height: 100%; background: var(--accent); transition: width 200ms var(--ease); }

.upload-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }

.chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }

.table-card { border: 1px solid var(--rule); background: var(--paper-raised); padding: 4px 18px 18px; }

.doc-table { width: 100%; border-collapse: collapse; }
.doc-table th {
  text-align: left;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-4);
  font-weight: 500;
  padding: 12px 0 8px;
  border-bottom: 1px solid var(--rule-strong);
  white-space: nowrap;
}
.doc-table td { padding: 10px 0; border-bottom: 1px solid var(--rule); font-size: 12.5px; vertical-align: middle; }
.doc-table tr:last-child td { border-bottom: 0; }
.doc-table .r { text-align: right; }

/* 进度列：宽度固定，避免百分比与阶段文案把「文档」列挤窄（阶段文案最长「向量化 654/654」） */
.doc-table .prog-head { width: 132px; }
.prog-cell { width: 132px; }
.prog-bar { height: 3px; border-radius: 2px; background: var(--rule); overflow: hidden; }
.prog-bar i {
  display: block; height: 100%; background: var(--accent);
  transition: width 0.4s ease;
}
.prog-bar i.done { background: var(--teal); }
.prog-bar i.fail { background: var(--accent); opacity: 0.45; }
.prog-meta {
  display: flex; align-items: baseline; gap: 6px;
  margin-top: 4px; font-size: 11px; color: var(--ink-2);
}
.prog-meta .stage { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title { max-width: 380px; }
.t-main { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.t-sub { font-size: 10px; color: var(--ink-4); margin-top: 2px; letter-spacing: 0.04em; }

.loading { padding: 16px 0; }
.empty { padding: 40px 0 30px; text-align: center; }
.empty-title { font-size: 20px; margin-bottom: 6px; }
.empty p { margin: 0 0 14px; font-size: 12px; color: var(--ink-4); }

.error { color: var(--accent); font-size: 12.5px; }
.weak { color: var(--ink-4); word-break: break-all; }
.err { color: var(--accent); font-size: 11.5px; }

@media (max-width: 1000px) {
  .upload-body { grid-template-columns: 1fr; }
  .fields { grid-template-columns: repeat(2, 1fr); }
}

/* 全站圆角（2026-10-28） */
.upload,
.table-card,
.dropzone { border-radius: var(--radius-lg); }
</style>