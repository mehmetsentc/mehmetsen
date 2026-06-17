/**
 * CMS Server-Side Auth — API routes only.
 * This file imports firebase-admin and must NEVER be imported by client components.
 */
import 'server-only'
import type { CmsRole, CmsPermission } from '@/types/cms'
import { hasPermission, CMS_STAFF_ROLES } from '@/types/cms'
import { isSuperAdminEmailServer, getBootstrapAdminUids } from '@/lib/cmsSecrets.server'
import { resolveCmsRoleFromFirestore } from '@/lib/cmsRoleUtils'

/** Server-side: verify Bearer token + resolve CMS role from Firestore */
export async function verifyCmsToken(
  request: Request,
  requiredPermission?: CmsPermission
): Promise<{ uid: string; role: CmsRole; email: string } | null> {
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
      return { uid: decoded.uid, role: 'super_admin', email }
    }

    if (getBootstrapAdminUids().includes(decoded.uid)) {
      const role: CmsRole = 'managing_editor'
      if (requiredPermission && !hasPermission(role, requiredPermission)) return null
      return { uid: decoded.uid, role, email }
    }

    const userDoc = await getAdminFirestore().collection('users').doc(decoded.uid).get()
    const userData = userDoc.data()
    const role = resolveCmsRoleFromFirestore(userData?.role as string | undefined)

    if (!CMS_STAFF_ROLES.includes(role)) return null
    if (requiredPermission && !hasPermission(role, requiredPermission)) return null

    return { uid: decoded.uid, role, email }
  } catch {
    return null
  }
}
