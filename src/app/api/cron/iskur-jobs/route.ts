import { NextResponse } from 'next/server'
import { isSyncSecretAuthorized } from '@/lib/eventSyncAuth'
import { getBootstrapAdminUids } from '@/lib/cmsSecrets.server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { syncAllJobListings } from '@/services/jobListingsOrchestrator'

/**
 * GET|POST /api/cron/iskur-jobs
 *
 * Daily job board sync: Kariyer.net + İŞKUR → Firestore `jobListings`.
 * Path kept for existing Vercel cron; both sources run.
 *
 * Auth: Bearer CRON_SECRET / EVENTS_SYNC_SECRET, or CMS cron:trigger / admin.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

let syncInFlight: Promise<Awaited<ReturnType<typeof syncAllJobListings>>> | null = null

async function isAuthorized(request: Request): Promise<boolean> {
  if (isSyncSecretAuthorized(request)) return true

  const cms = await verifyCmsToken(request, 'cron:trigger')
  if (cms) return true

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (!token) return false
    try {
      const { getAdminAuth, getAdminFirestore } = await import('@/lib/firebase/admin')
      const decoded = await getAdminAuth().verifyIdToken(token)
      const userDoc = await getAdminFirestore().collection('users').doc(decoded.uid).get()
      const role = userDoc.data()?.role
      if (role === 'admin') return true
      return getBootstrapAdminUids().includes(decoded.uid)
    } catch {
      return false
    }
  }

  return false
}

export async function GET(request: Request) {
  return handleSync(request)
}

export async function POST(request: Request) {
  return handleSync(request)
}

async function handleSync(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (!syncInFlight) {
      syncInFlight = syncAllJobListings().finally(() => {
        syncInFlight = null
      })
    }
    const result = await syncInFlight
    const eitherSkipped =
      Boolean(result.kariyer.skippedReason) && Boolean(result.iskur.skippedReason)
    const status = eitherSkipped ? 200 : result.failedCities.length > 0 ? 207 : 200
    return NextResponse.json(result, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[api/cron/iskur-jobs] failed:', error)
    const message = error instanceof Error ? error.message : 'Job listings sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
