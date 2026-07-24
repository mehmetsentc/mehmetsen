/**
 * GET /api/sports/scoreboard?tab=live|today|results|program&date=YYYY-MM-DD
 * Maçkolik tarzı ülke/lig gruplu skor tahtası.
 * Bugün = yalnızca o günün maçları (gelecek program karışmaz).
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  getDayScoreboard,
  getLiveScoreboard,
  type ScoreboardLeagueGroup,
} from '@/services/footballService.server'
import { SOCCER_LEAGUES, fetchEspnLeague } from '@/lib/sports/espnScoreboard'
import type { MatchResult } from '@/lib/sports/matchTypes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LIVE_SHORT = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT', 'BREAK'])
const FINISHED_SHORT = new Set(['FT', 'AET', 'PEN', 'AOT', 'WO'])

function turkeyYmd(offsetDays = 0): string {
  const base = new Date(Date.now() + 3 * 3600_000)
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function matchDay(isoOrYmd: string): string {
  // "2026-08-14T18:30:00Z" or "2026-08-14T12:00:00.000Z" or "2026-08-14"
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrYmd)) return isoOrYmd
  // Turkey calendar day
  const tr = new Date(new Date(isoOrYmd).getTime() + 3 * 3600_000)
  return tr.toISOString().slice(0, 10)
}

function countryFromLeague(league: string): string {
  if (league.includes('Süper Lig') || league.includes('Türkiye')) return 'Turkey'
  if (league.includes('Premier')) return 'England'
  if (league.includes('La Liga')) return 'Spain'
  if (league.includes('Bundesliga')) return 'Germany'
  if (league.includes('Serie A')) return 'Italy'
  if (league.includes('Ligue 1')) return 'France'
  if (league.includes('UEFA') || league.includes('Şampiyonlar') || league.includes('Avrupa')) {
    return 'World'
  }
  return 'World'
}

function espnToGroups(matches: MatchResult[]): ScoreboardLeagueGroup[] {
  const map = new Map<string, ScoreboardLeagueGroup>()
  let fakeId = 900000
  for (const m of matches) {
    const country = countryFromLeague(m.league)
    const key = `${country}|${m.league}`
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        leagueId: fakeId++,
        leagueName: m.league,
        country,
        countryFlag: '',
        matches: [],
      }
      map.set(key, g)
    }
    // Preserve kickoff: MatchResult.time = "21:30 TSİ", date = YYYY-MM-DD
    const hm = m.time?.match(/(\d{2}):(\d{2})/)
    const iso = hm
      ? `${m.date}T${hm[1]}:${hm[2]}:00+03:00`
      : `${m.date}T12:00:00+03:00`
    const statusShort =
      m.status === 'live' ? 'LIVE' : m.status === 'finished' ? 'FT' : 'NS'
    g.matches.push({
      id: Number.parseInt(m.id.replace(/\D/g, '').slice(-8), 10) || fakeId++,
      date: iso,
      statusShort,
      elapsed: null,
      homeTeam: m.homeTeam,
      homeLogo: m.homeBadge,
      awayTeam: m.awayTeam,
      awayLogo: m.awayBadge,
      homeGoals: m.homeScore,
      awayGoals: m.awayScore,
      leagueId: g.leagueId,
      leagueName: m.league,
      country,
      countryFlag: '',
      season: 2025,
    })
  }
  return [...map.values()]
}

/** ESPN’den yalnızca verilen gün(ler) — yaklaşan sezon maçlarını Bugün’e basmaz. */
async function fetchEspnForDays(days: string[]): Promise<MatchResult[]> {
  const compactDays = days.map((d) => d.replace(/-/g, ''))
  const batches = await Promise.all(
    SOCCER_LEAGUES.flatMap((league) =>
      compactDays.map((d) => fetchEspnLeague(league, d))
    )
  )
  const all = batches.flat()
  const daySet = new Set(days)
  return all.filter((m) => daySet.has(m.date))
}

function filterGroupsByTab(
  groups: ScoreboardLeagueGroup[],
  tab: string,
  today: string,
  resultsDay: string
): ScoreboardLeagueGroup[] {
  return groups
    .map((g) => ({
      ...g,
      matches: g.matches.filter((m) => {
        const day = matchDay(m.date)
        if (tab === 'live') return LIVE_SHORT.has(m.statusShort)
        if (tab === 'today') return day === today
        if (tab === 'results') {
          return day === resultsDay && FINISHED_SHORT.has(m.statusShort)
        }
        if (tab === 'program') {
          return day >= today && !FINISHED_SHORT.has(m.statusShort) && !LIVE_SHORT.has(m.statusShort)
        }
        return day === today
      }),
    }))
    .filter((g) => g.matches.length > 0)
}

function liveCountOf(groups: ScoreboardLeagueGroup[]) {
  return groups.reduce(
    (n, g) => n + g.matches.filter((m) => LIVE_SHORT.has(m.statusShort)).length,
    0
  )
}

export async function GET(req: NextRequest) {
  const tab = (req.nextUrl.searchParams.get('tab') ?? 'today').toLowerCase()
  const today = turkeyYmd(0)
  const yesterday = turkeyYmd(-1)
  const dateParam = req.nextUrl.searchParams.get('date')
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : tab === 'results'
        ? yesterday
        : today

  try {
    let groups: ScoreboardLeagueGroup[] = []

    if (tab === 'live') {
      groups = await getLiveScoreboard()
      if (groups.length === 0) {
        const espn = await fetchEspnForDays([today, yesterday])
        groups = filterGroupsByTab(espnToGroups(espn), 'live', today, yesterday)
      } else {
        groups = filterGroupsByTab(groups, 'live', today, yesterday)
      }
    } else if (tab === 'program') {
      // Yakın program: bugünden +14 gün (ESPN range) — ayrı sekme
      const to = turkeyYmd(14)
      const ranged = await Promise.all(
        SOCCER_LEAGUES.map((l) =>
          fetchEspnLeague(l, `${today.replace(/-/g, '')}-${to.replace(/-/g, '')}`)
        )
      )
      const upcoming = ranged.flat().filter((m) => m.date >= today && m.status === 'upcoming')
      groups = espnToGroups(upcoming)
    } else if (tab === 'results') {
      groups = await getDayScoreboard(date)
      groups = filterGroupsByTab(groups, 'results', today, date)
      if (groups.length === 0) {
        // Son 3 gün biten maçlar (dün boşsa)
        const days = [date, turkeyYmd(-2), turkeyYmd(-3)]
        const espn = await fetchEspnForDays(days)
        const finished = espn.filter((m) => m.status === 'finished')
        groups = espnToGroups(finished)
      }
    } else {
      // today — SADECE o gün
      groups = await getDayScoreboard(date)
      groups = filterGroupsByTab(groups, 'today', date, yesterday)
      if (groups.length === 0) {
        const espn = await fetchEspnForDays([date])
        groups = espnToGroups(espn)
        groups = filterGroupsByTab(groups, 'today', date, yesterday)
      }
    }

    const liveCount = liveCountOf(groups)

    return NextResponse.json(
      {
        tab,
        date,
        groups,
        liveCount,
        emptyReason:
          groups.length === 0 && tab === 'today'
            ? 'no_matches_today'
            : groups.length === 0 && tab === 'live'
              ? 'no_live'
              : null,
        updatedAt: Date.now(),
      },
      {
        headers: {
          'Cache-Control':
            tab === 'live'
              ? 'public, s-maxage=30, stale-while-revalidate=60'
              : 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    )
  } catch (err) {
    console.error('[api/sports/scoreboard]', err)
    try {
      const espn = await fetchEspnForDays(
        tab === 'results' ? [date, turkeyYmd(-2)] : tab === 'live' ? [today] : [date]
      )
      let groups = espnToGroups(espn)
      groups = filterGroupsByTab(groups, tab === 'program' ? 'today' : tab, today, yesterday)
      return NextResponse.json({
        tab,
        date,
        groups,
        liveCount: liveCountOf(groups),
        fallback: true,
        updatedAt: Date.now(),
      })
    } catch {
      return NextResponse.json({ tab, date, groups: [], liveCount: 0, updatedAt: Date.now() })
    }
  }
}
