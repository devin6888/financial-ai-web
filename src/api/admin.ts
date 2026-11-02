import { request } from '@/api/client'

/**
 * 管理端（阶段 18 ST18 需求 11）。
 *
 * 只有 ADMIN 能调；非管理员会拿到 403 ADMIN_REQUIRED，前端据此显示「需要管理员」，
 * 不把人踢回登录页（那不是身份问题，是权限问题）。
 *
 * 所有列表都是服务端分页：page 从 1 开始，size 上限 100。
 * 上市公司内部几千人，一次拉全量既慢又容易把表格拖死。
 */
export interface Paged<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export interface AdminOverview {
  users: number
  roles: number
  documents: number
  grants: number
}

export interface AdminUser {
  id: number
  username: string
  displayName: string | null
  status: 'ACTIVE' | 'DISABLED'
  roles: string[]
  createdAt: string
  /** 这个人能读到的文档数（管理员 = 本租户全部） */
  docCount: number
}

export interface AdminRole {
  id: number
  code: string
  name: string
  system: boolean
  userCount: number
  docCount: number
}

/** 用户可读文档的「为什么能读」：管理员全可见 / 本人私有 / 直接授权 / 角色授权。 */
export type AccessReason = 'ADMIN' | 'OWNER' | 'USER' | 'ROLE'

export interface AdminDocumentAccess {
  documentId: number
  title: string | null
  docYear: number | null
  visibility: string
  reason: AccessReason
}

/** 角色可读文档；resourceType=ALL 表示管理员角色天生全可见，此时 grantId 为 null。 */
export interface AdminRoleDoc {
  grantId: number | null
  documentId: number
  title: string | null
  docYear: number | null
  resourceType: 'ALL' | 'COMPANY' | 'DOCUMENT'
  permission: string
  createdAt: string | null
}

export interface AdminGrant {
  id: number
  subjectType: 'ROLE' | 'USER'
  subjectId: number
  subjectName: string | null
  resourceType: 'COMPANY' | 'DOCUMENT'
  resourceId: number
  resourceName: string | null
  permission: string
  createdAt: string
}

export interface AdminDocumentOption {
  id: number
  title: string | null
  docYear: number | null
  visibility: string
  companyId: number | null
  companyName: string | null
}

export type PageQuery = { page?: number; size?: number }

function query(params: Record<string, string | number | undefined | null>): string {
  const pairs: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)))
  }
  return pairs.length ? '?' + pairs.join('&') : ''
}

export const getOverview = () => request<AdminOverview>('/api/admin/overview')

export const listUsers = (params: PageQuery & { q?: string; status?: string }) =>
  request<Paged<AdminUser>>('/api/admin/users' + query(params))

export const listUserDocuments = (userId: number, params: PageQuery) =>
  request<Paged<AdminDocumentAccess>>('/api/admin/users/' + userId + '/documents' + query(params))

export const createUser = (body: {
  username: string
  displayName?: string
  password: string
  roles: string[]
}) => request<{ id: number }>('/api/admin/users', { method: 'POST', body })

export const updateUser = (id: number, body: { displayName?: string; status?: string; roles?: string[] }) =>
  request<{ id: number }>('/api/admin/users/' + id, { method: 'PUT', body })

export const listRoles = () => request<AdminRole[]>('/api/admin/roles')

export const createRole = (body: { code: string; name: string }) =>
  request<{ id: number; code: string }>('/api/admin/roles', { method: 'POST', body })

export const renameRole = (id: number, body: { name: string }) =>
  request<{ id: number; name: string }>('/api/admin/roles/' + id, { method: 'PUT', body })

export const deleteRole = (id: number) => request<{ id: number }>('/api/admin/roles/' + id, { method: 'DELETE' })

export const listRoleMembers = (roleId: number, params: PageQuery) =>
  request<Paged<AdminUser>>('/api/admin/roles/' + roleId + '/members' + query(params))

export const listRoleDocuments = (roleId: number, params: PageQuery) =>
  request<Paged<AdminRoleDoc>>('/api/admin/roles/' + roleId + '/documents' + query(params))

export const listGrants = (params: PageQuery & { q?: string }) =>
  request<Paged<AdminGrant>>('/api/admin/grants' + query(params))

export const searchDocuments = (params: PageQuery & { q?: string }) =>
  request<Paged<AdminDocumentOption>>('/api/admin/documents' + query(params))

export const createGrant = (body: {
  subjectType: 'ROLE' | 'USER'
  subjectId: number
  resourceType: 'COMPANY' | 'DOCUMENT'
  resourceId: number
}) => request<{ id: number }>('/api/admin/grants', { method: 'POST', body })

export const deleteGrant = (id: number) =>
  request<{ id: number }>('/api/admin/grants/' + id, { method: 'DELETE' })
