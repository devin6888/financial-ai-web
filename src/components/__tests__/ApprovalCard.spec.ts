import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { AgentAmbiguity } from '@/api/agent'
import ApprovalCard from '../ApprovalCard.vue'

/**
 * 审批卡（阶段 22 B）：为什么停、听成了什么、点了候选之后到底提交了什么。
 *
 * 这里只测「载荷」——后端那半（approvalPatch）由 ApprovalPatchTest 单独覆盖，
 * 两边都测才能保证「点了 2024 年报」从界面一路走到检索条件。
 */
const AMBIGUITY: AgentAmbiguity = {
  reasons: ['year_not_specified'],
  candidates: [
    { kind: 'YEAR', value: 2024, label: '2024 年报（1 份）' },
    { kind: 'YEAR', value: 2025, label: '2025 年报（1 份）' },
    { kind: 'ALL_YEARS', value: '', label: '两份都看（2024 + 2025）' },
  ],
  understood: {
    queryType: 'FACT_LOOKUP',
    companyCodes: ['300059'],
    metrics: ['营业总收入', '净利润'],
    yearFrom: 0,
    yearTo: 0,
    scopeYears: [2024, 2025],
  },
}

function mountCard(props: Record<string, unknown> = {}) {
  return mount(ApprovalCard, {
    props: { plan: ['理解问题：营业总收入', '问题没说清（year_not_specified）'], ambiguity: AMBIGUITY, busy: false, ...props },
  })
}

describe('ApprovalCard', () => {
  it('把原因翻成人话，并展示系统当前的理解', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('没说看哪一年')
    expect(wrapper.text()).toContain('300059')
    expect(wrapper.text()).toContain('营业总收入、净利润')
    expect(wrapper.text()).toContain('2024 / 2025 年')
    expect(wrapper.text()).toContain('还没开始检索')
  })

  it('点某一年：直接通过，并把 yearFrom/yearTo 交给后端', async () => {
    const wrapper = mountCard()
    const chip = wrapper.findAll('.cand').find((b) => b.text().includes('2025 年报'))
    expect(chip).toBeTruthy()
    await chip!.trigger('click')
    await wrapper.find('.btn.primary').trigger('click')

    const events = wrapper.emitted('decide')
    expect(events).toHaveLength(1)
    expect(events![0]).toEqual(['APPROVE', '', { yearFrom: 2025, yearTo: 2025 }])
  })

  it('补充文本非空：走 EDIT，文本原样带上（后端拼进检索式）', async () => {
    const wrapper = mountCard()
    await wrapper.find('textarea').setValue('只看 2024 年的总营收')
    await wrapper.find('.btn.primary').trigger('click')

    const events = wrapper.emitted('decide')
    expect(events![0]).toEqual(['EDIT', '只看 2024 年的总营收', {}])
  })

  it('「两份都看」不选年份：只提交 APPROVE，不带任何过滤条件', async () => {
    const wrapper = mountCard()
    const all = wrapper.findAll('.cand').find((b) => b.text().includes('两份都看'))
    await all!.trigger('click')
    await wrapper.find('.btn.primary').trigger('click')

    expect(wrapper.emitted('decide')![0]).toEqual(['APPROVE', '', {}])
  })

  it('驳回必须有理由；busy 时全部禁用', async () => {
    const wrapper = mountCard()
    expect(wrapper.find('.btn.danger').attributes('disabled')).toBeDefined()

    await wrapper.find('textarea').setValue('不想查这个')
    await wrapper.find('.btn.danger').trigger('click')
    expect(wrapper.emitted('decide')![0]).toEqual(['REJECT', '不想查这个', {}])

    const busy = mountCard({ busy: true })
    expect(busy.find('.btn.primary').attributes('disabled')).toBeDefined()
    expect(busy.find('.btn.danger').attributes('disabled')).toBeDefined()
  })

  it('没有 ambiguity（老后端）：不崩，只有计划与按钮', () => {
    const wrapper = mountCard({ ambiguity: null })
    expect(wrapper.findAll('.cand')).toHaveLength(0)
    expect(wrapper.text()).toContain('先确认一下理解')
  })
})
