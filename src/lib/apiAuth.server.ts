import 'server-only'

/** Verify a Firebase ID token from Authorization: Bearer header. */
export async function verifyFirebaseIdToken(
  request: Request
): Promise<{ uid: string; email: string } | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7).trim()
  if (!token) return null

  try {
    const { getAdminAuth } = await import('@/lib/firebase/admin')
    const decoded = await getAdminAuth().verifyIdToken(token)
    return { uid: decoded.uid, email: decoded.email ?? '' }
  } catch {
    return null
  }
}
