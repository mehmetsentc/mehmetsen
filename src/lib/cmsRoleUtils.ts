import type { CmsRole } from '@/types/cms'
import { CMS_STAFF_ROLES } from '@/types/cms'

/** Map Firestore / legacy role strings to effective CMS role. */
export function resolveCmsRoleFromFirestore(raw: string | undefined | null): CmsRole {
  const role = raw?.trim().toLowerCase()
  if (!role || role === 'user') return 'user'
  if (role === 'admin') return 'managing_editor'
  if (role === 'moderator') return 'editor'
  if (CMS_STAFF_ROLES.includes(role as CmsRole)) return role as CmsRole
  return 'user'
}

export function isCmsStaffRole(role: CmsRole): boolean {
  return role !== 'user'
}
