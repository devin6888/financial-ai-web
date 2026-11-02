<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'

import {
  createGrant,
  createRole,
  createUser,
  deleteRole,
  deleteGrant,
  getOverview,
  listGrants,
  listRoleDocuments,
  listRoleMembers,
  listRoles,
  listUserDocuments,
  listUsers,
  renameRole,
  searchDocuments,
  updateUser,
  type AdminDocumentAccess,
  type AdminDocumentOption,
  type AdminGrant,
  type AdminOverview,
  type AdminRole,
  type AdminRoleDoc,
  type AdminUser,
  type Paged,
} from '@/api/admin'
import { ApiError } from '@/api/client'
import PageHeader from '@/components/PageHeader.vue'
import { describe } from '@/stores/session'

/**
 * 用户与权限（阶段 18 ST18 需求 11，2026-10-30 重新设计）。
 *
 * 设计约束来自一次真实的批评：表格铺满整屏、操作列与左侧行线错位、列表没有分页、
 * 账号列表不能搜、建账号的常驻表单占着表格顶部、看不到"某个账号/某个角色到底能读哪些文档"。
 *
 * 这一版的原则：
 * 1) 内容居中限宽（1180px），表格是"卡片里的一张表"，不是浏览器窗口的边框；
 * 2) 一切列表都分页，账号/授权记录支持搜索 —— 面向几千人的系统，没有搜索等于没有列表；
 * 3) 建账号走弹窗，工具栏只放动作，不占内容区；
 * 4) "能读哪些文档"是独立的可视化：账号行点开抽屉看本人视角，角色详情看角色视角。
 *    这两处的数据直接来自后端与 AclScopeAuthorizer 同一套判定，避免"管理页说授权了、
 *    检索时却读不到"这类最难排查的问题。
 */
const tab = ref<'users' | 'roles' | 'grants'>('users')
const forbidden = ref(false)
const overview = ref<AdminOverview | null>(null)
const roles = ref<AdminRole[]>([])

// ---- 账号列表 ----
const userQ = ref('')
const userStatus = ref('')
const userPage = ref(1)
const userSize = ref(20)
const users = ref<Paged<AdminUser> | null>(null)
const usersLoading = ref(false)

// ---- 账号 → 可读文档（抽屉） ----
const drawerOpen = ref(false)
const drawerUser = ref<AdminUser | null>(null)
const userDocs = ref<Paged<AdminDocumentAccess> | null>(null)
const userDocsPage = ref(1)
const userDocsSize = ref(10)
const userDocsLoading = ref(false)

// ---- 角色详情 ----
const roleId = ref<number | null>(null)
const roleTab = ref<'docs' | 'members'>('docs')
const roleDocs = ref<Paged<AdminRoleDoc> | null>(null)
const roleDocsPage = ref(1)
const roleDocsSize = ref(10)
const roleDocsLoading = ref(false)
const roleMembers = ref<Paged<AdminUser> | null>(null)
const roleMembersPage = ref(1)
const roleMembersSize = ref(10)
const roleMembersLoading = ref(false)

// ---- 授权记录（审计） ----
const grantQ = ref('')
const grantPage = ref(1)
const grantSize = ref(20)
const grants = ref<Paged<AdminGrant> | null>(null)
const grantsLoading = ref(false)

// ---- 新建 / 编辑 ----
const createOpen = ref(false)
const createBusy = ref(false)
const createForm = ref({ username: '', displayName: '', password: '', roles: ['VIEWER'] as string[] })
const editOpen = ref(false)
const editBusy = ref(false)
const editForm = ref({
  id: 0,
  username: '',
  displayName: '',
  status: 'ACTIVE' as 'ACTIVE' | 'DISABLED',
  roles: [] as string[],
})

// ---- 新建 / 重命名角色 ----
const roleFormOpen = ref(false)
const roleFormBusy = ref(false)
const roleForm = ref({ id: 0, code: '', name: '' })

// ---- 授权弹窗 ----
const grantOpen = ref(false)
const grantBusy = ref(false)
const grantRole = ref<AdminRole | null>(null)
const grantPick = ref<AdminDocumentOption | null>(null)
const grantScope = ref<'COMPANY' | 'DOCUMENT'>('DOCUMENT')
const pickerQ = ref('')
const pickerPage = ref(1)
const picker = ref<Paged<AdminDocumentOption> | null>(null)
const pickerLoading = ref(false)

const roleSelected = computed(() => roles.value.find((r) => r.id === roleId.value) ?? null)
const drawerTitle = computed(() => (drawerUser.value ? drawerUser.value.username + ' 可读的文档' : '可读文档'))

const REASON_TEXT: Record<string, string> = {
  ADMIN: '管理员全可见',
  OWNER: '本人私有',
  USER: '直接授权',
  ROLE: '角色授权',
}

const scopeText = (type: string): string =>
  type === 'ALL' ? '全租户' : type === 'COMPANY' ? '公司级' : '单份文档'

const statusText = (status: string): string => (status === 'ACTIVE' ? '启用' : '停用')

let userTimer: number | undefined
let grantTimer: number | undefined
let pickerTimer: number | undefined

onMounted(boot)

watch([userQ, userStatus], () => {
  window.clearTimeout(userTimer)
  userTimer = window.setTimeout(() => {
    userPage.value = 1
    void loadUsers()
  }, 300)
})

watch(grantQ, () => {
  window.clearTimeout(grantTimer)
  grantTimer = window.setTimeout(() => {
    grantPage.value = 1
    void loadGrants()
  }, 300)
})

watch(pickerQ, () => {
  window.clearTimeout(pickerTimer)
  pickerTimer = window.setTimeout(() => {
    pickerPage.value = 1
    void loadPicker()
  }, 300)
})

async function boot(): Promise<void> {
  try {
    overview.value = await getOverview()
  } catch (e) {
    handle(e)
    return
  }
  await Promise.all([loadRoles(), loadUsers()])
}

function handle(e: unknown): void {
  if (e instanceof ApiError && e.status === 403) {
    forbidden.value = true
    return
  }
  ElMessage.error(describe(e))
}

// ---------- 账号 ----------

async function loadUsers(): Promise<void> {
  usersLoading.value = true
  try {
    users.value = await listUsers({
      q: userQ.value,
      status: userStatus.value,
      page: userPage.value,
      size: userSize.value,
    })
  } catch (e) {
    handle(e)
  } finally {
    usersLoading.value = false
  }
}

function onUserSizeChange(): void {
  userPage.value = 1
  void loadUsers()
}

async function openUserDocs(row: unknown): Promise<void> {
  const user = row as AdminUser
  drawerUser.value = user
  drawerOpen.value = true
  userDocsPage.value = 1
  await loadUserDocs()
}

async function loadUserDocs(): Promise<void> {
  if (!drawerUser.value) {
    return
  }
  userDocsLoading.value = true
  try {
    userDocs.value = await listUserDocuments(drawerUser.value.id, {
      page: userDocsPage.value,
      size: userDocsSize.value,
    })
  } catch (e) {
    handle(e)
  } finally {
    userDocsLoading.value = false
  }
}

function openCreate(): void {
  createForm.value = { username: '', displayName: '', password: '', roles: ['VIEWER'] }
  createOpen.value = true
}

function generatePassword(): void {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const bytes = new Uint32Array(12)
  crypto.getRandomValues(bytes)
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length]
  }
  createForm.value.password = out
}

async function submitCreate(): Promise<void> {
  const form = createForm.value
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(form.username.trim())) {
    ElMessage.warning('账号只能用字母、数字、下划线、点、短横线，长度 3~32')
    return
  }
  if (form.password.length < 8) {
    ElMessage.warning('初始密码至少 8 位')
    return
  }
  if (form.roles.length === 0) {
    ElMessage.warning('至少选择一个角色')
    return
  }
  createBusy.value = true
  try {
    await createUser({
      username: form.username.trim(),
      displayName: form.displayName.trim() || undefined,
      password: form.password,
      roles: form.roles,
    })
    ElMessage.success('账号已创建：' + form.username.trim())
    createOpen.value = false
    await Promise.all([loadUsers(), refreshOverview()])
  } catch (e) {
    handle(e)
  } finally {
    createBusy.value = false
  }
}

function openEdit(row: unknown): void {
  const user = row as AdminUser
  editForm.value = {
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? '',
    status: user.status,
    roles: [...user.roles],
  }
  editOpen.value = true
}

async function submitEdit(): Promise<void> {
  const form = editForm.value
  if (form.roles.length === 0) {
    ElMessage.warning('至少保留一个角色')
    return
  }
  editBusy.value = true
  try {
    await updateUser(form.id, {
      displayName: form.displayName.trim(),
      status: form.status,
      roles: form.roles,
    })
    ElMessage.success('已保存')
    editOpen.value = false
    await Promise.all([loadUsers(), loadRoles(), refreshOverview()])
    if (roleId.value) {
      await loadRoleDocs()
      await loadRoleMembers()
    }
  } catch (e) {
    handle(e)
  } finally {
    editBusy.value = false
  }
}

// ---------- 角色 ----------

function openCreateRole(): void {
  roleForm.value = { id: 0, code: '', name: '' }
  roleFormOpen.value = true
}

function openRenameRole(role: AdminRole): void {
  roleForm.value = { id: role.id, code: role.code, name: role.name }
  roleFormOpen.value = true
}

async function submitRoleForm(): Promise<void> {
  const form = roleForm.value
  const name = form.name.trim()
  if (form.id === 0 && !/^[A-Z][A-Z0-9_]{1,31}$/.test(form.code.trim())) {
    ElMessage.warning('角色标识只能是大写字母开头的大写字母/数字/下划线，长度 2~32')
    return
  }
  if (!name) {
    ElMessage.warning('角色名称不能为空')
    return
  }
  roleFormBusy.value = true
  try {
    if (form.id === 0) {
      await createRole({ code: form.code.trim(), name })
      ElMessage.success('角色已创建：' + form.code.trim())
    } else {
      await renameRole(form.id, { name })
      ElMessage.success('已重命名')
    }
    roleFormOpen.value = false
    await Promise.all([loadRoles(), refreshOverview()])
  } catch (e) {
    handle(e)
  } finally {
    roleFormBusy.value = false
  }
}

async function removeRole(role: AdminRole): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '删除角色「' + role.name + '」？它的授权记录会一并清掉，账号不受影响。',
      '删除角色',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteRole(role.id)
    ElMessage.success('角色已删除')
    roleId.value = null
    await Promise.all([loadRoles(), refreshOverview()])
  } catch (e) {
    handle(e)
  }
}

async function loadRoles(): Promise<void> {
  try {
    roles.value = await listRoles()
    if (roleId.value === null || !roles.value.some((r) => r.id === roleId.value)) {
      roleId.value = roles.value[0]?.id ?? null
    }
    if (roleId.value !== null) {
      await Promise.all([loadRoleDocs(), loadRoleMembers()])
    }
  } catch (e) {
    handle(e)
  }
}

async function selectRole(role: AdminRole): Promise<void> {
  if (role.id === roleId.value) {
    return
  }
  roleId.value = role.id
  roleDocsPage.value = 1
  roleMembersPage.value = 1
  await Promise.all([loadRoleDocs(), loadRoleMembers()])
}

async function loadRoleDocs(): Promise<void> {
  if (roleId.value === null) {
    return
  }
  roleDocsLoading.value = true
  try {
    roleDocs.value = await listRoleDocuments(roleId.value, { page: roleDocsPage.value, size: roleDocsSize.value })
  } catch (e) {
    handle(e)
  } finally {
    roleDocsLoading.value = false
  }
}

async function loadRoleMembers(): Promise<void> {
  if (roleId.value === null) {
    return
  }
  roleMembersLoading.value = true
  try {
    roleMembers.value = await listRoleMembers(roleId.value, {
      page: roleMembersPage.value,
      size: roleMembersSize.value,
    })
  } catch (e) {
    handle(e)
  } finally {
    roleMembersLoading.value = false
  }
}

// ---------- 授权 ----------

async function loadGrants(): Promise<void> {
  grantsLoading.value = true
  try {
    grants.value = await listGrants({ q: grantQ.value, page: grantPage.value, size: grantSize.value })
  } catch (e) {
    handle(e)
  } finally {
    grantsLoading.value = false
  }
}

const pickerSize = 10

async function loadPicker(): Promise<void> {
  pickerLoading.value = true
  try {
    picker.value = await searchDocuments({ q: pickerQ.value, page: pickerPage.value, size: pickerSize })
  } catch (e) {
    handle(e)
  } finally {
    pickerLoading.value = false
  }
}

function openGrant(role: AdminRole): void {
  grantRole.value = role
  grantPick.value = null
  grantScope.value = 'DOCUMENT'
  pickerQ.value = ''
  pickerPage.value = 1
  grantOpen.value = true
  void loadPicker()
}

function onPick(row: unknown): void {
  if (!row) {
    return
  }
  const picked = row as AdminDocumentOption
  grantPick.value = picked
  // 租户可见的文档按"公司"生效：只授单份不会让它可读，默认帮管理员选对公司级。
  grantScope.value = picked.visibility === 'TENANT' && picked.companyId ? 'COMPANY' : 'DOCUMENT'
}

const pickNeedsCompany = computed(
  () => grantPick.value !== null && grantPick.value.visibility === 'TENANT' && grantPick.value.companyId !== null,
)

async function submitGrant(): Promise<void> {
  if (!grantRole.value || !grantPick.value) {
    ElMessage.warning('先在列表里选中一份文档')
    return
  }
  const document = grantPick.value
  const resourceType = grantScope.value
  const resourceId = resourceType === 'COMPANY' ? document.companyId : document.id
  if (!resourceId) {
    ElMessage.warning('这份文档没有归属公司，只能按单份授权')
    return
  }
  grantBusy.value = true
  try {
    await createGrant({
      subjectType: 'ROLE',
      subjectId: grantRole.value.id,
      resourceType,
      resourceId,
    })
    ElMessage.success('已授权给 ' + grantRole.value.code)
    grantOpen.value = false
    await Promise.all([loadRoles(), refreshOverview(), loadGrants()])
    await loadRoleDocs()
  } catch (e) {
    handle(e)
  } finally {
    grantBusy.value = false
  }
}

async function revokeRoleDoc(value: unknown): Promise<void> {
  const row = value as AdminRoleDoc
  if (row.grantId === null) {
    return
  }
  const question =
    row.resourceType === 'COMPANY'
      ? '撤销「' + (row.title ?? '') + '」所在公司的授权？该公司全部文档都会对该角色不可读。'
      : '撤销「' + (row.title ?? '') + '」对该角色的授权？'
  try {
    await ElMessageBox.confirm(question, '撤销授权', {
      type: 'warning',
      confirmButtonText: '撤销',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteGrant(row.grantId)
    ElMessage.success('已撤销')
    await Promise.all([loadRoles(), refreshOverview(), loadGrants()])
    await loadRoleDocs()
  } catch (e) {
    handle(e)
  }
}

async function revokeGrant(value: unknown): Promise<void> {
  const row = value as AdminGrant
  try {
    await ElMessageBox.confirm(
      '撤销「' + (row.subjectName ?? '') + '」对「' + (row.resourceName ?? '') + '」的授权？',
      '撤销授权',
      { type: 'warning', confirmButtonText: '撤销', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteGrant(row.id)
    ElMessage.success('已撤销')
    await Promise.all([loadGrants(), loadRoles(), refreshOverview()])
    await loadRoleDocs()
  } catch (e) {
    handle(e)
  }
}

function onTabChange(name: string | number): void {
  if (name === 'grants') {
    void loadGrants()
  }
  if (name === 'roles' && roleId.value !== null) {
    void loadRoleDocs()
    void loadRoleMembers()
  }
}

function onRoleDocsSizeChange(): void {
  roleDocsPage.value = 1
  void loadRoleDocs()
}

function onRoleMembersSizeChange(): void {
  roleMembersPage.value = 1
  void loadRoleMembers()
}

function onGrantSizeChange(): void {
  grantPage.value = 1
  void loadGrants()
}

/** 列表里只显示到分钟：秒对审计没有意义，但会把列撑得好宽。 */
function shortDate(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  const pad = (n: number): string => (n < 10 ? '0' + n : String(n))
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    ' ' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes())
  )
}

async function refreshOverview(): Promise<void> {
  try {
    overview.value = await getOverview()
  } catch (e) {
    handle(e)
  }
}
</script>
<template>
  <div class="admin">
    <div v-if="forbidden" class="denied">
      <h1>需要管理员权限</h1>
      <p>当前账号没有进入这个页面的权限。请用管理员账号登录，或联系管理员为你分配角色。</p>
    </div>

    <template v-else>
      <PageHeader
        eyebrow="GOVERNANCE"
        title="用户与权限"
        desc="管理本租户的账号、角色，以及每个角色能读到哪些文档。授权结果与检索时的判定完全一致。"
      >
        <template #actions>
          <div class="stats">
            <span class="stat"><b>{{ overview?.users ?? '—' }}</b>账号</span>
            <span class="stat"><b>{{ overview?.roles ?? '—' }}</b>角色</span>
            <span class="stat"><b>{{ overview?.documents ?? '—' }}</b>文档</span>
            <span class="stat"><b>{{ overview?.grants ?? '—' }}</b>授权</span>
          </div>
        </template>
      </PageHeader>

      <div class="scroll">
        <div class="shell">
          <div class="body">
        <el-tabs v-model="tab" class="tabs" @tab-change="onTabChange">
          <!-- ============ 账号 ============ -->
          <el-tab-pane label="账号" name="users">
            <section class="pane">
              <div class="pane-head">
                <div class="pane-title">
                  账号<span class="count">{{ users?.total ?? 0 }}</span>
                </div>
                <div class="pane-tools">
                  <el-input
                    v-model="userQ"
                    class="search"
                    placeholder="搜索账号或姓名"
                    clearable
                    :prefix-icon="Search"
                  />
                  <el-select v-model="userStatus" class="status-filter" placeholder="全部状态">
                    <el-option label="全部状态" value="" />
                    <el-option label="启用" value="ACTIVE" />
                    <el-option label="停用" value="DISABLED" />
                  </el-select>
                  <el-button type="primary" @click="openCreate">新建账号</el-button>
                </div>
              </div>

              <el-table
                v-loading="usersLoading"
                :data="users?.items ?? []"
                row-key="id"
                class="grid"
                empty-text="没有匹配的账号"
              >
                <el-table-column label="账号" min-width="220">
                  <template #default="{ row }">
                    <div class="who">
                      <span class="login">{{ row.username }}</span>
                      <span class="name">{{ row.displayName || '未填姓名' }}</span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="角色" min-width="200">
                  <template #default="{ row }">
                    <div class="tags">
                      <el-tag v-for="code in row.roles" :key="code" size="small" effect="plain" class="tag">
                        {{ code }}
                      </el-tag>
                      <span v-if="row.roles.length === 0" class="muted">无角色</span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="可读文档" width="120">
                  <template #default="{ row }">
                    <button class="link" type="button" @click="openUserDocs(row)">
                      {{ row.docCount }} 份
                    </button>
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="100">
                  <template #default="{ row }">
                    <span class="state" :class="row.status === 'ACTIVE' ? 'on' : 'off'">
                      <i />{{ statusText(row.status) }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column label="创建时间" width="150">
                  <template #default="{ row }">
                    <span class="muted">{{ shortDate(row.createdAt) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="112" align="right">
                  <template #default="{ row }">
                    <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
                  </template>
                </el-table-column>
              </el-table>

              <div class="pane-foot">
                <el-pagination
                  v-model:current-page="userPage"
                  v-model:page-size="userSize"
                  background
                  layout="total, sizes, prev, pager, next, jumper"
                  :page-sizes="[20, 50, 100]"
                  :total="users?.total ?? 0"
                  @current-change="loadUsers"
                  @size-change="onUserSizeChange"
                />
              </div>
            </section>
          </el-tab-pane>

          <!-- ============ 角色 ============ -->
          <el-tab-pane label="角色" name="roles">
            <div class="roles">
              <aside class="pane role-list">
                <div class="pane-head">
                  <div class="pane-title">角色<span class="count">{{ roles.length }}</span></div>
                  <div class="pane-tools">
                    <el-button size="small" @click="openCreateRole">新建角色</el-button>
                  </div>
                </div>
                <button
                  v-for="role in roles"
                  :key="role.id"
                  type="button"
                  class="role-card"
                  :class="{ on: role.id === roleId }"
                  @click="selectRole(role)"
                >
                  <span class="role-line">
                    <span class="role-code">{{ role.code }}</span>
                    <span v-if="role.system" class="builtin">内置</span>
                  </span>
                  <span class="role-name">{{ role.name }}</span>
                  <span class="role-meta">{{ role.userCount }} 人 · {{ role.docCount }} 份文档</span>
                </button>
              </aside>

              <section v-if="roleSelected" class="pane role-detail">
                <div class="pane-head">
                  <div>
                    <div class="detail-title">
                      {{ roleSelected.name }}
                      <span class="detail-code">{{ roleSelected.code }}</span>
                    </div>
                    <div class="detail-sub">
                      {{ roleSelected.userCount }} 名成员 · 可读 {{ roleSelected.docCount }} 份文档
                      <span v-if="roleSelected.code === 'ADMIN'">（管理员默认全可见，无需逐份授权）</span>
                    </div>
                  </div>
                  <div class="detail-actions">
                    <el-button plain @click="openRenameRole(roleSelected)">重命名</el-button>
                    <el-button
                      v-if="!roleSelected.system"
                      plain
                      type="danger"
                      :disabled="roleSelected.userCount > 0"
                      :title="roleSelected.userCount > 0 ? '还有成员，先把他们换到别的角色' : '删除这个自定义角色'"
                      @click="removeRole(roleSelected)"
                    >
                      删除
                    </el-button>
                    <el-button type="primary" plain @click="openGrant(roleSelected)">授权文档</el-button>
                  </div>
                </div>

                <el-tabs v-model="roleTab" class="sub-tabs">
                  <el-tab-pane label="文档权限" name="docs">
                    <el-table
                      v-loading="roleDocsLoading"
                      :data="roleDocs?.items ?? []"
                      row-key="documentId"
                      class="grid"
                      empty-text="这个角色还读不到任何文档"
                    >
                      <el-table-column label="文档" min-width="240">
                        <template #default="{ row }">
                          <div class="who">
                            <span class="doc-title">{{ row.title || '未命名文档' }}</span>
                            <span class="name">{{ row.docYear ? row.docYear + ' 年' : '—' }}</span>
                          </div>
                        </template>
                      </el-table-column>
                      <el-table-column label="授权范围" width="120">
                        <template #default="{ row }">
                          <el-tag
                            size="small"
                            :type="row.resourceType === 'ALL' ? 'info' : row.resourceType === 'COMPANY' ? 'warning' : 'success'"
                            effect="plain"
                          >
                            {{ scopeText(row.resourceType) }}
                          </el-tag>
                        </template>
                      </el-table-column>
                      <el-table-column label="权限" width="90">
                        <template #default="{ row }">{{ row.permission === 'READ_WRITE' ? '读写' : '只读' }}</template>
                      </el-table-column>
                      <el-table-column label="授权时间" width="150">
                        <template #default="{ row }">
                          <span class="muted">{{ row.createdAt ? shortDate(row.createdAt) : '—' }}</span>
                        </template>
                      </el-table-column>
                      <el-table-column label="操作" width="90" align="right">
                        <template #default="{ row }">
                          <el-button
                            v-if="row.grantId !== null"
                            link
                            type="danger"
                            @click="revokeRoleDoc(row)"
                          >
                            撤销
                          </el-button>
                          <span v-else class="muted">—</span>
                        </template>
                      </el-table-column>
                    </el-table>
                    <div class="pane-foot">
                      <el-pagination
                        v-model:current-page="roleDocsPage"
                        v-model:page-size="roleDocsSize"
                        background
                        layout="total, sizes, prev, pager, next"
                        :page-sizes="[10, 20, 50]"
                        :total="roleDocs?.total ?? 0"
                        @current-change="loadRoleDocs"
                        @size-change="onRoleDocsSizeChange"
                      />
                    </div>
                  </el-tab-pane>

                  <el-tab-pane label="成员" name="members">
                    <el-table
                      v-loading="roleMembersLoading"
                      :data="roleMembers?.items ?? []"
                      row-key="id"
                      class="grid"
                      empty-text="还没有成员"
                    >
                      <el-table-column label="账号" min-width="180">
                        <template #default="{ row }">
                          <span class="login">{{ row.username }}</span>
                        </template>
                      </el-table-column>
                      <el-table-column label="姓名" min-width="140">
                        <template #default="{ row }">{{ row.displayName || '—' }}</template>
                      </el-table-column>
                      <el-table-column label="状态" width="100">
                        <template #default="{ row }">
                          <span class="state" :class="row.status === 'ACTIVE' ? 'on' : 'off'">
                            <i />{{ statusText(row.status) }}
                          </span>
                        </template>
                      </el-table-column>
                      <el-table-column label="角色" min-width="180">
                        <template #default="{ row }">
                          <div class="tags">
                            <el-tag v-for="code in row.roles" :key="code" size="small" effect="plain" class="tag">
                              {{ code }}
                            </el-tag>
                          </div>
                        </template>
                      </el-table-column>
                    </el-table>
                    <div class="pane-foot">
                      <el-pagination
                        v-model:current-page="roleMembersPage"
                        v-model:page-size="roleMembersSize"
                        background
                        layout="total, sizes, prev, pager, next"
                        :page-sizes="[10, 20, 50]"
                        :total="roleMembers?.total ?? 0"
                        @current-change="loadRoleMembers"
                        @size-change="onRoleMembersSizeChange"
                      />
                    </div>
                  </el-tab-pane>
                </el-tabs>
              </section>

              <section v-else class="pane role-detail empty">
                <p>选择一个角色查看它的文档权限与成员。</p>
              </section>
            </div>
          </el-tab-pane>

          <!-- ============ 授权记录 ============ -->
          <el-tab-pane label="授权记录" name="grants">
            <section class="pane">
              <div class="pane-head">
                <div class="pane-title">
                  授权记录<span class="count">{{ grants?.total ?? 0 }}</span>
                </div>
                <div class="pane-tools">
                  <el-input
                    v-model="grantQ"
                    class="search"
                    placeholder="搜索角色、账号或文档"
                    clearable
                    :prefix-icon="Search"
                  />
                </div>
              </div>

              <el-table
                v-loading="grantsLoading"
                :data="grants?.items ?? []"
                row-key="id"
                class="grid"
                empty-text="还没有授权记录"
              >
                <el-table-column label="授权对象" min-width="170">
                  <template #default="{ row }">
                    <div class="who">
                      <span class="login">{{ row.subjectName || row.subjectId }}</span>
                      <span class="name">{{ row.subjectType === 'ROLE' ? '角色' : '账号' }}</span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="资源" min-width="260">
                  <template #default="{ row }">
                    <div class="who">
                      <span class="doc-title">{{ row.resourceName || row.resourceId }}</span>
                      <span class="name">{{ row.resourceType === 'COMPANY' ? '整家公司' : '单份文档' }}</span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="权限" width="90">
                  <template #default="{ row }">{{ row.permission === 'READ_WRITE' ? '读写' : '只读' }}</template>
                </el-table-column>
                <el-table-column label="授权时间" width="150">
                  <template #default="{ row }">
                    <span class="muted">{{ shortDate(row.createdAt) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="90" align="right">
                  <template #default="{ row }">
                    <el-button link type="danger" @click="revokeGrant(row)">撤销</el-button>
                  </template>
                </el-table-column>
              </el-table>

              <div class="pane-foot">
                <el-pagination
                  v-model:current-page="grantPage"
                  v-model:page-size="grantSize"
                  background
                  layout="total, sizes, prev, pager, next, jumper"
                  :page-sizes="[20, 50, 100]"
                  :total="grants?.total ?? 0"
                  @current-change="loadGrants"
                  @size-change="onGrantSizeChange"
                />
              </div>
            </section>
            </el-tab-pane>
          </el-tabs>
          </div>
        </div>
      </div>
    </template>

    <!-- 账号 → 可读文档 -->
    <el-drawer v-model="drawerOpen" :title="drawerTitle" size="540px">
      <p class="note">
        这里列出的就是该账号在检索时真正能读到的文档。来源一栏说明"为什么能读"，与权限判定逐条对应：
        管理员全可见、本人私有、直接授权、角色授权。
      </p>
      <el-table v-loading="userDocsLoading" :data="userDocs?.items ?? []" row-key="documentId" class="grid" empty-text="读不到任何文档">
        <el-table-column label="文档" min-width="220">
          <template #default="{ row }">
            <div class="who">
              <span class="doc-title">{{ row.title || '未命名文档' }}</span>
              <span class="name">{{ row.docYear ? row.docYear + ' 年' : '—' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ REASON_TEXT[row.reason] || row.reason }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <div class="pane-foot">
        <el-pagination
          v-model:current-page="userDocsPage"
          v-model:page-size="userDocsSize"
          background
          layout="total, prev, pager, next"
          :total="userDocs?.total ?? 0"
          @current-change="loadUserDocs"
        />
      </div>
    </el-drawer>

    <!-- 新建账号 -->
    <el-dialog v-model="createOpen" title="新建账号" width="460px" align-center>
      <el-form label-position="top" class="form">
        <el-form-item label="账号">
          <el-input v-model="createForm.username" placeholder="例如 zhangsan" maxlength="32" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="createForm.displayName" placeholder="显示在会话与授权记录里" maxlength="32" />
        </el-form-item>
        <el-form-item label="初始密码">
          <div class="pw-row">
            <el-input v-model="createForm.password" placeholder="至少 8 位" show-password />
            <el-button @click="generatePassword">随机生成</el-button>
          </div>
          <div class="field-hint">创建后请通过安全渠道转交，本系统不提供管理员改密码。</div>
        </el-form-item>
        <el-form-item label="角色">
          <el-checkbox-group v-model="createForm.roles">
            <el-checkbox v-for="role in roles" :key="role.code" :value="role.code">
              {{ role.name }}（{{ role.code }}）
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createOpen = false">取消</el-button>
        <el-button type="primary" :loading="createBusy" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 编辑账号 -->
    <el-dialog v-model="editOpen" title="编辑账号" width="460px" align-center>
      <el-form label-position="top" class="form">
        <el-form-item label="账号">
          <el-input :model-value="editForm.username" disabled />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="editForm.displayName" maxlength="32" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="editForm.status">
            <el-radio value="ACTIVE">启用</el-radio>
            <el-radio value="DISABLED">停用</el-radio>
          </el-radio-group>
          <div class="field-hint">停用后该账号无法登录，历史会话与文档归属保留，可随时恢复。</div>
        </el-form-item>
        <el-form-item label="角色">
          <el-checkbox-group v-model="editForm.roles">
            <el-checkbox v-for="role in roles" :key="role.code" :value="role.code">
              {{ role.name }}（{{ role.code }}）
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editOpen = false">取消</el-button>
        <el-button type="primary" :loading="editBusy" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 授权文档 -->
    <el-dialog v-model="grantOpen" :title="'授权给 ' + (grantRole?.code ?? '')" width="640px" align-center>
      <el-input
        v-model="pickerQ"
        class="picker-search"
        placeholder="搜索文档标题或公司名"
        clearable
        :prefix-icon="Search"
      />
      <el-table
        v-loading="pickerLoading"
        :data="picker?.items ?? []"
        row-key="id"
        class="grid picker"
        highlight-current-row
        empty-text="没有匹配的文档"
        @current-change="onPick"
      >
        <el-table-column label="文档" min-width="300">
          <template #default="{ row }">
            <div class="who">
              <span class="doc-title">{{ row.title || '未命名文档' }}</span>
              <span class="name">{{ row.companyName || '未归属公司' }}{{ row.docYear ? ' · ' + row.docYear + ' 年' : '' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="可见性" width="100">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :type="row.visibility === 'TENANT' ? undefined : 'info'">
              {{ row.visibility === 'TENANT' ? '公司级' : '私有' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <div class="pane-foot">
        <el-pagination
          v-model:current-page="pickerPage"
          background
          layout="total, prev, pager, next"
          :page-size="10"
          :total="picker?.total ?? 0"
          @current-change="loadPicker"
        />
      </div>

      <div v-if="grantPick" class="scope-box">
        <div class="scope-title">授权范围</div>
        <el-radio-group v-model="grantScope">
          <el-radio value="COMPANY" :disabled="!grantPick.companyId">
            整家公司（{{ grantPick.companyName || '未归属' }}）
          </el-radio>
          <el-radio value="DOCUMENT" :disabled="pickNeedsCompany">仅这一份文档</el-radio>
        </el-radio-group>
        <p v-if="pickNeedsCompany" class="field-hint">
          这份文档是「公司级可见」，权限按公司生效：只授单份不会让它对该角色可读，请选整家公司。
        </p>
      </div>
      <template #footer>
        <el-button @click="grantOpen = false">取消</el-button>
        <el-button type="primary" :loading="grantBusy" :disabled="!grantPick" @click="submitGrant">授权</el-button>
      </template>
    </el-dialog>

    <!-- 新建 / 重命名角色 -->
    <el-dialog v-model="roleFormOpen" :title="roleForm.id === 0 ? '新建角色' : '重命名角色'" width="440px" align-center>
      <el-form label-position="top" class="form">
        <el-form-item v-if="roleForm.id === 0" label="角色标识（建好后不可改，仅大写字母/数字/下划线）">
          <el-input v-model="roleForm.code" placeholder="例如 AUDITOR" maxlength="32" />
        </el-form-item>
        <el-form-item v-else label="角色标识">
          <el-input :model-value="roleForm.code" disabled />
        </el-form-item>
        <el-form-item label="显示名称">
          <el-input v-model="roleForm.name" placeholder="例如 内审员" maxlength="64" />
        </el-form-item>
      </el-form>
      <p class="field-hint">
        角色本身不带任何权限；授权是「角色 → 文档」单独完成的。新建后到右侧「授权文档」里给它加文档。
      </p>
      <template #footer>
        <el-button @click="roleFormOpen = false">取消</el-button>
        <el-button type="primary" :loading="roleFormBusy" @click="submitRoleForm">
          {{ roleForm.id === 0 ? '创建' : '保存' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 为什么必须 flex:1：.fa-app 是 display:flex 的横排容器，这里若不给 flex:1，
   本页会按内容宽度收缩（视觉上"全部靠左，右边空一大片"），而且高度不撑满时内容会被裁掉。 */
.admin {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--paper);
}

/* 只有内容区滚动，页头常驻（与「语料」页的 .fa-scroll 同一套） */
.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 内容居中限宽：表格是卡片里的一张表，不是浏览器窗口的边框 */
.shell {
  max-width: 1180px;
  margin: 0 auto;
}

.body {
  padding: 8px 32px 56px;
}

.stats {
  display: flex;
  gap: 20px;
}

.stat {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: 11.5px;
  color: var(--ink-4);
}

.stat b {
  font-size: 17px;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.tabs :deep(.el-tabs__header) {
  margin: 0 0 16px;
}

.pane {
  background: var(--paper-raised);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 18px;
  border-bottom: 1px solid var(--rule);
}

.pane-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.count {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: var(--paper-sink);
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.pane-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search {
  width: 232px;
}

.status-filter {
  width: 118px;
}

.pane-foot {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--rule);
}

/* 表格：表头淡底、行高一致、去掉 el-table 顶部的 1px 假边线 */
.grid {
  width: 100%;
}

.grid :deep(.el-table__inner-wrapper::before) {
  display: none;
}

.grid :deep(th.el-table__cell) {
  background: var(--paper-sink);
  color: var(--ink-4);
  font-size: 11.5px;
  font-weight: 500;
}

.grid :deep(th.el-table__cell),
.grid :deep(td.el-table__cell) {
  padding: 8px 0;
}

.grid :deep(td.el-table__cell) {
  border-bottom: 1px solid var(--rule);
}

.grid :deep(.el-table__row:last-child td.el-table__cell) {
  border-bottom: 0;
}

.who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.login {
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}

.name {
  font-size: 11.5px;
  color: var(--ink-4);
}

.doc-title {
  font-size: 12.5px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  color: var(--ink-4);
  font-size: 12px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.02em;
}

.state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ink-2);
}

.state i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink-4);
}

.state.on i {
  background: var(--teal);
}

.state.off {
  color: var(--ink-4);
}

.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.link:hover {
  text-decoration: underline;
}

/* 角色：左侧列表 + 右侧详情，详情里再分「文档权限 / 成员」 */
.roles {
  display: grid;
  grid-template-columns: 268px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.role-list {
  padding-bottom: 4px;
}

.role-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 11px 16px;
  border: 0;
  border-bottom: 1px solid var(--rule);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s var(--ease);
}

.role-card:hover {
  background: var(--paper-sink);
}

.role-card.on {
  background: var(--accent-soft);
  box-shadow: inset 3px 0 0 var(--accent);
}

.role-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.role-code {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
}

.builtin {
  padding: 0 6px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-pill);
  color: var(--ink-4);
  font-size: 10px;
}

.role-name {
  font-size: 12px;
  color: var(--ink-2);
}

.role-meta {
  font-size: 11px;
  color: var(--ink-4);
  font-variant-numeric: tabular-nums;
}

.role-detail {
  min-height: 430px;
}

.detail-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}

.detail-code {
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  background: var(--paper-sink);
  color: var(--ink-3);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
}

.detail-sub {
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--ink-4);
}

.sub-tabs {
  padding: 4px 18px 0;
}

.sub-tabs :deep(.el-tabs__header) {
  margin: 0 0 4px;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-4);
  font-size: 13px;
}

.form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.form :deep(.el-form-item__label) {
  padding-bottom: 4px;
  font-size: 12px;
  color: var(--ink-3);
}

.pw-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.field-hint {
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--ink-4);
}

.note {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.75;
  color: var(--ink-3);
}

.picker-search {
  margin-bottom: 10px;
}

.scope-box {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--paper-sink);
}

.scope-title {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--ink-3);
}

.denied {
  max-width: 460px;
  margin: 120px auto;
  text-align: center;
  color: var(--ink-2);
}

.denied h1 {
  margin-bottom: 10px;
  font-size: 20px;
}

.denied p {
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-3);
}
</style>
