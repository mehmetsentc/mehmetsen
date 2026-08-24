import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isSyncSecretAuthorized } from '@/lib/eventSyncAuth'
import { DUTY_PHARMACIES_CACHE_TAG } from '@/lib/dutyPharmacies/constants'
import { dutyPharmacySyncService } from '@/services/dutyPharmacySyncService'

/**
 * GET/POST /api/cron/antalya-nobetci-eczane
 *
 * Daily scrape of Antalya Eczacı Odası on-duty pharmacies into Firestore
 * `dutyPharmacies/antalya` for antalya.nahaber.com /nobetci-eczaneler.
 *
 * Auth: CRON_SECRET / EVENTS_SYNC_SECRET via Authorization: Bearer.
 * Vercel cron injects Bearer CRON_SECRET automatically.
 *
 * Schedule (vercel.json): `30 6 * * *` UTC → 09:30 Europe/Istanbul.
 *
 * Manual:
 *   curl -X POST "$APP_URL/api/cron/antalya-nobetci-eczane" -H "Authorization: Bearer $CRON_SECRET"
 *   npm run sync-antalya-nobetci-eczane
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

let syncInFlight: Promise<
  Awaited<ReturnType<typeof dutyPharmacySyncService.syncAntalya>>
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
      syncInFlight = dutyPharmacySyncService.syncAntalya().finally(() => {
        syncInFlight = null
      })
    }
    const result = await syncInFlight
    if (result.ok) {
      revalidateTag(DUTY_PHARMACIES_CACHE_TAG)
    }
    const status = result.ok || result.keptPrevious ? 200 : 502
    return NextResponse.json(result, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[api/cron/antalya-nobetci-eczane] failed:', error)
    const message = error instanceof Error ? error.message : 'Sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
