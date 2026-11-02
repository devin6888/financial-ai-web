import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AnswerText from '../AnswerText.vue'

/**
 * AnswerText 的渲染分支（ST16 Task 4）。
 *
 * 为什么只测这三件：渲染细节靠肉眼与快照都会飘，真正会坏的是
 * 「表格没渲染成 table」「表里的 chip 点不动」「小标题层级不对」这三点。
 */
const TABLE = [
  '数据：',
  '| 指标 | 2025年 | 2024年 |',
  '| --- | --- | --- |',
  '| 营业总收入 [E1] | 160.68 亿元 | 116.04 亿元 |',
].join('\n')

describe('AnswerText', () => {
  it('管道表格渲染成真 table（thead + tbody）', () => {
    const wrapper = mount(AnswerText, { props: { text: TABLE, citations: 2 } })
    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.findAll('thead th')).toHaveLength(3)
    expect(wrapper.findAll('tbody td')).toHaveLength(3)
    expect(wrapper.find('tbody').text()).toContain('160.68 亿元')
  })

  it('表格单元格里的引用 chip 可点，并抛出编号', async () => {
    const wrapper = mount(AnswerText, { props: { text: TABLE, citations: 2 } })
    const chip = wrapper.find('tbody .cite')
    expect(chip.exists()).toBe(true)
    await chip.trigger('click')
    expect(wrapper.emitted('cite')?.[0]).toEqual([1])
  })

  it('小标题按层级渲染，越界的编号 chip 不触发点击', async () => {
    const wrapper = mount(AnswerText, { props: { text: '### 分行业\n内容[E9]', citations: 2 } })
    expect(wrapper.find('h3').exists()).toBe(true)
    const dead = wrapper.find('.cite--dead')
    expect(dead.exists()).toBe(true)
    await dead.trigger('click')
    expect(wrapper.emitted('cite')).toBeUndefined()
  })
})

/**
 * 阶段 17（ST17 Task 3）：版式层的三件事 —— 合并的列表、注段、数字右对齐。
 * 这三件都有「看起来对、其实没生效」的失败方式（多个 ol 各从 1 编号、> 原样吐出来、
 * 数字列挤在左边），所以用断言钉住，而不是靠截图。
 */
describe('AnswerText 阶段 17 版式', () => {
  it('相邻列表行合并成一个 ol，li 数量等于列表项数', () => {
    const wrapper = mount(AnswerText, { props: { text: '1. 一是\n1. 二是\n1. 三是', citations: 0 } })
    expect(wrapper.findAll('ol')).toHaveLength(1)
    expect(wrapper.findAll('ol > li')).toHaveLength(3)
    expect(wrapper.findAll('ol > li')[1]?.text()).toBe('二是')
  })

  it('> 行渲染成 blockquote，里面的引用 chip 能点', async () => {
    const wrapper = mount(AnswerText, { props: { text: '> 注：数据见年报 [E2]', citations: 2 } })
    expect(wrapper.find('blockquote').exists()).toBe(true)
    expect(wrapper.find('blockquote').text()).toContain('注：数据见年报')
    await wrapper.find('blockquote .cite').trigger('click')
    expect(wrapper.emitted('cite')?.[0]).toEqual([2])
  })

  it('分隔线渲染成 hr，数值单元格带 num 类（右对齐 + 等宽数字）', () => {
    const table = ['| 指标 | 金额 | 说明 |', '| --- | --- | --- |', '| 营业总收入 | 160.68 亿 | 同比增长 |'].join('\n')
    const wrapper = mount(AnswerText, { props: { text: table + '\n\n---', citations: 0 } })
    expect(wrapper.find('hr.divider').exists()).toBe(true)
    const cells = wrapper.findAll('tbody td')
    expect(cells[1]?.classes()).toContain('num')
    expect(cells[2]?.classes()).not.toContain('num')
  })
})

