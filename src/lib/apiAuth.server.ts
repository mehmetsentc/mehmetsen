import 'server-only'
import { verifyCmsSessionToken } from '@/lib/cmsSession'

/** Verify a Firebase ID token from Authorization: Bearer header OR cms_session cookie. */
export async function verifyFirebaseIdToken(
  request: Request
): Promise<{ uid: string; email: string } | null> {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token && token !== 'undefined' && token !== 'null') {
      try {
        const { getAdminAuth } = await import('@/lib/firebase/admin')
        const decoded = await getAdminAuth().verifyIdToken(token)
        return { uid: decoded.uid, email: decoded.email ?? '' }
      } catch {
        // Fall through to cookie verification
      }
    }
  }

  // Cookie fallback: cms_session
  try {
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)cms_session=([^;]+)/)
      if (match && match[1]) {
        const sessionToken = decodeURIComponent(match[1])
        const session = await verifyCmsSessionToken(sessionToken)
        if (session?.uid) {
          return { uid: session.uid, email: '' }
        }
      }
    }
  } catch {
    // Non-fatal
  }

  return null
}
