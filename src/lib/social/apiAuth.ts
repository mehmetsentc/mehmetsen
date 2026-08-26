import 'server-only'

import { verifyUserRequest } from '@/lib/userAuthServer'
import { CMS_STAFF_ROLES, type CmsRole } from '@/types/cms'
import { resolveCmsRoleFromFirestore } from '@/lib/cmsRoleUtils'

/** Resolve end-user from Firebase Bearer token. Rejects CMS-only staff acting on social APIs. */
export async function requireSocialUser(
  request: Request
): Promise<{ uid: string; email: string | null } | null> {
  const auth = await verifyUserRequest(request)
  if (!auth) return null

  try {
    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    const userDoc = await getAdminFirestore().collection('users').doc(auth.uid).get()
    const role = resolveCmsRoleFromFirestore(userDoc.data()?.role as string | undefined) as CmsRole
    if (CMS_STAFF_ROLES.includes(role)) {
      return null
    }
  } catch {
    // If Firestore lookup fails, still allow verified Firebase users.
  }

  return auth
}
