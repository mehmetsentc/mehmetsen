import { NextResponse } from 'next/server'
import { isSyncSecretAuthorized } from '@/lib/eventSyncAuth'
import { paribuCineverseSyncService } from '@/services/paribuCineverseSyncService'

/**
 * GET/POST /api/cron/paribu-canakkale
 *
 * Daily "editör" cron: scrapes Paribu Cineverse 17 Çanakkale Burda showtimes
 * (today + near-future days) and upserts them into Firestore `events` for
 * canakkale.nahaber.com /etkinlik.
 *
 * Auth: CRON_SECRET / EVENTS_SYNC_SECRET via Authorization: Bearer (same as
 * /api/events/sync). Vercel cron injects Bearer CRON_SECRET automatically.
 *
 * Schedule (vercel.json): `0 5 * * *` UTC → 08:00 Europe/Istanbul.
 *
 * Manual:
 *   curl -X POST "$APP_URL/api/cron/paribu-canakkale" -H "Authorization: Bearer $CRON_SECRET"
 *   npm run sync-paribu-canakkale
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

let syncInFlight: Promise<
  Awaited<ReturnType<typeof paribuCineverseSyncService.syncCanakkale>>
> | null = null

export async function GET(request: Request) {
  return handleSync(request)
}

export async function POST(request: Request) {
  return handleSync(request)
}

async function handleSync(request: Request) {
  if (!isSyncSecretAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (!syncInFlight) {
      syncInFlight = paribuCineverseSyncService.syncCanakkale().finally(() => {
        syncInFlight = null
      })
    }
    const result = await syncInFlight
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[api/cron/paribu-canakkale] failed:', error)
    const message = error instanceof Error ? error.message : 'Sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
