/**
 * GET /api/sports/scoreboard?tab=live|today|results&date=YYYY-MM-DD
 * Maçkolik tarzı ülke/lig gruplu skor tahtası (API-Football).
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  getDayScoreboard,
  getLiveScoreboard,
  type ScoreboardLeagueGroup,
} from '@/services/footballService.server'
import { collectSportMatches } from '@/lib/sports/collectMatches'
import type { MatchResult } from '@/lib/sports/matchTypes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function turkeyYmd(offsetDays = 0): string {
  const ms = Date.now() + 3 * 3600_000 + offsetDays * 86400_000
  return new Date(ms).toISOString().slice(0, 10)
}

function espnFallbackGroups(matches: MatchResult[]): ScoreboardLeagueGroup[] {
  const map = new Map<string, ScoreboardLeagueGroup>()
  let fakeId = 900000
  for (const m of matches) {
    const country =
      m.league.includes('Süper Lig') || m.league.includes('Türkiye')
        ? 'Turkey'
        : m.league.includes('Premier')
          ? 'England'
          : m.league.includes('La Liga')
            ? 'Spain'
            : m.league.includes('Bundesliga')
              ? 'Germany'
              : m.league.includes('Serie A')
                ? 'Italy'
                : m.league.includes('Ligue 1')
                  ? 'France'
                  : m.league.includes('UEFA') || m.league.includes('Şampiyonlar')
                    ? 'World'
                    : 'World'
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
    const statusShort =
      m.status === 'live' ? 'LIVE' : m.status === 'finished' ? 'FT' : 'NS'
    g.matches.push({
      id: Number.parseInt(m.id.replace(/\D/g, '').slice(-8), 10) || fakeId++,
      date: `${m.date}T12:00:00.000Z`,
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

export async function GET(req: NextRequest) {
  const tab = (req.nextUrl.searchParams.get('tab') ?? 'today').toLowerCase()
  const dateParam = req.nextUrl.searchParams.get('date')
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : tab === 'results'
        ? turkeyYmd(-1)
        : turkeyYmd(0)

  try {
    let groups: ScoreboardLeagueGroup[] = []
    if (tab === 'live') {
      groups = await getLiveScoreboard()
    } else {
      groups = await getDayScoreboard(date)
    }

    // API-Football boşsa ESPN/TheSportsDB yedek
    if (groups.length === 0) {
      const fb = await collectSportMatches('futbol')
      groups = espnFallbackGroups(fb.matches)
      if (tab === 'live') {
        groups = groups
          .map((g) => ({
            ...g,
            matches: g.matches.filter((m) => m.statusShort === 'LIVE'),
          }))
          .filter((g) => g.matches.length > 0)
      }
    }

    const liveCount = groups.reduce(
      (n, g) =>
        n +
        g.matches.filter((m) =>
          ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT', 'BREAK'].includes(m.statusShort)
        ).length,
      0
    )

    return NextResponse.json(
      {
        tab,
        date,
        groups,
        liveCount,
        updatedAt: Date.now(),
      },
      {
        headers: {
          'Cache-Control':
            tab === 'live'
              ? 'public, s-maxage=30, stale-while-revalidate=60'
              : 'public, s-maxage=120, stale-while-revalidate=300',
        },
      }
    )
  } catch (err) {
    console.error('[api/sports/scoreboard]', err)
    try {
      const fb = await collectSportMatches('futbol')
      const groups = espnFallbackGroups(fb.matches)
      return NextResponse.json({
        tab,
        date,
        groups,
        liveCount: 0,
        updatedAt: Date.now(),
        fallback: true,
      })
    } catch {
      return NextResponse.json({ tab, date, groups: [], liveCount: 0, updatedAt: Date.now() })
    }
  }
}
