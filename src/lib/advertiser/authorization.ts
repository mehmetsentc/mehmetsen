import type { AdvertiserMemberRole } from '@/types/advertiserMarketplace'

export type AdvertiserPermission =
  | 'studio:access'
  | 'campaigns:read'
  | 'campaigns:write'
  | 'requests:read'
  | 'requests:write'
  | 'creatives:read'
  | 'creatives:write'
  | 'settings:manage'

const WRITE_ALL: AdvertiserPermission[] = [
  'studio:access',
  'campaigns:read',
  'campaigns:write',
  'requests:read',
  'requests:write',
  'creatives:read',
  'creatives:write',
  'settings:manage',
]

const ROLE_PERMISSIONS: Record<AdvertiserMemberRole, AdvertiserPermission[]> = {
  OWNER: WRITE_ALL,
  ADMIN: [
    'studio:access',
    'campaigns:read',
    'campaigns:write',
    'requests:read',
    'requests:write',
    'creatives:read',
    'creatives:write',
  ],
  CAMPAIGN_MANAGER: [
    'studio:access',
    'campaigns:read',
    'campaigns:write',
    'requests:read',
    'requests:write',
    'creatives:read',
    'creatives:write',
  ],
  ANALYST: ['studio:access', 'campaigns:read', 'requests:read', 'creatives:read'],
}

export function advertiserPermissionsForRole(role: AdvertiserMemberRole): AdvertiserPermission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

export function advertiserRoleHasPermission(
  role: AdvertiserMemberRole,
  permission: AdvertiserPermission
): boolean {
  return advertiserPermissionsForRole(role).includes(permission)
}

export const ADVERTISER_ROLE_LABELS: Record<AdvertiserMemberRole, string> = {
  OWNER: 'Sahip',
  ADMIN: 'Yönetici',
  CAMPAIGN_MANAGER: 'Kampanya Yöneticisi',
  ANALYST: 'Analist',
}
