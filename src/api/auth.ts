import { request } from './client'
import type { Me } from './types'

/**
 * 账号密码登录（后端 AuthController）。
 *
 * 返回的 token 是「会话 token」：32 字节随机串，后端只存 SHA-256，可撤销、7 天过期。
 * 拿到之后和以前的预置 token 用法完全一样 —— 放 localStorage，请求带 Bearer。
 */
export interface LoginResponse {
  token: string
  expiresAt: string
  user: Me
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { username, password },
    timeoutMs: 20_000,
  })
}

/** 登出：撤销当前 token（软删除，后端写 revoked_at）。 */
export function logout(): Promise<void> {
  return request<void>('/api/auth/session', { method: 'DELETE' })
}
