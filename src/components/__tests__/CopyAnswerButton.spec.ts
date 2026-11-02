import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Citation } from '@/api/types'
import CopyAnswerButton from '../CopyAnswerButton.vue'

/**
 * 复制按钮的三种状态（ST16 Task 4 §4.7 UI 行为）：
 * 流式中禁用、复制成功给反馈且 2 秒复位、剪贴板不可用时降级。
 */
const CITE: Citation = {
  documentId: 7,
  parentChunkId: 7000,
  childChunkId: 7216,
  pageStart: 7,
  pageEnd: 7,
  bbox: null,
  tableRef: null,
  evidenceType: 'TABLE',
  unit: '元',
  scope: null,
  docTitle: '东方财富2025年年度报告',
  sectionPath: '第二节 § 五、主要会计数据和财务指标',
}

const ANSWER = '2025年营业总收入为 16,067,741,039.51 元[E1]。'

function mountButton(props: Record<string, unknown> = {}) {
  return mount(CopyAnswerButton, { props: { answer: ANSWER, citations: [CITE], ...props } })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('CopyAnswerButton', () => {
  it('流式生成中禁用', () => {
    const wrapper = mountButton({ streaming: true })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('复制成功：写入剪贴板，按钮变「已复制」，2 秒后复位', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const wrapper = mountButton()
    await wrapper.find('button').trigger('click')
    await Promise.resolve()

    expect(writeText).toHaveBeenCalledTimes(1)
    const text = String(writeText.mock.calls[0]?.[0] ?? '')
    expect(text).toContain('[E1]')
    expect(text).toContain('### 引用')
    expect(wrapper.find('button').text()).toContain('已复制')

    vi.advanceTimersByTime(2000)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('button').text()).toContain('复制')
    expect(wrapper.find('button').text()).not.toContain('已复制')
  })

  it('剪贴板不可用：降级 execCommand，并给出失败提示', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const execCommand = vi.fn<(command: string) => boolean>().mockReturnValue(false)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })

    const wrapper = mountButton()
    await wrapper.find('button').trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(writeText).toHaveBeenCalled()
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(wrapper.find('[role="status"]').text()).toContain('复制失败')
  })
})
