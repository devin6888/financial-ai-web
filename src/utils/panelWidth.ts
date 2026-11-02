/**
 * 证据侧栏的宽度规则（阶段 12 §11 执行前修订）。
 *
 * 为什么单独抽成纯函数：拖动时 width 每帧都在变，唯一值得单测的是「夹紧」这一步 ——
 * 下限别把财报表格压到看不清，上限别把正文压成一条缝，窗口太窄时还要让位给正文最小宽度。
 */

/** 默认宽度：与 theme.css 的 --evidence-w 一致 */
export const PANEL_DEFAULT = 424
/** 下限：再窄就看不清一张两列的财报表格 */
export const PANEL_MIN = 340
/** 上限：再宽正文就被挤没了 */
export const PANEL_MAX = 760
/** 左侧会话栏宽度（theme.css 的 --side-w） */
export const RAIL_W = 248
/** 正文至少要留这么宽，低于它就宁可把面板盖上去（见 ChatView 的 980px 断点） */
export const THREAD_MIN = 420
/** localStorage 键：刷新后保持用户拖到的位置 */
export const PANEL_STORAGE_KEY = 'finagent.panelWidth'
/** 低于这个视口宽度，面板退回浮层（此时不允许拖动） */
export const DOCK_BREAKPOINT = 980

/**
 * 视口能给出的最大面板宽度：三个上限取最小 —— 硬上限 760、
 * 「视口 − 会话栏 − 正文最小」，且不低于下限（否则夹紧函数会倒挂）。
 */
export function maxPanelWidth(viewport: number, rail: number = RAIL_W): number {
  const room = Math.round(viewport - rail - THREAD_MIN)
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, room))
}

/** 把任意输入夹到 [PANEL_MIN, maxPanelWidth]；非法值（NaN / undefined）回落到默认宽度。 */
export function clampPanelWidth(raw: number, viewport: number, rail: number = RAIL_W): number {
  const upper = maxPanelWidth(viewport, rail)
  const n = Number.isFinite(raw) ? Math.round(raw) : PANEL_DEFAULT
  return Math.min(Math.max(n, PANEL_MIN), upper)
}

/** 从 localStorage 读回上次的宽度；读不到 / 塞了脏数据都回落到默认值。 */
export function readPanelWidth(storage: Storage | undefined, viewport: number, rail: number = RAIL_W): number {
  const raw = storage?.getItem(PANEL_STORAGE_KEY)
  const parsed = raw == null ? Number.NaN : Number(raw)
  return clampPanelWidth(parsed, viewport, rail)
}

/** 落盘。存储不可用（隐私模式）时静默失败 —— 宽度记不住不该影响看证据。 */
export function writePanelWidth(storage: Storage | undefined, width: number): void {
  try {
    storage?.setItem(PANEL_STORAGE_KEY, String(Math.round(width)))
  } catch {
    /* ignore */
  }
}
