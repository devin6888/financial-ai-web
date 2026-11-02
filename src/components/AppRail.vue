<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

interface NavItem {
  name: string
  path: string
  label: string
  icon: string
}

const NAV: NavItem[] = [
  { name: 'overview', path: '/overview', label: '概览', icon: 'M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z' },
  { name: 'chat', path: '/chat', label: '问答', icon: 'M4 5h16v11H9l-5 4V5z' },
  { name: 'documents', path: '/documents', label: '文档', icon: 'M6 3h9l4 4v14H6zM15 3v5h5' },
  { name: 'memories', path: '/memories', label: '记忆', icon: 'M6 3h12v18l-6-4-6 4z' },
]

/** 管理页只对 ADMIN 出现；非管理员直接输 URL 时后端回 403，页面里有说明 */
const isAdmin = computed(() => (session.user?.roles ?? []).includes('ADMIN'))

const nav = computed<NavItem[]>(() => (
  isAdmin.value
    ? [...NAV, { name: 'admin', path: '/admin', label: '权限', icon: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z' }]
    : NAV
))

const activeName = computed(() => String(route.name ?? ''))
const initial = computed(() => (session.displayName || '研').slice(0, 1))

async function logout() {
  // 先让后端撤销会话 token，再清本地并回登录页（顺序见 stores/session.ts 的 signOut）
  await session.signOut()
  await router.replace('/login')
}
</script>

<template>
  <nav class="fa-rail" aria-label="主导航">
    <div class="seal" title="金融研报分析">
      <span class="seal-char fa-serif">研</span>
    </div>

    <div class="nav">
      <router-link
        v-for="item in nav"
        :key="item.name"
        :to="item.path"
        class="nav-item"
        :class="{ active: activeName === item.name }"
        :title="item.label"
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
          <path :d="item.icon" />
        </svg>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </div>

    <div class="rail-foot">
      <el-tooltip :content="session.displayName + ' · ' + session.roleText" placement="right" effect="dark">
        <div class="avatar">{{ initial }}</div>
      </el-tooltip>
      <button class="foot-btn" title="退出登录" @click="logout">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
          <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
        </svg>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.fa-rail {
  border-right: 1px solid #26241d;
}

.seal {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: #fff8ee;
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px rgba(255, 248, 238, 0.28);
  margin-bottom: 22px;
  position: relative;
}

.seal::after {
  content: "";
  position: absolute;
  inset: 3px;
  border: 1px solid rgba(255, 248, 238, 0.35);
  border-radius: 10px;
}

.seal-char {
  font-size: 19px;
  line-height: 1;
  font-weight: 600;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  align-items: center;
}

.nav-item {
  position: relative;
  width: 52px;
  padding: 8px 0 7px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--rail-ink-3);
  border-radius: 10px;
  transition: color 160ms var(--ease), background 160ms var(--ease);
}

.nav-item:hover {
  color: var(--rail-ink);
  background: rgba(239, 231, 216, 0.07);
}

.nav-label {
  font-size: 10px;
  letter-spacing: 0.12em;
}

.nav-item.active {
  color: #fff8ee;
  background: rgba(239, 231, 216, 0.1);
}

.nav-item.active::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: var(--accent);
}

.rail-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(239, 231, 216, 0.35);
  color: var(--rail-ink);
  font-family: var(--serif);
  font-size: 13px;
  cursor: default;
}

.foot-btn {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  background: transparent;
  border: 1px solid transparent;
  color: var(--rail-ink-3);
  border-radius: 10px;
  cursor: pointer;
  transition: all 160ms var(--ease);
}

.foot-btn:hover {
  color: var(--rail-ink);
  border-color: rgba(239, 231, 216, 0.2);
}
</style>