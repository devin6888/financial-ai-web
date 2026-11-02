import { createRouter, createWebHashHistory } from 'vue-router'

import { UNAUTHORIZED_EVENT } from '@/api/client'
import { useSessionStore } from '@/stores/session'

/**
 * hash 路由（计划 §8 D3）。
 *
 * 为什么不用 history 模式：产物是塞进 Spring Boot static/ 的纯静态文件，
 * history 需要服务端把所有未知路径回退到 index.html —— 少一处后端配置就少一类「刷新 404」。
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/overview' },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    { path: '/overview', name: 'overview', component: () => import('@/views/OverviewView.vue') },
    { path: '/chat/:id?', name: 'chat', component: () => import('@/views/ChatView.vue') },
    {
      path: '/documents',
      name: 'documents',
      component: () => import('@/views/DocumentView.vue'),
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
    },
    {
      path: '/memories',
      name: 'memories',
      component: () => import('@/views/MemoryView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/overview' },
  ],
})

/**
 * 守卫：非公开页先尝试恢复身份（一次 GET /api/me），失败才跳登录。
 * 这里 await restore() 只会在「有 token 但 user 还没加载」时真正发请求。
 */
router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (to.meta.public) {
    return true
  }
  if (session.isAuthenticated) {
    return true
  }
  const restored = await session.restore()
  if (restored) {
    return true
  }
  return { name: 'login', query: { redirect: to.fullPath } }
})

/**
 * 登录失效（401）→ 直接回登录页（2026-10-30 ST18 需求 12）。
 *
 * 为什么放在路由模块而不是 session store：store 不能 import router（router 已经 import store，
 * 会循环）；而「收到 401 时跳哪个页面」本来就是路由的职责。
 *
 * 两个坑：
 * 1) 已经在登录页时不要再 replace —— 登录接口本身回 401（密码错）也会广播，会把用户正在输入的表单刷掉；
 * 2) 一次失败请求往往连带多个并发请求，必须节流，否则弹 5 次「登录已过期」。
 */
let lastNoticeAt = 0
const NOTICE_INTERVAL_MS = 5000

if (typeof window !== 'undefined') {
  window.addEventListener(UNAUTHORIZED_EVENT, () => {
    const current = router.currentRoute.value
    if (current.name === 'login') return
    const now = Date.now()
    if (now - lastNoticeAt > NOTICE_INTERVAL_MS) {
      lastNoticeAt = now
      ElMessage.warning('登录已过期，请重新登录')
    }
    void router.replace({ name: 'login', query: { redirect: current.fullPath } })
  })
}

export default router
