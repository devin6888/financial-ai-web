<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

/** 两种进入方式：账号密码（给演示与人用）、API token（给测试与调试用）。 */
const mode = ref<'account' | 'token'>('account')

const username = ref('demo')
const password = ref('demo123456')
const token = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

const DEMO = { username: 'demo', password: 'demo123456' }

const SEEDS = [
  { key: 'analyst', label: '分析师', sub: '只读 · 只有 300059 的授权', token: 'dev-analyst-token' },
  { key: 'admin', label: '管理员', sub: '本租户全部文档', token: 'dev-admin-token' },
  { key: 'outsider', label: '外租户', sub: '用来演示越权被挡住', token: 'dev-outsider-token' },
]

onMounted(() => {
  if (session.isAuthenticated) void router.replace('/overview')
})

const canSubmit = computed(() => {
  if (busy.value) return false
  return mode.value === 'account'
    ? username.value.trim().length > 0 && password.value.length > 0
    : token.value.trim().length > 0
})

function switchMode(next: 'account' | 'token'): void {
  mode.value = next
  error.value = null
}

function fillDemo(): void {
  username.value = DEMO.username
  password.value = DEMO.password
  mode.value = 'account'
  error.value = null
}

function useSeed(value: string): void {
  token.value = value
  mode.value = 'token'
  error.value = null
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  busy.value = true
  error.value = null
  try {
    const ok = mode.value === 'account'
      ? await session.loginWithPassword(username.value, password.value)
      : await session.loginWithToken(token.value.trim())
    if (!ok) {
      error.value = session.error ?? '登录失败'
      return
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/overview'
    await router.replace(redirect)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login">
    <section class="brand-pane">
      <div class="brand-top">
        <div class="seal" aria-hidden="true"><span class="fa-serif">研</span></div>
        <div class="brand-name">金融研报分析</div>
      </div>

      <div class="brand-main">
        <p class="fa-eyebrow brand-eyebrow">ANNUAL REPORT INTELLIGENCE</p>
        <h1 class="brand-title fa-serif">把一份 181 页的年报<br />问成一句有出处的话。</h1>
        <ul class="points">
          <li>
            <span class="pt-no fa-num">01</span>
            <span class="pt-text">每个数字都能点回原文：文档、页码、章节、块 id</span>
          </li>
          <li>
            <span class="pt-no fa-num">02</span>
            <span class="pt-text">向量 + 中文全文双路召回，再用语义精排收敛</span>
          </li>
          <li>
            <span class="pt-no fa-num">03</span>
            <span class="pt-text">多轮追问会记住主语；证据不足时明确说不足</span>
          </li>
        </ul>
      </div>

      <div class="brand-foot">
        <span class="fa-mono">v1.1 · demo build</span>
        <span class="fa-mono">pgvector · zhparser · qwen</span>
      </div>
    </section>

    <section class="form-pane">
      <div class="form-inner">
        <div class="fa-eyebrow">SIGN IN</div>
        <h2 class="form-title">{{ mode === 'account' ? '登录工作台' : '用 API token 进入' }}</h2>
        <p class="form-sub">
          <template v-if="mode === 'account'">
            用户名 + 密码换一个会话 token：7 天有效，登出即撤销。
          </template>
          <template v-else>
            token 由运维或登录接口签发，粘贴即用；token 方式适合脚本与调试。
          </template>
        </p>

        <div class="modes">
          <button type="button" class="mode" :class="{ on: mode === 'account' }" @click="switchMode('account')">
            账号密码
          </button>
          <button type="button" class="mode" :class="{ on: mode === 'token' }" @click="switchMode('token')">
            API token
          </button>
        </div>

        <template v-if="mode === 'account'">
          <label class="field-label" for="username">用户名</label>
          <input
            id="username"
            v-model="username"
            class="fa-field"
            type="text"
            autocomplete="username"
            spellcheck="false"
            @keydown.enter="submit"
          />

          <label class="field-label pw" for="password">密码</label>
          <input
            id="password"
            v-model="password"
            class="fa-field"
            type="password"
            autocomplete="current-password"
            @keydown.enter="submit"
          />
        </template>

        <template v-else>
          <label class="field-label" for="token">API token</label>
          <input
            id="token"
            v-model="token"
            class="fa-field token"
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder="粘贴 token，或点下面的种子 token"
            @keydown.enter="submit"
          />
        </template>

        <p v-if="error" class="form-error">{{ error }}</p>

        <button type="button" class="fa-btn fa-btn--accent submit" :disabled="!canSubmit" @click="submit">
          {{ busy ? '登录中…' : '进入工作台' }}
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M5 12h13M13 6l6 6-6 6" />
          </svg>
        </button>

        <template v-if="mode === 'account'">
          <div class="fa-rule-label seeds-label">演示账号</div>
          <button type="button" class="demo-card" @click="fillDemo">
            <span class="demo-main">
              <span class="demo-title">演示用户 · 管理员</span>
              <span class="demo-sub">能看到本租户全部文档，记忆与文档都挂在这个账号下</span>
            </span>
            <span class="demo-creds fa-mono">{{ DEMO.username }} / {{ DEMO.password }}</span>
          </button>
          <p class="form-note">
            这次演示默认用这个账号（已自动填好）。想对比权限差异，可切到 <b>API token</b> 用种子 token 登录。
          </p>
        </template>

        <template v-else>
          <div class="fa-rule-label seeds-label">种子 token（V8 预置）</div>
          <div class="seeds">
            <button v-for="seed in SEEDS" :key="seed.key" type="button" class="seed" @click="useSeed(seed.token)">
              <span class="seed-label">{{ seed.label }}</span>
              <span class="seed-sub">{{ seed.sub }}</span>
              <span class="seed-token fa-mono">{{ seed.token }}</span>
            </button>
          </div>
          <p class="form-note">登录状态存在本机 localStorage，换浏览器或清缓存后重新登录即可。</p>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login { display: flex; height: 100vh; }

.brand-pane {
  width: 46%;
  flex: 0 0 46%;
  background: var(--rail);
  color: var(--rail-ink);
  display: flex;
  flex-direction: column;
  padding: 34px 44px 26px;
  position: relative;
  overflow: hidden;
}

.brand-pane::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(239, 231, 216, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(239, 231, 216, 0.045) 1px, transparent 1px);
  background-size: 56px 56px;
  pointer-events: none;
}

.brand-top { display: flex; align-items: center; gap: 11px; position: relative; }

.seal {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: #fff8ee;
  border-radius: var(--radius-lg);
  font-size: 17px;
  box-shadow: inset 0 0 0 1px rgba(255, 248, 238, 0.3);
}

.brand-name { font-size: 14px; letter-spacing: 0.06em; }

.brand-main { margin: auto 0; position: relative; }
.brand-eyebrow { color: rgba(239, 231, 216, 0.45); }

.brand-title {
  margin: 18px 0 0;
  font-size: 34px;
  line-height: 1.5;
  font-weight: 600;
  color: #fff8ee;
}

.points { list-style: none; margin: 34px 0 0; padding: 0; display: flex; flex-direction: column; gap: 16px; max-width: 420px; }
.points li { display: flex; gap: 14px; align-items: baseline; }
.pt-no { font-size: 10px; color: var(--accent); letter-spacing: 0.1em; }
.pt-text { font-size: 12.5px; line-height: 1.7; color: rgba(239, 231, 216, 0.78); }

.brand-foot {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: rgba(239, 231, 216, 0.35);
  letter-spacing: 0.08em;
  position: relative;
}

.form-pane { flex: 1; display: grid; place-items: center; background: var(--paper); }
.form-inner { width: 396px; max-width: calc(100% - 48px); }
.form-title { margin: 10px 0 0; font-family: var(--sans); font-size: 26px; font-weight: 600; }
.form-sub { margin: 8px 0 20px; font-size: 12px; color: var(--ink-3); line-height: 1.8; }

.modes { display: flex; gap: 0; margin-bottom: 20px; border-bottom: 1px solid var(--rule); }
.mode {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 8px 14px;
  font-size: 12.5px;
  color: var(--ink-4);
  cursor: pointer;
  position: relative;
  transition: color 160ms var(--ease);
}
.mode:hover { color: var(--ink-2); }
.mode.on { color: var(--ink); }
.mode.on::after {
  content: "";
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: -1px;
  height: 2px;
  background: var(--accent);
}

.field-label { display: block; font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-4); margin-bottom: 6px; }
.field-label.pw { margin-top: 14px; }

.fa-field { height: 38px; }
.token { font-family: var(--mono); font-size: 12.5px; }

.form-error {
  margin: 12px 0 0;
  padding: 8px 10px;
  border-left: 2px solid var(--accent);
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 12px;
}

.submit { width: 100%; height: 38px; margin-top: 16px; font-size: 13px; }

.seeds-label { margin: 26px 0 10px; }

.demo-card {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  text-align: left;
  cursor: pointer;
  transition: all 160ms var(--ease);
}
.demo-card:hover { border-color: var(--accent); background: var(--accent-soft); }
.demo-main { display: flex; flex-direction: column; gap: 3px; }
.demo-title { font-size: 13px; color: var(--ink); }
.demo-sub { font-size: 10.5px; color: var(--ink-4); line-height: 1.5; }
.demo-creds { font-size: 10.5px; color: var(--ink-3); white-space: nowrap; }

.seeds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }

.seed {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 9px 9px;
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  text-align: left;
  cursor: pointer;
  transition: all 160ms var(--ease);
}

.seed:hover { border-color: var(--accent); background: var(--accent-soft); }
.seed-label { font-size: 12.5px; color: var(--ink); }
.seed-sub { font-size: 10px; color: var(--ink-4); line-height: 1.45; min-height: 26px; }
.seed-token { font-size: 9px; color: var(--ink-3); word-break: break-all; }

.form-note { margin: 20px 0 0; font-size: 10.5px; color: var(--ink-4); line-height: 1.7; }
.form-note b { color: var(--ink-3); font-weight: 500; }

@media (max-width: 960px) {
  .brand-pane { display: none; }
}
</style>
