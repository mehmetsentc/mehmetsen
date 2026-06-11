/**
 * GET /api/sports/matches
 * TheSportsDB free API — sadece bugünün futbol maçlarını döner.
 * Bugün maç yoksa dün, o da yoksa boş döner.
 */
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SportsDBEvent {
  idEvent: string
  strHomeTeam: string
  strAwayTeam: string
  strHomeTeamBadge?: string
  strAwayTeamBadge?: string
  intHomeScore: string | null
  intAwayScore: string | null
  dateEvent: string
  strTime: string | null
  strLeague: string
  strSport?: string
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
  status: 'finished' | 'upcoming'
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

function teamBadge(team: string, badge?: string): string {
  if (badge) return `${badge}/preview`
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(team)}&size=40`
}

async function fetchDay(dateStr: string): Promise<MatchResult[]> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateStr}&s=Soccer`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return []
    const data = await res.json() as { events?: SportsDBEvent[] }
    if (!data.events) return []

    return data.events.map((e) => ({
      id: e.idEvent,
      homeTeam: e.strHomeTeam,
      awayTeam: e.strAwayTeam,
      homeScore: e.intHomeScore !== null ? parseInt(e.intHomeScore) : null,
      awayScore: e.intAwayScore !== null ? parseInt(e.intAwayScore) : null,
      homeBadge: teamBadge(e.strHomeTeam, e.strHomeTeamBadge),
      awayBadge: teamBadge(e.strAwayTeam, e.strAwayTeamBadge),
      date: e.dateEvent,
      time: e.strTime?.slice(0, 5) ?? '',   // "16:00" formatı
      league: e.strLeague,
      status: e.intHomeScore !== null ? 'finished' : 'upcoming',
    }))
  } catch {
    return []
  }
}

export async function GET() {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  // Önce bugün, yoksa dün
  let matches = await fetchDay(toDateStr(today))
  let dateLabel = 'Bugün'

  if (matches.length === 0) {
    matches = await fetchDay(toDateStr(yesterday))
    dateLabel = 'Dün'
  }

  return NextResponse.json(
    { matches: matches.slice(0, 30), dateLabel, updatedAt: Date.now() },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } }
  )
}
