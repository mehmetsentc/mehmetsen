import { NextResponse } from 'next/server'
import { isSyncSecretAuthorized } from '@/lib/eventSyncAuth'
import { getBootstrapAdminUids } from '@/lib/cmsSecrets.server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { syncIskurJobListings } from '@/services/jobListingSyncService'

/**
 * GET|POST /api/cron/iskur-jobs
 *
 * Daily İŞKUR job sync via Apify actor sevimliai/iskur-ilan-scraper-email.
 * Stores dataset items in Firestore `jobListings` (email is actor-side only).
 *
 * Auth: Bearer CRON_SECRET / EVENTS_SYNC_SECRET, or CMS cron:trigger / admin.
 *
 * Vercel cron: `0 6 * * *` (09:00 Europe/Istanbul).
 *
 * Legal/ops: requires real İŞKUR login; ToS risk on operator. Attribute Kaynak: İŞKUR.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

let syncInFlight: Promise<Awaited<ReturnType<typeof syncIskurJobListings>>> | null = null

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
      syncInFlight = syncIskurJobListings().finally(() => {
        syncInFlight = null
      })
    }
    const result = await syncInFlight
    const status = result.skippedReason ? 200 : result.failedCities.length > 0 ? 207 : 200
    return NextResponse.json(result, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[api/cron/iskur-jobs] failed:', error)
    const message = error instanceof Error ? error.message : 'İŞKUR sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
