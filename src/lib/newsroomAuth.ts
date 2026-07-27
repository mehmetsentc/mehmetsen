/**
 * Auth helpers for newsroom cron API routes.
 */
import { isSyncSecretAuthorized } from '@/lib/eventSyncAuth'
import { getBootstrapAdminUids } from '@/lib/cmsSecrets.server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'

export function getNewsroomSecret(): string | undefined {
  return (
    process.env.NEWSROOM_CRON_SECRET?.trim() ||
    process.env.NEWS_INGEST_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    undefined
  )
}

export async function isNewsroomAuthorized(request: Request): Promise<boolean> {
  if (isSyncSecretAuthorized(request)) return true

  const newsroomSecret = getNewsroomSecret()
  if (newsroomSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader === `Bearer ${newsroomSecret}`) return true

    try {
      const url = new URL(request.url)
      const qSecret = url.searchParams.get('secret') || url.searchParams.get('cron_secret')
      if (qSecret === newsroomSecret) return true
    } catch {
      // invalid URL — ignore
    }
  }

  // Operate (run pipeline): cron:trigger or ai:configure
  const cmsOperate =
    (await verifyCmsToken(request, 'cron:trigger')) ||
    (await verifyCmsToken(request, 'ai:configure'))
  if (cmsOperate) return true

  // View-only CMS staff with ai:use (GET status/queue)
  if (request.method === 'GET' || request.method === 'HEAD') {
    const cmsView = await verifyCmsToken(request, 'ai:use')
    if (cmsView) return true
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token) {
      try {
        const { getAdminAuth, getAdminFirestore } = await import('@/lib/firebase/admin')
        const decoded = await getAdminAuth().verifyIdToken(token)
        const userDoc = await getAdminFirestore().collection('users').doc(decoded.uid).get()
        const role = userDoc.data()?.role
        if (role === 'admin' || getBootstrapAdminUids().includes(decoded.uid)) return true
      } catch {
        // fall through
      }
    }
  }

  return false
}
