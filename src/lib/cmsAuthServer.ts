/**
 * CMS Server-Side Auth — API routes only.
 * This file imports firebase-admin and must NEVER be imported by client components.
 */
import 'server-only'
import type { CmsRole, CmsPermission } from '@/types/cms'
import { hasPermission, CMS_STAFF_ROLES } from '@/types/cms'
import { isSuperAdminEmailServer, getBootstrapAdminUids } from '@/lib/cmsSecrets.server'
import { resolveCmsRoleFromFirestore } from '@/lib/cmsRoleUtils'
import {
  parseStaffScope,
  isScopeRestricted,
  UNSCOPED_STAFF,
  type StaffScopeState,
} from '@/lib/cms/rbacScope'
import { isTurkishProvinceSlug, normalizeCitySlug } from '@/constants/cities'

export interface VerifyCmsTokenOptions {
  /**
   * The route enforces staff content scope itself (rbacScope helpers).
   * Scoped staff (`users/{uid}.cmsScope`) are DENIED on every route that does not
   * opt in — fail-closed, so global admin surfaces never leak to city/category staff.
   */
  scopeAware?: boolean
}

export interface CmsAuthContext {
  uid: string
  role: CmsRole
  email: string
  /** Staff content scope. `unscoped` = legacy global behavior. */
  scope: StaffScopeState
}

/** Only canonical province slugs are accepted in a staff scope. */
function isCanonicalProvinceSlug(slug: string): boolean {
  return isTurkishProvinceSlug(slug) && normalizeCitySlug(slug) === slug
}

/** Resolve `users/{uid}.cmsScope` for a non-super-admin staff identity. */
export function resolveStaffScopeFromUserData(
  role: CmsRole,
  userData: Record<string, unknown> | undefined
): StaffScopeState {
  if (role === 'super_admin') return UNSCOPED_STAFF
  return parseStaffScope(userData?.cmsScope, isCanonicalProvinceSlug)
}

/** Server-side: verify Bearer token + resolve CMS role from Firestore */
export async function verifyCmsToken(
  request: Request,
  requiredPermission?: CmsPermission,
  options?: VerifyCmsTokenOptions
): Promise<CmsAuthContext | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7).trim()
  if (!token) return null

  try {
    const { getAdminAuth, getAdminFirestore } = await import('@/lib/firebase/admin')
    const decoded = await getAdminAuth().verifyIdToken(token)
    const email = decoded.email ?? ''

    if (isSuperAdminEmailServer(email)) {
      if (requiredPermission && !hasPermission('super_admin', requiredPermission)) return null
      return { uid: decoded.uid, role: 'super_admin', email, scope: UNSCOPED_STAFF }
    }

    if (getBootstrapAdminUids().includes(decoded.uid)) {
      const role: CmsRole = 'managing_editor'
      if (requiredPermission && !hasPermission(role, requiredPermission)) return null
      return { uid: decoded.uid, role, email, scope: UNSCOPED_STAFF }
    }

    const userDoc = await getAdminFirestore().collection('users').doc(decoded.uid).get()
    const userData = userDoc.data()
    const role = resolveCmsRoleFromFirestore(userData?.role as string | undefined)

    if (!CMS_STAFF_ROLES.includes(role)) return null
    if (requiredPermission && !hasPermission(role, requiredPermission)) return null

    const scope = resolveStaffScopeFromUserData(role, userData as Record<string, unknown> | undefined)
    if (isScopeRestricted(scope) && !options?.scopeAware) return null

    return { uid: decoded.uid, role, email, scope }
  } catch {
    return null
  }
}
