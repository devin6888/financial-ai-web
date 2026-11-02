<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ask, askStream } from '@/api/chat'
import { resumeAgent, type AgentFinalView, type AgentHandlers, type AgentRunView } from '@/api/agent'
import { ApiError } from '@/api/client'
import { getContext, listMessages } from '@/api/conversations'
import { listSelectableDocuments } from '@/api/documents'
import type { ChatScope, ChatResponse, Citation, ContextView, MessageView, SelectableDocument } from '@/api/types'
import ContextDrawer from '@/components/ContextDrawer.vue'
import ConversationList from '@/components/ConversationList.vue'
import EvidencePanel from '@/components/EvidencePanel.vue'
import MessageBubble from '@/components/MessageBubble.vue'
import ScopePicker from '@/components/ScopePicker.vue'
import { PANEL_DEFAULT, PANEL_MAX, PANEL_MIN, clampPanelWidth, readPanelWidth, writePanelWidth } from '@/utils/panelWidth'
import { describe } from '@/stores/session'
import { useConversationStore } from '@/stores/conversation'
import type { ChatMessage, StreamTimings } from '@/types/ui'

/**
 * 问答页 = 会话栏 + 对话流 + 证据面板。
 *
 * 约束（与阶段 10 一致）：
 * 1) 不乐观追加助手消息：答案必须来自后端（含引用与 warnings）。
 * 2) 会话 id 以路由为唯一真相；新建后先写 loadedId 再 replace，避免重复拉取。
 * 3) 作用域是本轮请求的，改完下一轮生效。
 */

const route = useRoute()
const router = useRouter()
const store = useConversationStore()

const docs = ref<SelectableDocument[]>([])
const messages = ref<ChatMessage[]>([])
const scope = ref<ChatScope>(emptyScope())
const question = ref('')
const asking = ref(false)
const loadingMessages = ref(false)
const error = ref<string | null>(null)
const context = ref<ContextView | null>(null)
const streamRef = ref<HTMLElement | null>(null)
/** 消息流末尾的哨兵：它离开可视区 = 用户已经翻上去了 */
const endRef = ref<HTMLElement | null>(null)
const loadedId = ref<number | null>(null)
const hasMore = ref(false)
const drawerOpen = ref(false)
const panelOpen = ref(false)
const panelTab = ref<'evidence' | 'diagnose' | 'page'>('evidence')

/**
 * 证据侧栏宽度（px）。默认 424，拖手柄改，松手落 localStorage（阶段 12 §11）。
 * 读回时按当前视口重新夹紧：上次在宽屏拖到 700，换到 1280 的窗口也不会把正文压没。
 */
const panelWidth = ref(readPanelWidth(safeStorage(), window.innerWidth))
const resizing = ref(false)

/** 隐私模式下 localStorage 会抛；宽度记不住不该影响看证据 */
function safeStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}
const activeMessageId = ref<string | null>(null)
const activeNumber = ref<number | null>(null)
const composerRef = ref<HTMLTextAreaElement | null>(null)

const EXAMPLES = [
  '东方财富 2025 年营业总收入是多少？',
  '2025 年净利润比去年增长多少？',
  '分季度的营业收入分别是多少？',
  '经营活动产生的现金流量净额是多少？',
]

const currentId = computed<number | null>(() => {
  const raw = route.params.id
  const value = Array.isArray(raw) ? raw[0] : raw
  return value ? Number(value) : null
})

const currentTitle = computed(() => {
  const item = store.items.find((c) => c.conversationId === currentId.value)
  return item?.title ?? '新会话'
})

/** 时间线的初始壳：节点与计划都由后续 stage / approval 填充，这里只保证结构存在。 */
function emptyAgent(question: string): AgentRunView {
  return {
    runId: '',
    status: 'RUNNING',
    currentNode: null,
    question,
    plan: [],
    decision: null,
    decisionNote: null,
    error: null,
    answer: null,
    warnings: [],
    evidence: [],
    steps: [],
  }
}

function emptyScope(): ChatScope {
  return { kind: 'CORPUS', documentIds: [], query: { companyCodes: [], years: [], docTypes: [], industries: [] } }
}

onMounted(async () => {
  await Promise.all([store.load(), loadDocs()])
  if (currentId.value) {
    await open(currentId.value)
  }
})

watch(currentId, async (id, previous) => {
  if (id && id !== previous && id !== loadedId.value) {
    await open(id)
  }
  if (!id) {
    messages.value = []
    context.value = null
    loadedId.value = null
    hasMore.value = false
    closePanel()
  }
})

async function loadDocs(): Promise<void> {
  try {
    docs.value = await listSelectableDocuments()
  } catch (e) {
    if (e instanceof ApiError && e.isUnauthorized) return
    error.value = '文档列表加载失败：' + describe(e)
  }
}

async function open(id: number): Promise<void> {
  loadingMessages.value = true
  error.value = null
  try {
    const page = await listMessages(id, 50)
    messages.value = page.messages.slice().reverse().map(toMessage)
    loadedId.value = id
    hasMore.value = page.nextBeforeId !== null
    await loadContext(id)
  } catch (e) {
    error.value = describe(e)
    if (e instanceof ApiError && e.isNotFound) {
      await router.replace('/chat')
    }
  } finally {
    loadingMessages.value = false
    scrollToBottom()
  }
}

async function loadContext(id: number): Promise<void> {
  try {
    context.value = await getContext(id)
  } catch {
    context.value = null
  }
}

async function loadMore(): Promise<void> {
  const id = currentId.value
  const oldest = messages.value[0]
  if (!id || !oldest) return
  const beforeId = Number(oldest.id.replace(/^m/, ''))
  if (!Number.isFinite(beforeId)) return
  try {
    const page = await listMessages(id, 50, beforeId)
    messages.value = [...page.messages.slice().reverse().map(toMessage), ...messages.value]
    hasMore.value = page.nextBeforeId !== null
  } catch (e) {
    error.value = describe(e)
  }
}

async function send(text?: string): Promise<void> {
  const value = (text ?? question.value).trim()
  if (!value || asking.value) return
  error.value = null
  const stamp = new Date().toISOString()
  const localId = 'l' + Date.now()

  let conversationId = currentId.value
  try {
    if (!conversationId) {
      conversationId = await store.create(value.slice(0, 40), scope.value)
    }
  } catch (e) {
    error.value = '新建会话失败：' + describe(e)
    return
  }

  messages.value.push({ id: localId + '-q', role: 'USER', text: value, at: stamp })
  const pendingId = localId + '-a'
  // 先按 understanding 起头：understanding 永远是第一段，所以这不是「编阶段」，
  // 而是「后端第一个 stage 到达前（实测 19ms）也别让用户看到空白」。
  // 若后端是旧版本（根本不发 stage），状态行会停在这里 —— 这是 ST13 §11 记录的兼容行为。
  messages.value.push({
    id: pendingId,
    role: 'ASSISTANT',
    text: '',
    pending: true,
    at: stamp,
    stage: { phase: 'understand', label: '正在理解问题', detail: null },
  })
  question.value = ''
  asking.value = true
  scrollToBottom(true)

  try {
    const response: ChatResponse | null = await askWithStream(pendingId, value, conversationId)
    if (!response) {
      // 停在审批：气泡此时由审批卡撑起来，不写任何答案文本
      store.touch(conversationId)
      if (loadedId.value !== conversationId) {
        loadedId.value = conversationId
        await router.replace('/chat/' + conversationId)
      }
      return
    }
    patch(pendingId, {
      pending: false,
      streaming: false,
      text: response.answer || '（模型没有给出答案，可展开诊断查看原因）',
      response,
    })
    store.touch(conversationId)
    if (loadedId.value !== conversationId) {
      loadedId.value = conversationId
      await router.replace('/chat/' + conversationId)
    }
    await loadContext(conversationId)
    // 不再自动弹证据面板：它是浮层，会自动盖住刚刚生成的答案
  } catch (e) {
    const message = e instanceof ApiError && e.isScopeEmpty
      ? '这个范围里没有可检索的文档。换一个范围，或在「选文档」里勾几份已就绪的文档。'
      : describe(e)
    error.value = message
    patch(pendingId, { pending: false, streaming: false, error: message })
  } finally {
    asking.value = false
  }
}


/**
 * 先走流式，失败就回落同步接口。
 *
 * 回落条件刻意收窄：只有「流式这条链路本身不可用」才回落
 * （接口不存在 404 / 流中断 STREAM_INCOMPLETE / 网络错 NETWORK / 服务器 5xx），
 * 而 409 SCOPE_EMPTY 与 401 是业务结论，重试没有意义，直接抛给调用方去提示。
 *
 * 流式过程中已经吐出来的文字不会撤掉：如果最终失败，气泡会被整条替换成错误态，
 * 不会出现「半句话 + 错误」同时留在屏幕上的情况。
 */
async function askWithStream(
  pendingId: string,
  question: string,
  conversationId: number,
): Promise<ChatResponse | null> {
  let streamed = ''
  let final: ChatResponse | null = null
  let waiting = false
  const started = Date.now()
  const timings: StreamTimings = { firstStageMs: null, metaMs: null, firstTokenMs: null, totalMs: null }

  const streamable = async (): Promise<ChatResponse | null> => {
    await askStream({ question, conversationId, scope: scope.value }, {
      // 阶段事件：后端一进某一段就发，所以这里几乎立刻会有第一条（实测 19ms）
      onStage: (stage) => {
        if (timings.firstStageMs === null) timings.firstStageMs = Date.now() - started
        patch(pendingId, { stage })
      },
      // 证据先到：meta =「证据集合已确定」，此时答案一个字都还没有
      onMeta: (m) => {
        if (timings.metaMs === null) timings.metaMs = Date.now() - started
        patch(pendingId, { streaming: true, evidencePreview: m.evidence })
        scrollToBottom()
      },
      onDelta: (chunk) => {
        if (timings.firstTokenMs === null) timings.firstTokenMs = Date.now() - started
        streamed += chunk
        patch(pendingId, { pending: true, streaming: true, text: streamed })
        scrollToBottom()
      },
      // 图停在「理解确认」前：气泡改由审批卡撑起来，别再写答案文本
      onApproval: (approval) => {
        waiting = true
        timings.totalMs = Date.now() - started
        patch(pendingId, {
          agent: { ...emptyAgent(question), ...approval } as AgentRunView,
          agentBusy: false,
          stage: null,
          pending: false,
          streaming: false,
          timings,
        })
      },
      onFinal: (response) => {
        final = response
      },
    })
    return final
  }

  try {
    const response = await streamable()
    if (waiting) return null
    if (!response) throw new ApiError(0, 'STREAM_INCOMPLETE', '流式响应没有给出最终结果')
    timings.totalMs = Date.now() - started
    patch(pendingId, { timings, stage: null })
    console.info('[stream] ' + JSON.stringify(timings))
    return response
  } catch (e) {
    if (e instanceof ApiError && (e.isScopeEmpty || e.isUnauthorized)) throw e
    patch(pendingId, { text: '', streaming: false, stage: null })
    // 同步接口现在也走图（P4），所以回落拿到的是同一份 ChatResponse
    return ask({ question, conversationId, scope: scope.value })
  }
}

/**
 * 提交人工决定。三种决定都走同一个流式端点，后续 delta / final 与首次调用完全同构，
 * 所以这里复用 agentHandlers —— 少一套渲染路径就少一处不一致。
 */
async function decide(messageId: string, decision: 'APPROVE' | 'EDIT' | 'REJECT', note: string): Promise<void> {
  const message = messages.value.find((item) => item.id === messageId)
  const runId = message?.agent?.runId
  if (!message || !runId || asking.value) return
  error.value = null
  patch(messageId, { agentBusy: true })
  const started = Date.now()
  let streamed = message.text
  let final: AgentFinalView | null = null
  let waiting = false
  const timings: StreamTimings = { firstStageMs: null, metaMs: null, firstTokenMs: null, totalMs: null }

  const handlers = agentHandlers(messageId, () => started, timings, (text) => {
    streamed += text
  }, (view) => {
    if (view.status === 'WAITING_APPROVAL') waiting = true
    else final = view
  })

  try {
    await resumeAgent(runId, decision, note || null, handlers)
    timings.totalMs = Date.now() - started
    if (final) {
      const view = final as AgentFinalView
      patch(messageId, {
        agent: view,
        agentBusy: false,
        timings,
        stage: null,
        pending: false,
        streaming: false,
        text: view.answer || '（分析结束，没有生成答案）',
        response: view.response ?? toChatResponse(view, currentId.value),
      })
    } else if (waiting) {
      patch(messageId, { agentBusy: false, stage: null, pending: false, streaming: false })
    } else {
      patch(messageId, { agentBusy: false, pending: false, streaming: false, text: streamed })
    }
  } catch (e) {
    const text = describe(e)
    error.value = text
    patch(messageId, { agentBusy: false, pending: false, streaming: false, error: text })
  }
}

/** 两个入口（首次 / 审批后）共用的处理器工厂。 */
function agentHandlers(
  messageId: string,
  startedAt: () => number,
  timings: StreamTimings,
  append: (text: string) => void,
  settle: (view: AgentRunView) => void,
): AgentHandlers {
  return {
    onStage: (stage) => {
      if (timings.firstStageMs === null) timings.firstStageMs = Date.now() - startedAt()
      const view = messages.value.find((item) => item.id === messageId)?.agent
      if (!view) {
        patch(messageId, { stage })
        return
      }
      // 时间线靠 stage 增量推送：每个节点跑完才发一次，所以直接把新节点追加到已有轨迹
      patch(messageId, {
        stage,
        agent: {
          ...view,
          status: 'RUNNING',
          currentNode: stage.phase,
          steps: [
            ...view.steps,
            {
              seq: view.steps.length + 1,
              node: stage.phase,
              status: 'OK',
              summary: stage.label,
              durationMs: null,
            },
          ],
        },
      })
    },
    onDelta: (chunk) => {
      if (timings.firstTokenMs === null) timings.firstTokenMs = Date.now() - startedAt()
      append(chunk)
      const current = messages.value.find((item) => item.id === messageId)
      patch(messageId, { pending: true, streaming: true, text: (current?.text ?? '') + chunk })
      scrollToBottom()
    },
    onApproval: (view) => {
      patch(messageId, { agent: view, stage: null, pending: false, streaming: false, text: '' })
      settle(view)
      scrollToBottom()
    },
    onFinal: (view) => {
      patch(messageId, { agent: view, stage: null })
      settle(view)
    },
  }
}

/** 深度分析的 final → 既有气泡能吃的 ChatResponse（口径见 ST11 §17.3）。 */
function toChatResponse(view: AgentRunView, conversationId: number | null): ChatResponse {
  const citations: Citation[] = view.evidence.map((item) => ({
    documentId: item.documentId,
    parentChunkId: null,
    childChunkId: item.chunkId,
    pageStart: item.page,
    pageEnd: item.page,
    bbox: null,
    tableRef: null,
    evidenceType: (item.type ?? 'TEXT') as Citation['evidenceType'],
    unit: null,
    scope: null,
    docTitle: docs.value.find((d) => d.id === item.documentId)?.title ?? null,
    sectionPath: item.sectionPath,
  }))
  return {
    sufficient: view.status !== 'REJECTED',
    answer: view.answer ?? '',
    facts: [],
    citations,
    confidence: null,
    note: view.status === 'REJECTED' ? '本次分析被人工驳回，未生成答案。' : null,
    scope: null,
    warnings: view.warnings ?? [],
    trace: null,
    extensionSuggested: null,
    conversationId,
    messageId: null,
  }
}

function patch(id: string, part: Partial<ChatMessage>): void {
  const index = messages.value.findIndex((item) => item.id === id)
  if (index >= 0) {
    messages.value[index] = { ...messages.value[index], ...part } as ChatMessage
  }
}

function toMessage(item: MessageView): ChatMessage {
  const at = item.createdAt
  if (item.role === 'USER') {
    return { id: 'm' + item.messageId, role: 'USER', text: item.content, at }
  }
  return {
    id: 'm' + item.messageId,
    role: 'ASSISTANT',
    text: item.content,
    at,
    response: {
      sufficient: true,
      answer: item.content,
      facts: [],
      citations: item.citations ?? [],
      confidence: null,
      note: null,
      scope: null,
      warnings: [],
      trace: null,
      extensionSuggested: null,
      conversationId: currentId.value,
      messageId: item.messageId,
    },
  }
}

/** 点正文里的 [E3]：直接翻到原文那一页，高亮框已经在框里 —— 这是「引用可核验」最直观的一步 */
function showPage(messageId: string, number: number): void {
  activeMessageId.value = messageId
  activeNumber.value = number
  panelTab.value = 'page'
  panelOpen.value = true
}

function showEvidence(messageId: string, number: number): void {
  activeMessageId.value = messageId
  activeNumber.value = number
  panelTab.value = 'evidence'
  panelOpen.value = true
}

function openDiagnose(messageId: string): void {
  activeMessageId.value = messageId
  panelTab.value = 'diagnose'
  panelOpen.value = true
}

function closePanel(): void {
  panelOpen.value = false
  activeMessageId.value = null
  activeNumber.value = null
}

/** 拖动起点：记下手柄右缘的绝对位置，之后用「右缘 − clientX」算宽度，不受页面内边距影响 */
let dragRight = 0

function applyPanelWidth(width: number, persist: boolean): void {
  panelWidth.value = clampPanelWidth(width, window.innerWidth)
  if (persist) writePanelWidth(safeStorage(), panelWidth.value)
}

function startResize(event: PointerEvent): void {
  if (event.button !== 0) return
  const dock = (event.currentTarget as HTMLElement).parentElement
  if (!dock) return
  dragRight = dock.getBoundingClientRect().right
  resizing.value = true
  document.body.dataset.resizing = '1'
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', stopResize)
  window.addEventListener('pointercancel', stopResize)
  event.preventDefault()
}

function onResizeMove(event: PointerEvent): void {
  if (!resizing.value) return
  applyPanelWidth(dragRight - event.clientX, false)
}

function stopResize(): void {
  if (!resizing.value) return
  resizing.value = false
  delete document.body.dataset.resizing
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', stopResize)
  window.removeEventListener('pointercancel', stopResize)
  writePanelWidth(safeStorage(), panelWidth.value)
}

/** 双击复位：拖歪了有个确定的回家路 */
function resetWidth(): void {
  applyPanelWidth(PANEL_DEFAULT, true)
}

/**
 * 键盘调宽。手柄在面板左缘，所以 ← 是「把手柄往左推」= 面板变宽；
 * Home / End 到最小 / 最大（口径见 ST12 §11.4）。
 */
function onResizeKey(event: KeyboardEvent): void {
  const step = 16
  if (event.key === 'ArrowLeft') applyPanelWidth(panelWidth.value + step, true)
  else if (event.key === 'ArrowRight') applyPanelWidth(panelWidth.value - step, true)
  else if (event.key === 'Home') applyPanelWidth(PANEL_MIN, true)
  else if (event.key === 'End') applyPanelWidth(PANEL_MAX, true)
  else return
  event.preventDefault()
}

/** 窗口变窄时把已有宽度重新夹紧，否则正文会被挤到 0 */
function onWindowResize(): void {
  applyPanelWidth(panelWidth.value, false)
}

onMounted(() => window.addEventListener('resize', onWindowResize))
onBeforeUnmount(() => window.removeEventListener('resize', onWindowResize))

const activeMessage = computed(() => messages.value.find((m) => m.id === activeMessageId.value) ?? null)

/**
 * 滚到底。force=true 用于「自己刚发了一条消息」这种必须跟随的场合；
 * 其余（流式增量、证据到达）只在用户本来就在底部 40px 内时才滚 ——
 * 否则用户往上翻正文/证据时会被不断拽回底部（阶段 12 的实际体验问题）。
 */
/**
 * 「回到底部」按钮（ST18 需求 9）。
 *
 * 判据不用 scrollHeight 减法：字体加载、图片解码、流式答案长高都会让算术落后一帧，
 * 结果是"明明到底了按钮还在"或者"翻上去了按钮不出来"。这里在消息末尾放一个哨兵元素，
 * 用 IntersectionObserver 看它是否还在视口里 —— 布局怎么变都由浏览器自己算。
 */
const atBottom = ref(true)
let endObserver: IntersectionObserver | null = null

function watchStreamEnd(): void {
  endObserver?.disconnect()
  const root = streamRef.value
  const sentinel = endRef.value
  if (!root || !sentinel || typeof IntersectionObserver === 'undefined') {
    return
  }
  endObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1]
      if (entry) atBottom.value = entry.isIntersecting
    },
    { root, rootMargin: '0px 0px -8px 0px', threshold: 0 },
  )
  endObserver.observe(sentinel)
}

onMounted(() => {
  watchStreamEnd()
  window.addEventListener('resize', onStreamResize)
})
onBeforeUnmount(() => {
  endObserver?.disconnect()
  window.removeEventListener('resize', onStreamResize)
})

/** 窗口变窄/变宽会改变换行高度，需要重算一次。 */
function onStreamResize(): void {
  nextTick(() => {
    const element = streamRef.value
    if (!element) return
    atBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight < 8
  })
}

/** 兜底：老浏览器没有 IntersectionObserver 时，退回滚动监听。 */
function onStreamScroll(): void {
  if (endObserver) return
  const element = streamRef.value
  if (!element) return
  atBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight < 120
}

function scrollToBottom(force = false): void {
  nextTick(() => {
    const element = streamRef.value
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    if (force || distance < 40) element.scrollTop = element.scrollHeight
  })
}

watch(
  () => messages.value.length,
  () => {
    void nextTick(() => watchStreamEnd())
  },
)

async function onNewConversation(): Promise<void> {
  await router.push('/chat')
  messages.value = []
  context.value = null
  loadedId.value = null
  hasMore.value = false
  question.value = ''
  closePanel()
  await nextTick()
  composerRef.value?.focus()
}

async function onSelect(id: number): Promise<void> {
  await router.push('/chat/' + id)
}

async function onRename(id: number, title: string): Promise<void> {
  try {
    await store.rename(id, title)
  } catch (e) {
    error.value = '重命名失败：' + describe(e)
  }
}

async function onRemove(id: number): Promise<void> {
  try {
    await store.remove(id)
    if (currentId.value === id) await onNewConversation()
  } catch (e) {
    error.value = '删除失败：' + describe(e)
  }
}

const contextText = computed(() => {
  const ctx = context.value
  if (!ctx) return ''
  const parts: string[] = []
  if (ctx.companyName || ctx.companyCode) parts.push(ctx.companyName ?? ctx.companyCode ?? '')
  if (ctx.yearFrom || ctx.yearTo) parts.push((ctx.yearFrom ?? '') + '–' + (ctx.yearTo ?? ''))
  if (ctx.currentMetric) parts.push(ctx.currentMetric)
  if (ctx.documentIds.length) parts.push(ctx.documentIds.length + ' 份文档')
  return parts.join(' · ')
})
</script>

<template>
  <div class="fa-page chat-page">
    <ConversationList
      :items="store.items"
      :current-id="currentId"
      :loading="store.loading"
      @select="onSelect"
      @create="onNewConversation"
      @rename="onRename"
      @remove="onRemove"
    />

    <section class="thread">
      <header class="thread-bar">
        <div class="title-wrap">
          <div class="fa-eyebrow">SESSION</div>
          <h1 class="thread-title">{{ currentTitle }}</h1>
        </div>
        <div class="bar-actions">
          <span v-if="contextText" class="ctx-chip fa-chip fa-chip--mute" :title="'会话上下文：' + contextText">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M12 3v18M3 12h18" />
            </svg>
            {{ contextText }}
          </span>
          <button type="button" class="fa-btn fa-btn--sm" :disabled="!currentId" @click="drawerOpen = true">编辑上下文</button>
          <button
            type="button"
            class="fa-btn fa-btn--sm"
            :disabled="!messages.length"
            @click="activeMessageId = messages[messages.length - 1]?.id ?? null; panelTab = 'evidence'; panelOpen = !panelOpen"
          >
            {{ panelOpen ? '收起证据' : '证据面板' }}
          </button>
        </div>
      </header>

      <ContextDrawer
        v-model="drawerOpen"
        :conversation-id="currentId"
        :context="context"
        :docs="docs"
        @saved="context = $event"
      />

      <div ref="streamRef" class="fa-scroll stream" @scroll.passive="onStreamScroll">
        <div class="stream-inner">
          <!-- 空态：直接给四个能问出口的问题，演示时不用现场想 -->
          <div v-if="!messages.length && !loadingMessages" class="hero">
            <div class="fa-eyebrow">ASK THE ANNUAL REPORT</div>
            <h2 class="fa-title-xl hero-title">一句话问年报，<br />答案带页码回来。</h2>
            <p class="hero-sub">
              混合检索（向量 + 中文全文）在 {{ docs.length }} 份已就绪的文档里找证据，
              每个数字都标注到页与章节；检索不到就直说不足，不编。
            </p>
            <div class="examples">
              <button
                v-for="example in EXAMPLES"
                :key="example"
                type="button"
                class="example"
                @click="send(example)"
              >
                <span class="example-q fa-serif">{{ example }}</span>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>

          <div v-if="hasMore" class="more">
            <button type="button" class="fa-btn fa-btn--quiet fa-btn--sm" @click="loadMore">加载更早的消息</button>
          </div>

          <MessageBubble
            v-for="item in messages"
            :key="item.id"
            :message="item"
            :active-cite="activeMessageId === item.id ? activeNumber : null"
            @cite="showPage(item.id, $event)"
            @chip="showEvidence(item.id, $event)"
            @panel="openDiagnose(item.id)"
            @decide="(decision, note) => decide(item.id, decision, note)"
          />
          <div ref="endRef" class="stream-end" aria-hidden="true" />
        </div>
      </div>

      <div class="composer-wrap">
        <button
          v-if="!atBottom"
          type="button"
          class="to-bottom"
          aria-label="回到底部"
          title="回到底部"
          @click="scrollToBottom(true)"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        </button>

        <div v-if="error" class="composer-error">
          <span class="err-tag">!</span>
          <span>{{ error }}</span>
          <button type="button" class="err-close" @click="error = null">×</button>
        </div>

        <div class="composer" :class="{ busy: asking }">
          <textarea
            ref="composerRef"
            v-model="question"
            class="input"
            rows="2"
            :disabled="asking"
            placeholder="问年报里的问题，Enter 发送，Shift + Enter 换行"
            @keydown.enter.exact.prevent="send()"
          />
          <div class="composer-foot">
            <ScopePicker v-model:scope="scope" :docs="docs" :disabled="asking" />
            <span class="fa-faint hint">范围改动从下一轮生效</span>
            <button
              type="button"
              class="fa-btn fa-btn--accent send"
              :disabled="!question.trim() || asking"
              @click="send()"
            >
              {{ asking ? '生成中…' : '发送' }}
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            </button>
          </div>
        </div>
        <p class="disclaimer">答案由模型基于检索到的原文生成，数字必须能回查到证据；引用编号可点开核对。</p>
      </div>
    </section>

    <!-- 证据侧栏：与会话栏、正文并列；左缘手柄可拖宽，收起后正文拿回全部宽度 -->
    <div v-if="panelOpen && activeMessage" class="panel-dock" :style="{ width: panelWidth + 'px' }">
      <div
        class="dock-resizer"
        :class="{ dragging: resizing }"
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整证据面板宽度，双击复位"
        tabindex="0"
        title="拖动调整宽度；双击复位；←/→ 微调"
        @pointerdown="startResize"
        @dblclick="resetWidth"
        @keydown="onResizeKey"
      />
      <EvidencePanel
        :citations="activeMessage.response?.citations ?? []"
        :active="activeNumber"
        :warnings="activeMessage.response?.warnings ?? []"
        :trace="activeMessage.response?.trace ?? null"
        :sufficient="activeMessage.response?.sufficient ?? true"
        :note="activeMessage.response?.note ?? null"
        :tab="panelTab"
        @close="closePanel"
        @select="(n: number) => (activeNumber = n)"
      />
    </div>
  </div>
</template>

<style scoped>
/* 深度分析开关：开/关必须在视觉上分得清（演示时会来回切） */
.chat-page { flex-direction: row; position: relative; }

.thread {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.thread-bar {
  height: 58px;
  flex: 0 0 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 22px;
  border-bottom: 1px solid var(--rule);
}

.title-wrap { min-width: 0; }

.thread-title {
  font-family: var(--sans);
  font-size: 16px;
  font-weight: 600;
  margin: 3px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 520px;
}

.bar-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.ctx-chip { max-width: 300px; overflow: hidden; text-overflow: ellipsis; }

.stream { scroll-behavior: smooth; }
.stream-end { height: 1px; }

/* 回到底部（2026-10-30 ST18 需求 9）：只在用户确实上翻后出现，贴在输入框上方 */
.to-bottom {
  position: absolute;
  right: 4px;
  top: -46px;
  z-index: 5;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--rule-strong);
  border-radius: 50%;
  background: var(--paper-raised);
  color: var(--ink-2);
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(23, 22, 20, 0.09);
  transition: color 160ms var(--ease), border-color 160ms var(--ease);
}
.to-bottom:hover { color: var(--accent); border-color: var(--accent); }

.stream-inner {
  max-width: 960px;
  margin: 0 auto;
  padding: 6px 44px 28px;
}

.hero { padding: 64px 0 40px; }

.hero-title { margin: 14px 0 0; font-size: 38px; line-height: 1.4; }

.hero-sub {
  margin: 16px 0 0;
  max-width: 560px;
  color: var(--ink-3);
  font-size: 13px;
  line-height: 1.9;
}

.examples {
  margin-top: 34px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--rule);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.example {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 15px 16px;
  background: var(--paper-raised);
  border: 0;
  text-align: left;
  cursor: pointer;
  transition: background 160ms var(--ease);
}

.example:hover { background: var(--paper-sink); }
.example:hover svg { color: var(--accent); transform: translateX(2px); }
.example svg { color: var(--ink-4); flex-shrink: 0; transition: all 160ms var(--ease); }
.example-q { font-size: 14px; line-height: 1.6; }

.more { padding: 12px 0; text-align: center; }

.composer-wrap {
  position: relative;
  flex: 0 0 auto;
  padding: 0 44px 18px;
  max-width: 960px;
  margin: 0 auto;
  width: 100%;
}

.composer-error {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(178, 58, 40, 0.3);
  border-radius: var(--radius);
  background: var(--accent-soft);
  font-size: 12px;
  color: var(--accent-strong);
}

.err-tag { font-family: var(--mono); font-weight: 700; }
.err-close { margin-left: auto; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 14px; }

.composer {
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-lg);
  background: var(--paper-raised);
  overflow: hidden;
  transition: border-color 160ms var(--ease), box-shadow 160ms var(--ease);
}

.composer:focus-within { border-color: var(--ink-4); box-shadow: 0 10px 30px -24px rgba(23, 22, 20, 0.6); }
.composer.busy { opacity: 0.85; }

.input {
  display: block;
  width: 100%;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  padding: 13px 15px 6px;
  font-family: var(--sans);
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--ink);
}

.input::placeholder { color: var(--ink-4); }

.composer-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px 10px 12px;
}

.hint { font-size: 10.5px; }
.send { margin-left: auto; }

.disclaimer {
  margin: 8px 0 0;
  text-align: center;
  font-size: 10.5px;
  color: var(--ink-4);
}

.panel-dock {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  min-height: 0;
  border-left: 1px solid var(--rule-strong);
  background: var(--paper-raised);
}

/* 手柄压在面板左缘：4px 命中区在正文一侧，不用瞄准那条线 */
.dock-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  width: 9px;
  cursor: col-resize;
  z-index: 2;
  background: transparent;
  border: 0;
  outline: none;
}

.dock-resizer::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 4px;
  width: 1px;
  background: transparent;
  transition: background 120ms ease;
}

.dock-resizer:hover::after,
.dock-resizer.dragging::after,
.dock-resizer:focus-visible::after { background: var(--accent); }

.panel-dock :deep(.panel) {
  width: 100%;
  flex: 1 1 auto;
  height: 100%;
  border: 0;
  border-radius: 0;
  background: var(--paper-raised);
  box-shadow: none;
  overflow: hidden;
}

/* 窄屏退回浮层：再挤压正文就只剩 200px，不如盖上去（此时手柄隐藏，宽度跟随 424） */
@media (max-width: 980px) {
  .panel-dock {
    position: absolute;
    top: 62px;
    right: 10px;
    bottom: 10px;
    width: min(var(--evidence-w), calc(100% - 20px)) !important;
    z-index: 30;
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius-lg);
    box-shadow: 0 30px 80px -40px rgba(23, 22, 20, 0.6);
    overflow: hidden;
  }
  .dock-resizer { display: none; }
}

@media (max-width: 1180px) {
  .stream-inner { padding: 6px 22px 20px; }
  .composer-wrap { padding: 0 22px 12px; }
  .examples { grid-template-columns: 1fr; }
}
</style>