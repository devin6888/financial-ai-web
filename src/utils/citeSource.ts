import type { ComputedRef, InjectionKey } from 'vue'

/**
 * 「第 N 条引用对应哪个 chunk」的注入键（2026-10-30 ST18 需求 5）。
 *
 * 为什么不逐层传 props：AnswerText → 段落 / 列表 / 表格单元格 → AnswerSegments → CiteChip，
 * 表格那条链路有 4 层，每层加一个 citationIds 参数只是为了在最深处用一次 ——
 * 而 inject 让任何深度的角标都能拿到同一份映射，层级变了也不用改签名。
 */
export type CiteSource = ComputedRef<(number | null)[]>

export const CITE_SOURCE: InjectionKey<CiteSource> = Symbol('cite-source')
