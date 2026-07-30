import { NextRequest, NextResponse } from 'next/server'
import {
  getStandings,
  getTodayFixtures,
  getUpcomingFixtures,
  getPastFixtures,
  LEAGUE_IDS,
  CURRENT_SEASON,
} from '@/services/footballService.server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { syncSkorDaily, syncSkorStandings } from '@/lib/skor/sync'

export const runtime    = 'nodejs'
export const dynamic    = 'force-dynamic'
export const maxDuration = 60

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

  const db    = getAdminFirestore()
  const today = new Date().toISOString().slice(0, 10)
  const results: Record<string, unknown> = {}

  for (const leagueId of LEAGUE_IDS) {
    // Firestore cache temizle
    await db.collection('footballCache').doc(`standings-${leagueId}-${CURRENT_SEASON}`).delete().catch(() => {})
    await db.collection('footballCache').doc(`fixtures-today-${leagueId}-${today}`).delete().catch(() => {})
    await db.collection('footballCache').doc(`fixtures-upcoming-${leagueId}`).delete().catch(() => {})
    await db.collection('footballCache').doc(`fixtures-past-${leagueId}-${CURRENT_SEASON}`).delete().catch(() => {})

    // Taze veri çek (4 API isteği per lig = 16 total)
    const [standings, todayFix, upcoming, past] = await Promise.allSettled([
      getStandings(leagueId, CURRENT_SEASON),
      getTodayFixtures(leagueId),
      getUpcomingFixtures(leagueId, 10),
      getPastFixtures(leagueId, CURRENT_SEASON, 20),
    ])

    results[leagueId] = {
      standings: standings.status === 'fulfilled' ? standings.value.length : String((standings as PromiseRejectedResult).reason),
      today:     todayFix.status  === 'fulfilled' ? todayFix.value.length  : String((todayFix  as PromiseRejectedResult).reason),
      upcoming:  upcoming.status  === 'fulfilled' ? upcoming.value.length  : String((upcoming  as PromiseRejectedResult).reason),
      past:      past.status      === 'fulfilled' ? past.value.length      : String((past      as PromiseRejectedResult).reason),
    }
  }

  // NaHaber Skor arşivine yaz
  const [skorDaily, skorStandings] = await Promise.allSettled([
    syncSkorDaily(),
    syncSkorStandings(),
  ])

  return NextResponse.json({
    ok: true,
    date: today,
    results,
    skor: {
      daily: skorDaily.status === 'fulfilled' ? skorDaily.value : String(skorDaily.reason),
      standings:
        skorStandings.status === 'fulfilled'
          ? skorStandings.value
          : String(skorStandings.reason),
    },
  })
}

export const POST = GET
