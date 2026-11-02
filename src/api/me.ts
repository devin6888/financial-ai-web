import { request } from './client'
import type { Me } from './types'

/** 当前身份。登录 = 这个请求成功（计划 D4），没有账号体系。 */
export const fetchMe = () => request<Me>('/api/me', { timeoutMs: 8_000 })
