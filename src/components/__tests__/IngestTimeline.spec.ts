import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { IngestStep, IngestStepStatus, IngestView } from '@/api/ingest'
import IngestTimeline from '../IngestTimeline.vue'

/**
 * 执行记录组件（阶段 19 §7）：
 * 三条分支（RUNNING 完整模板 / DONE 只给摘要 / FAILED 给错误+重试）、
 * 以及「当前这一步看得见在动」的三重信号（脉冲点、流光条、秒数自增）。
 */
const getIngest = vi.fn<(id: number) => Promise<IngestView>>()
const retryIngest = vi.fn<(id: number) => Promise<{ documentId: number; parseStatus: string; attempt: number }>>()

vi.mock('@/api/ingest', () => ({
  getIngest: (id: number) => getIngest(id),
  retryIngest: (id: number) => retryIngest(id),
}))

function step(
  seq: number,
  label: string,
  status: IngestStepStatus,
  extra: Record<string, unknown> = {},
): IngestStep {
  return {
    seq,
    step: 'STEP_' + seq,
    label,
    status,
    detail: null,
    retry: 0,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    ...extra,
  } as IngestStep
}

function view(overrides: Partial<IngestView> = {}): IngestView {
  return {
    state: 'RUNNING',
    attempt: 1,
    flow: 'PARSE',
    currentStep: 3,
    totalSteps: 8,
    startedAt: new Date(Date.now() - 92_000).toISOString(),
    finishedAt: null,
    error: null,
    summary: {},
    steps: [],
    ...overrides,
  }
}

const RUNNING_VIEW = view({
  steps: [
    step(1, '已入队', 'OK', { durationMs: 120 }),
    step(2, '提交解析作业', 'OK', { durationMs: 480, detail: 'job=abc-123' }),
    step(3, '解析中', 'RUNNING', {
      startedAt: new Date(Date.now() - 5_000).toISOString(),
      detail: '解析中 · 已用 0m05s',
    }),
    step(4, '解析完成', 'PENDING'),
    step(5, '切块中', 'PENDING'),
    step(6, '切块完成', 'PENDING'),
    step(7, '向量化', 'PENDING'),
    step(8, '切换 ACTIVE', 'PENDING'),
  ],
})

beforeEach(() => {
  getIngest.mockResolvedValue(RUNNING_VIEW)
  retryIngest.mockResolvedValue({ documentId: 42, parseStatus: 'PENDING', attempt: 2 })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

async function mountWith(id: number | null = 42) {
  const wrapper = mount(IngestTimeline, { props: { documentId: id } })
  await flushPromises()
  return wrapper
}

describe('IngestTimeline', () => {
  it('RUNNING：渲染完整模板，未来步骤显示「未执行」', async () => {
    const wrapper = await mountWith()

    expect(wrapper.findAll('.tl-item')).toHaveLength(8)
    expect(wrapper.find('.tl-item.is-running').text()).toContain('解析中')
    expect(wrapper.findAll('.tl-item.is-pending')).toHaveLength(5)
    expect(wrapper.text()).toContain('第 3/8 步')
    expect(wrapper.text()).toContain('job=abc-123')
  })

  it('RUNNING：当前步有脉冲点与流光条，其余步骤没有', async () => {
    const wrapper = await mountWith()

    expect(wrapper.findAll('.tl-flow')).toHaveLength(1)
    expect(wrapper.find('.tl-item.is-running .tl-flow').exists()).toBe(true)
    expect(wrapper.find('.tl-pulse').exists()).toBe(true)
  })

  it('RUNNING：秒数每秒自增，不依赖轮询', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-31T09:00:00Z'))
    getIngest.mockResolvedValue(
      view({
        steps: [
          step(1, '已入队', 'OK', { durationMs: 120 }),
          step(2, '提交解析作业', 'OK', { durationMs: 480 }),
          step(3, '解析中', 'RUNNING', { startedAt: new Date('2026-10-31T08:59:55Z').toISOString() }),
        ],
      }),
    )

    const wrapper = await mountWith()
    expect(wrapper.find('.tl-time.is-live').text()).toBe('5s')

    vi.advanceTimersByTime(1000)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tl-time.is-live').text()).toBe('6s')
    // 只走了 1 秒，不该触发网络请求（轮询是 2 秒一次）
    expect(getIngest).toHaveBeenCalledTimes(1)
  })

  it('DONE：只回摘要，不展示中间步骤', async () => {
    getIngest.mockResolvedValue(
      view({
        state: 'DONE',
        currentStep: 8,
        finishedAt: new Date().toISOString(),
        summary: { pages: 181, chunks: 654, totalMs: 200_000, parseMs: 180_000, embedMs: 6_000, embedded: 38, reused: 616 },
        steps: [],
      }),
    )

    const wrapper = await mountWith()

    expect(wrapper.findAll('.tl-item')).toHaveLength(0)
    expect(wrapper.text()).toContain('181')
    expect(wrapper.text()).toContain('654')
    expect(wrapper.text()).toContain('3m20s')
    expect(wrapper.find('.tl-list').exists()).toBe(false)
  })

  it('FAILED：显示错误原文与重试按钮，点击后调接口并通知父组件', async () => {
    getIngest.mockResolvedValue(
      view({
        state: 'FAILED',
        currentStep: 3,
        error: 'IllegalStateException: 解析作业失败: boom',
        steps: [step(3, '解析中', 'FAILED', { detail: '解析作业失败: boom' })],
      }),
    )

    const wrapper = await mountWith()
    expect(wrapper.text()).toContain('boom')
    expect(wrapper.find('.tl-flow').exists()).toBe(false)

    await wrapper.find('.tl-error button').trigger('click')
    await flushPromises()

    expect(retryIngest).toHaveBeenCalledWith(42)
    expect(wrapper.emitted('retried')?.[0]).toEqual([42])
  })

  it('NONE：没有记录时整块不渲染（前端退回按 document 状态展示）', async () => {
    getIngest.mockResolvedValue(view({ state: 'NONE', steps: [], attempt: null, totalSteps: 0 }))

    const wrapper = await mountWith()
    expect(wrapper.find('.tl').exists()).toBe(false)
  })

  it('还没拿到 documentId 时不请求接口', async () => {
    await mountWith(null)
    expect(getIngest).not.toHaveBeenCalled()
  })
})
