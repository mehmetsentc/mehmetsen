import { NextResponse } from 'next/server'
import { isSyncSecretAuthorized } from '@/lib/eventSyncAuth'
import { boxOfficeWeeklySyncService } from '@/services/boxOfficeWeeklySyncService'

/**
 * GET/POST /api/cron/boxoffice-weekly
 *
 * Daily sync: scrapes Box Office Türkiye weekly gişe table and stores in
 * Firestore `meta/boxOfficeWeekly` for the etkinlik/sinema widget.
 *
 * Auth: CRON_SECRET / EVENTS_SYNC_SECRET via Authorization: Bearer.
 * Schedule (vercel.json): `30 6 * * *` UTC → 09:30 Europe/Istanbul.
 *
 * Manual:
 *   curl -X POST "$APP_URL/api/cron/boxoffice-weekly" -H "Authorization: Bearer $CRON_SECRET"
 *   npm run sync-boxoffice-weekly
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

let syncInFlight: Promise<
  Awaited<ReturnType<typeof boxOfficeWeeklySyncService.sync>>
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
      syncInFlight = boxOfficeWeeklySyncService.sync().finally(() => {
        syncInFlight = null
      })
    }
    const result = await syncInFlight
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[api/cron/boxoffice-weekly] failed:', error)
    const message = error instanceof Error ? error.message : 'Sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
