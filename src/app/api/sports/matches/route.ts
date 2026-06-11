/**
 * GET /api/sports/matches
 * TheSportsDB free API üzerinden son maç sonuçlarını çeker.
 * Konu: Süper Lig + Şampiyonlar Ligi + Dünya Kupası
 */
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// TheSportsDB league IDs
const LEAGUES = [
  { id: '4197', name: 'Süper Lig',          flag: '🇹🇷' },
  { id: '4480', name: 'Şampiyonlar Ligi',    flag: '⭐' },
  { id: '4429', name: 'Dünya Kupası',        flag: '🌍' },
]

interface SportsDBEvent {
  idEvent: string
  strEvent: string
  strHomeTeam: string
  strAwayTeam: string
  strHomeTeamBadge?: string
  strAwayTeamBadge?: string
  intHomeScore: string | null
  intAwayScore: string | null
  dateEvent: string
  strTime: string | null
  strLeague: string
  strStatus?: string
  strPostponed?: string
}

export interface MatchResult {
  id: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  homeBadge: string
  awayBadge: string
  date: string
  time: string
  league: string
  leagueFlag: string
  status: 'finished' | 'live' | 'upcoming'
}

async function fetchLeagueMatches(leagueId: string, leagueFlag: string): Promise<MatchResult[]> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=${leagueId}`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return []
    const data = await res.json() as { events?: SportsDBEvent[] }
    if (!data.events) return []

    return data.events.slice(-8).reverse().map((e) => ({
      id: e.idEvent,
      homeTeam: e.strHomeTeam,
      awayTeam: e.strAwayTeam,
      homeScore: e.intHomeScore !== null ? parseInt(e.intHomeScore) : null,
      awayScore: e.intAwayScore !== null ? parseInt(e.intAwayScore) : null,
      homeBadge: e.strHomeTeamBadge
        ? `${e.strHomeTeamBadge}/preview`
        : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(e.strHomeTeam)}&size=40`,
      awayBadge: e.strAwayTeamBadge
        ? `${e.strAwayTeamBadge}/preview`
        : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(e.strAwayTeam)}&size=40`,
      date: e.dateEvent,
      time: e.strTime ?? '',
      league: e.strLeague,
      leagueFlag,
      status: 'finished',
    }))
  } catch {
    return []
  }
}

export async function GET() {
  const results = await Promise.all(
    LEAGUES.map((l) => fetchLeagueMatches(l.id, l.flag))
  )

  const matches = results.flat().slice(0, 20)

  return NextResponse.json(
    { matches, updatedAt: Date.now() },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
  )
}
