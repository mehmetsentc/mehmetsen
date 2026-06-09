/**
 * CMS Role-Based Auth Utilities
 * Super Admin locked to SUPER_ADMIN_EMAIL env or mehmetsentc@gmail.com
 */
import type { User } from '@/types/user'
import type { CmsRole, CmsPermission } from '@/types/cms'
import { hasPermission, hasAnyPermission, CMS_STAFF_ROLES, ROLE_LEVEL } from '@/types/cms'

export { hasPermission, hasAnyPermission }

/** The one email that always gets super_admin regardless of Firestore */
const SUPER_ADMIN_EMAIL =
  process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim() || 'mehmetsentc@gmail.com'

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()
}

/** Resolve effective CMS role from a User object */
export function getCmsRole(user: User | null | undefined): CmsRole {
  if (!user) return 'user'
  if (isSuperAdminEmail(user.email)) return 'super_admin'
  const role = user.role as CmsRole | 'admin' | 'moderator'
  if (CMS_STAFF_ROLES.includes(role as CmsRole)) return role as CmsRole
  if (role === 'admin') return 'managing_editor'
  return 'user'
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
