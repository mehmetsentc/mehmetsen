/**
 * Günlük futbol verisi senkronizasyonu
 * Her gün 06:00 UTC'de çalışır, 3 API isteği kullanır (standings + today + upcoming)
 * 100 req/gün limitinde güvenli kalır
 */
import { NextRequest, NextResponse } from 'next/server'
import { getStandings, getTodayFixtures, getUpcomingFixtures } from '@/services/footballService.server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const CRON_SECRET = process.env.CRON_SECRET?.trim()

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  if (auth === `Bearer ${CRON_SECRET}`) return true
  const q = req.nextUrl.searchParams.get('secret') ?? req.nextUrl.searchParams.get('cron_secret')
  return q === CRON_SECRET
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, unknown> = {}

  try {
    // Cache'i sıfırla — taze veri çek
    const db = getAdminFirestore()
    const today = new Date().toISOString().slice(0, 10)
    await db.collection('footballCache').doc(`fixtures-today-${today}`).delete().catch(() => {})
    await db.collection('footballCache').doc('fixtures-upcoming-203').delete().catch(() => {})
    await db.collection('footballCache').doc('standings-203-2025').delete().catch(() => {})

    // 3 ayrı fetch (3 API isteği)
    const [standings, todayFixtures, upcoming] = await Promise.allSettled([
      getStandings(),
      getTodayFixtures(),
      getUpcomingFixtures(5),
    ])

    results.standings = standings.status === 'fulfilled' ? standings.value.length : String((standings as PromiseRejectedResult).reason)
    results.today     = todayFixtures.status === 'fulfilled' ? todayFixtures.value.length : String((todayFixtures as PromiseRejectedResult).reason)
    results.upcoming  = upcoming.status === 'fulfilled' ? upcoming.value.length : String((upcoming as PromiseRejectedResult).reason)

    return NextResponse.json({ ok: true, date: today, results })
  } catch (err) {
    console.error('[cron/football-sync]', err)
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}

export const POST = GET
