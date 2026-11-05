import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { AgentRunView } from '@/api/agent'
import AgentTimeline from '../AgentTimeline.vue'

/**
 * 执行过程时间线（2026-11-03）：默认收起，点一下才展开。
 *
 * 为什么值得测：收起之后「执行过程」整块不再占屏幕，但**信息不能丢** ——
 * 收起状态必须能看出「跑了几步、合计多久」，否则用户只能点开才敢判断这次跑得对不对。
 */
function view(overrides: Partial<AgentRunView> = {}): AgentRunView {
  return {
    runId: '13320f07-0396-4cad-a459-90283460c47e',
    status: 'DONE',
    currentNode: null,
    question: '营业总收入和净利润分别是多少',
    plan: ['理解问题：two metrics', '问题没说清（year_not_specified）→ 先请人确认'],
    decision: 'APPROVE',
    decisionNote: null,
    error: null,
    answer: '营业总收入为 160.68 亿元。',
    warnings: [],
    evidence: [],
    steps: [
      { seq: 1, node: 'understand', status: 'OK', summary: '问题已结构化', durationMs: 15600 },
      { seq: 2, node: 'plan', status: 'OK', summary: '单轮检索', durationMs: 249 },
      { seq: 3, node: 'answer', status: 'OK', summary: '答案已生成（98 字）', durationMs: 11200 },
    ],
    ...overrides,
  }
}

describe('AgentTimeline', () => {
  it('默认收起：不渲染步骤与计划，只留一行摘要', () => {
    const wrapper = mount(AgentTimeline, { props: { agent: view() } })

    expect(wrapper.find('.track').exists()).toBe(false)
    expect(wrapper.find('.plan').exists()).toBe(false)
    // 收起也要能判断这轮跑得怎么样：步数与合计耗时
    expect(wrapper.text()).toContain('3 步')
    expect(wrapper.text()).toContain('合计 27.0s')
    expect(wrapper.find('.bar').attributes('aria-expanded')).toBe('false')
  })

  it('点标题栏展开后能看到每个节点与耗时', async () => {
    const wrapper = mount(AgentTimeline, { props: { agent: view() } })

    await wrapper.find('.bar').trigger('click')

    expect(wrapper.find('.track').exists()).toBe(true)
    expect(wrapper.find('.plan').exists()).toBe(true)
    expect(wrapper.findAll('.node')).toHaveLength(3)
    expect(wrapper.text()).toContain('理解问题')
    expect(wrapper.text()).toContain('15.6s')
    expect(wrapper.find('.bar').attributes('aria-expanded')).toBe('true')
  })

  it('再点一次收起回去', async () => {
    const wrapper = mount(AgentTimeline, { props: { agent: view() } })

    await wrapper.find('.bar').trigger('click')
    await wrapper.find('.bar').trigger('click')

    expect(wrapper.find('.track').exists()).toBe(false)
    expect(wrapper.find('.bar').attributes('aria-expanded')).toBe('false')
  })

  it('还在跑时收起状态也要说明「正在做什么」', () => {
    const wrapper = mount(AgentTimeline, {
      props: { agent: view({ status: 'RUNNING', steps: view().steps.slice(0, 1) }) },
    })

    expect(wrapper.text()).toContain('分析中')
    expect(wrapper.text()).toContain('正在：理解问题')
    expect(wrapper.text()).toContain('1 步')
  })

  it('失败的运行默认展开：步骤就是唯一排错线索', () => {
    const wrapper = mount(AgentTimeline, { props: { agent: view({ status: 'FAILED' }) } })

    expect(wrapper.find('.track').exists()).toBe(true)
    expect(wrapper.find('.bar').attributes('aria-expanded')).toBe('true')
  })

  it('耗时缺失或为 0 时不显示 0ms', () => {
    const wrapper = mount(AgentTimeline, {
      props: {
        agent: view({
          steps: [{ seq: 1, node: 'plan', status: 'OK', summary: null, durationMs: 0 }],
        }),
      },
    })

    expect(wrapper.text()).not.toContain('0ms')
    expect(wrapper.text()).toContain('1 步')
  })
})
