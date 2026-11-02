import { describe, expect, it } from 'vitest'

import {
  PANEL_DEFAULT,
  PANEL_MAX,
  PANEL_MIN,
  clampPanelWidth,
  maxPanelWidth,
  readPanelWidth,
  writePanelWidth,
} from '../panelWidth'

describe('clampPanelWidth', () => {
  it('窗口够宽时按硬上限夹紧（1440px 视口 → 760）', () => {
    expect(clampPanelWidth(1200, 1440)).toBe(PANEL_MAX)
    expect(maxPanelWidth(1440)).toBe(PANEL_MAX)
  })

  it('低于下限就抬到 340（拖到 200 也只是 340）', () => {
    expect(clampPanelWidth(200, 1440)).toBe(PANEL_MIN)
  })

  it('窗口偏窄时上限被「视口 − 会话栏 − 正文最小」压下来（1280 → 612）', () => {
    expect(maxPanelWidth(1280)).toBe(612)
    expect(clampPanelWidth(760, 1280)).toBe(612)
  })

  it('窗口窄到放不下时不会倒挂，仍等于下限', () => {
    expect(maxPanelWidth(800)).toBe(PANEL_MIN)
    expect(clampPanelWidth(424, 800)).toBe(PANEL_MIN)
  })

  it('非法输入回落到默认值（再夹一次）', () => {
    expect(clampPanelWidth(Number.NaN, 1440)).toBe(PANEL_DEFAULT)
    expect(clampPanelWidth(undefined as unknown as number, 1440)).toBe(PANEL_DEFAULT)
  })
})

describe('readPanelWidth / writePanelWidth', () => {
  const makeStorage = (): Storage => {
    const map = new Map<string, string>()
    return {
      get length() { return map.size },
      clear: () => map.clear(),
      getItem: (k: string) => map.get(k) ?? null,
      key: (i: number) => Array.from(map.keys())[i] ?? null,
      removeItem: (k: string) => { map.delete(k) },
      setItem: (k: string, v: string) => { map.set(k, v) },
    } as Storage
  }

  it('写得进去也读得回来，并按当前视口夹紧', () => {
    const storage = makeStorage()
    writePanelWidth(storage, 600)
    expect(readPanelWidth(storage, 1440)).toBe(600)
    expect(readPanelWidth(storage, 1280)).toBe(600)
    // 1000 视口只允许 1000-248-420 = 332px，低于下限 340 → 抬回 340
    expect(readPanelWidth(storage, 1000)).toBe(PANEL_MIN)
  })

  it('没有值 / 脏数据 / 存储不可用都回落到默认宽度', () => {
    const storage = makeStorage()
    expect(readPanelWidth(storage, 1440)).toBe(PANEL_DEFAULT)
    storage.setItem('finagent.panelWidth', 'oops')
    expect(readPanelWidth(storage, 1440)).toBe(PANEL_DEFAULT)
    expect(readPanelWidth(undefined, 1440)).toBe(PANEL_DEFAULT)
  })
})
