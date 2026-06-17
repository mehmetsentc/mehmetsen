/**
 * CMS Role-Based Auth Utilities (client-safe)
 * Super admin is resolved from Firestore role — email check is server-only.
 */
import type { User } from '@/types/user'
import type { CmsRole, CmsPermission } from '@/types/cms'
import { hasPermission, hasAnyPermission, CMS_STAFF_ROLES, ROLE_LEVEL } from '@/types/cms'
import { resolveCmsRoleFromFirestore } from '@/lib/cmsRoleUtils'

export { hasPermission, hasAnyPermission }

/** Client-side: super admin is determined by Firestore role only. */
export function isSuperAdminEmail(_email: string | null | undefined): boolean {
  return false
}

/** Resolve effective CMS role from a User object */
export function getCmsRole(user: User | null | undefined): CmsRole {
  if (!user) return 'user'
  return resolveCmsRoleFromFirestore(user.role)
}

/** True when user has any CMS staff access */
export function isCmsStaff(user: User | null | undefined): boolean {
  return getCmsRole(user) !== 'user'
}

/** True when user can access the CMS at all */
export function canAccessCms(user: User | null | undefined): boolean {
  return isCmsStaff(user)
}

/** Permission check against live user */
export function userCan(user: User | null | undefined, permission: CmsPermission): boolean {
  return hasPermission(getCmsRole(user), permission)
}

export function userCanAny(user: User | null | undefined, permissions: CmsPermission[]): boolean {
  return hasAnyPermission(getCmsRole(user), permissions)
}

/** Role comparison */
export function isAtLeast(user: User | null | undefined, minRole: CmsRole): boolean {
  const userLevel = ROLE_LEVEL[getCmsRole(user)]
  const minLevel = ROLE_LEVEL[minRole]
  return userLevel >= minLevel
}

// verifyCmsToken (server-only) has moved to @/lib/cmsAuthServer
