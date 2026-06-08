import { getBootstrapAdminUids } from '@/lib/eventSyncAuth'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'

export async function verifyAdminRequest(request: Request): Promise<{ uid: string } | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7).trim()
  if (!token) return null

  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    const userDoc = await getAdminFirestore().collection('users').doc(decoded.uid).get()
    const role = userDoc.data()?.role
    if (role === 'admin' || getBootstrapAdminUids().includes(decoded.uid)) {
      return { uid: decoded.uid }
    }
    return null
  } catch {
    return null
  }
}
