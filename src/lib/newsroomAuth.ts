/**
 * Auth helpers for newsroom cron API routes.
 */
import { getBootstrapAdminUids, isSyncSecretAuthorized } from '@/lib/eventSyncAuth'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'

export function getNewsroomSecret(): string | undefined {
  return (
    process.env.NEWSROOM_CRON_SECRET?.trim() ||
    process.env.NEWS_INGEST_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    undefined
  )
}

async function isAdminIdToken(token: string): Promise<boolean> {
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    const userDoc = await getAdminFirestore().collection('users').doc(decoded.uid).get()
    const role = userDoc.data()?.role
    if (role === 'admin') return true
    return getBootstrapAdminUids().includes(decoded.uid)
  } catch {
    return false
  }
}

export async function isNewsroomAuthorized(request: Request): Promise<boolean> {
  if (isSyncSecretAuthorized(request)) return true

  const newsroomSecret = getNewsroomSecret()
  if (newsroomSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader === `Bearer ${newsroomSecret}`) return true
    if (request.headers.get('x-cron-secret') === newsroomSecret) return true
    const url = new URL(request.url)
    if (url.searchParams.get('secret') === newsroomSecret) return true
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token && (await isAdminIdToken(token))) return true
  }

  return false
}
