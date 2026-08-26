import 'server-only'

/** Verify Firebase Bearer token for end-user APIs (not CMS). */
export async function verifyUserRequest(
  request: Request
): Promise<{ uid: string; email: string | null } | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7).trim()
  if (!token) return null

  try {
    const { getAdminAuth } = await import('@/lib/firebase/admin')
    const decoded = await getAdminAuth().verifyIdToken(token)
    return { uid: decoded.uid, email: decoded.email ?? null }
  } catch {
    return null
  }
}
