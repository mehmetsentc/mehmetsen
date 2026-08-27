import type { PublisherMemberRole } from '@/types/publisher'

export type PublisherPermission =
  | 'studio:access'
  | 'profile:read'
  | 'profile:edit'
  | 'layout:read'
  | 'layout:edit'
  | 'articles:read'
  | 'content:read'
  | 'content:create'
  | 'content:update:own'
  | 'content:update:any'
  /** @deprecated prefer content:create / content:update:* — kept for route gates */
  | 'content:write'
  | 'content:submit'
  | 'content:review'
  | 'content:approve'
  | 'content:publish'
  | 'content:schedule'
  | 'content:archive'
  | 'content:source-import'
  | 'content:breaking'
  | 'team:read'
  | 'team:manage'
  | 'ads:read'
  | 'ads:create'
  | 'ads:update'
  | 'ads:publish'
  | 'ads:archive'

const ADS_ALL: PublisherPermission[] = [
  'ads:read',
  'ads:create',
  'ads:update',
  'ads:publish',
  'ads:archive',
]

const CONTENT_ALL: PublisherPermission[] = [
  'content:read',
  'content:create',
  'content:update:own',
  'content:update:any',
  'content:write',
  'content:submit',
  'content:review',
  'content:approve',
  'content:publish',
  'content:schedule',
  'content:archive',
  'content:source-import',
  'content:breaking',
]

const ROLE_PERMISSIONS: Record<PublisherMemberRole, PublisherPermission[]> = {
  OWNER: [
    'studio:access',
    'profile:read',
    'profile:edit',
    'layout:read',
    'layout:edit',
    'articles:read',
    ...CONTENT_ALL,
    ...ADS_ALL,
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
    ...CONTENT_ALL,
    ...ADS_ALL,
    'team:read',
    'team:manage',
  ],
  EDITOR: [
    'studio:access',
    'profile:read',
    'layout:read',
    'layout:edit',
    'articles:read',
    ...CONTENT_ALL,
    'ads:read',
  ],
  AUTHOR: [
    'studio:access',
    'profile:read',
    'articles:read',
    'content:read',
    'content:create',
    'content:update:own',
    'content:write',
    'content:submit',
    'content:source-import',
  ],
  AD_MANAGER: [
    'studio:access',
    'profile:read',
    'articles:read',
    'content:read',
    ...ADS_ALL,
  ],
  ANALYST: [
    'studio:access',
    'profile:read',
    'layout:read',
    'articles:read',
    'content:read',
    'team:read',
    'ads:read',
  ],
  VIEWER: ['studio:access', 'profile:read', 'layout:read', 'articles:read', 'content:read'],
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
