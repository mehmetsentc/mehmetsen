import { NextResponse } from 'next/server'
import { getBootstrapAdminUids, isSyncSecretAuthorized } from '@/lib/eventSyncAuth'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { eventSyncService } from '@/services/eventSyncService'

/**
 * POST/GET /api/events/sync
 *
 * Daily cron entry point for scraping ticket platforms and upserting into
 * Firestore `events`. Protected by:
 *   - `EVENTS_SYNC_SECRET` / `CRON_SECRET` (Bearer, x-cron-secret, or ?secret=)
 *   - Firebase ID token for an admin user (manual refresh from /admin/events)
 *
 * Vercel cron (vercel.json): schedule `0 21 * * *` (00:00 Europe/Istanbul,
 * UTC+3 → 21:00 UTC previous calendar day). Vercel injects
 * `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is set.
 *
 * Manual / crontab:
 *   curl -X POST "$APP_URL/api/events/sync" -H "Authorization: Bearer $EVENTS_SYNC_SECRET"
 *   node scripts/sync-events.mjs
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

let syncInFlight: Promise<Awaited<ReturnType<typeof eventSyncService.syncEvents>>> | null = null

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

async function isAuthorized(request: Request): Promise<boolean> {
  if (isSyncSecretAuthorized(request)) return true

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token && (await isAdminIdToken(token))) return true
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
      syncInFlight = eventSyncService.syncEvents().finally(() => {
        syncInFlight = null
      })
    }
    const result = await syncInFlight
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[api/events/sync] failed:', error)
    const message = error instanceof Error ? error.message : 'Sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
