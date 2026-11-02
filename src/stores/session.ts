import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, getToken, setToken, UNAUTHORIZED_EVENT } from '@/api/client'
import { fetchMe } from '@/api/me'
import { login as apiLogin, logout as apiLogout } from '@/api/auth'
import type { Me } from '@/api/types'

/**
 * 当前会话的身份状态。
 *
 * 两条登录路径，产物都是同一个 Bearer token：
 *   1) 账号密码 → POST /api/auth/login → 后端签发会话 token（默认路径，见计划 §11）；
 *   2) 直接粘贴 token（预置的 dev-* 种子 token 或别人给的 token，用于调试与测试）。
 *
 * token 存 localStorage：刷新页面不该丢掉登录态。真正的失效由后端决定
 * （登出撤销 / 7 天过期），前端只负责在收到 401 时清状态跳登录页。
 */
export const useSessionStore = defineStore('session', () => {
  const user = ref<Me | null>(null)
  const checking = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => user.value !== null)
  const displayName = computed(() => user.value?.displayName || user.value?.username || '')
  const roleText = computed(() => (user.value?.roles?.length ? user.value.roles.join(' / ') : '无角色'))

  /** 账号密码登录：成功后 token 已经落盘，user 直接来自响应，不必再调一次 /api/me。 */
  async function loginWithPassword(username: string, password: string): Promise<boolean> {
    error.value = null
    checking.value = true
    try {
      const result = await apiLogin(username.trim(), password)
      setToken(result.token)
      user.value = result.user
      return true
    } catch (e) {
      setToken(null)
      user.value = null
      error.value = describe(e)
      return false
    } finally {
      checking.value = false
    }
  }

  /** 用现成 token 换身份；失败时清掉 token，避免「带坏 token 一直 401」。 */
  async function loginWithToken(token: string): Promise<boolean> {
    error.value = null
    checking.value = true
    setToken(token)
    try {
      user.value = await fetchMe()
      return true
    } catch (e) {
      setToken(null)
      user.value = null
      error.value = describe(e)
      return false
    } finally {
      checking.value = false
    }
  }

  /** 刷新页面后恢复：localStorage 里有 token 才试。 */
  async function restore(): Promise<boolean> {
    const token = getToken()
    if (!token) {
      user.value = null
      return false
    }
    return loginWithToken(token)
  }

  /**
   * 主动退出：先调后端撤销 token，再清本地。
   *
   * 顺序不能反 —— 先清本地就拿不到 token 去撤销了，那个 token 会一直有效到过期。
   * 撤销失败（比如 token 早就过期）不影响本地退出。
   */
  async function signOut(): Promise<void> {
    try {
      if (getToken()) {
        await apiLogout()
      }
    } catch {
      // 忽略：本地退出是用户的意图，不能因为网络问题把人卡在已登录状态
    }
    clear('已退出登录')
  }

  function clear(message: string | null = null): void {
    setToken(null)
    user.value = null
    error.value = message
  }

  // 401 由 api/client 统一广播：这里只负责清状态，跳转交给路由守卫
  if (typeof window !== 'undefined') {
    window.addEventListener(UNAUTHORIZED_EVENT, () => {
      if (user.value) {
        clear('登录已失效（token 过期或已被撤销），请重新登录')
      }
    })
  }

  return {
    user,
    checking,
    error,
    isAuthenticated,
    displayName,
    roleText,
    loginWithPassword,
    loginWithToken,
    restore,
    signOut,
    clear,
  }
})

export function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'AUTH_TOO_MANY') {
      return '失败次数过多，请 15 分钟后再试'
    }
    if (error.isUnauthorized) {
      return error.code === 'AUTH_INVALID'
        ? '用户名或密码错误（也可能是 token 已失效）'
        : '缺少登录凭证'
    }
    if (error.isTransport) {
      return error.message
    }
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}
