import type { PublisherMemberRole } from '@/types/publisher'

export type PublisherPermission =
  | 'studio:access'
  | 'profile:read'
  | 'profile:edit'
  | 'layout:read'
  | 'layout:edit'
  | 'articles:read'
  | 'team:read'
  | 'team:manage'

const ROLE_PERMISSIONS: Record<PublisherMemberRole, PublisherPermission[]> = {
  OWNER: [
    'studio:access',
    'profile:read',
    'profile:edit',
    'layout:read',
    'layout:edit',
    'articles:read',
    'team:read',
    'team:manage',
  ],
  ADMIN: [
    'studio:access',
    'profile:read',
    'profile:edit',
    'layout:read',
    'layout:edit',
    'articles:read',
    'team:read',
    'team:manage',
  ],
  EDITOR: ['studio:access', 'profile:read', 'layout:read', 'layout:edit', 'articles:read'],
  AUTHOR: ['studio:access', 'profile:read', 'articles:read'],
  AD_MANAGER: ['studio:access', 'profile:read', 'articles:read'],
  ANALYST: ['studio:access', 'profile:read', 'layout:read', 'articles:read', 'team:read'],
  VIEWER: ['studio:access', 'profile:read', 'layout:read', 'articles:read'],
}

export function permissionsForRole(role: PublisherMemberRole): PublisherPermission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

export function roleHasPermission(role: PublisherMemberRole, permission: PublisherPermission): boolean {
  return permissionsForRole(role).includes(permission)
}

export const ASSIGNABLE_MEMBER_ROLES: PublisherMemberRole[] = [
  'ADMIN',
  'EDITOR',
  'AUTHOR',
  'AD_MANAGER',
  'ANALYST',
  'VIEWER',
]

export const MEMBER_ROLE_LABELS: Record<PublisherMemberRole, string> = {
  OWNER: 'Sahip',
  ADMIN: 'Yönetici',
  EDITOR: 'Editör',
  AUTHOR: 'Yazar',
  AD_MANAGER: 'Reklam Yöneticisi',
  ANALYST: 'Analist',
  VIEWER: 'İzleyici',
}
