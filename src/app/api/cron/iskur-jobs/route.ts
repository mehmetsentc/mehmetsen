import { NextResponse } from 'next/server'
import { isTurkishProvinceSlug } from '@/constants/cities'
import { isSyncSecretAuthorized } from '@/lib/eventSyncAuth'
import { getBootstrapAdminUids } from '@/lib/cmsSecrets.server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { syncAllJobListings } from '@/services/jobListingsOrchestrator'

/**
 * GET|POST /api/cron/iskur-jobs
 * Optional: ?city=canakkale | ?city=antalya — sync one province (İŞKUR + Kariyer).
 *
 * Daily job board sync: Kariyer.net + İŞKUR → Firestore `jobListings`.
 * Path kept for existing Vercel cron; both sources run.
 * Vercel schedules per-city jobs so each stays under the 300s function limit.
 *
 * Auth: Bearer CRON_SECRET / EVENTS_SYNC_SECRET, or CMS cron:trigger / admin.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const syncInFlight = new Map<
  string,
  Promise<Awaited<ReturnType<typeof syncAllJobListings>>>
>()

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

function parseCityFilter(request: Request): string | null | { error: string } {
  const city = new URL(request.url).searchParams.get('city')?.trim().toLowerCase()
  if (!city) return null
  if (!isTurkishProvinceSlug(city)) {
    return { error: `Invalid city slug: ${city}` }
  }
  return city
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

  const cityOrError = parseCityFilter(request)
  if (cityOrError && typeof cityOrError === 'object' && 'error' in cityOrError) {
    return NextResponse.json({ error: cityOrError.error }, { status: 400 })
  }
  const city = cityOrError

  try {
    const key = city ?? 'all'
    let pending = syncInFlight.get(key)
    if (!pending) {
      pending = syncAllJobListings({ city }).finally(() => {
        syncInFlight.delete(key)
      })
      syncInFlight.set(key, pending)
    }
    const result = await pending
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
