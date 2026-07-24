import {
  fallbackBadge,
  parseScore,
  toTurkeyTime,
  toTurkeyYmd,
  type MatchResult,
} from '@/lib/sports/matchTypes'

interface SportsDbEvent {
  idEvent: string
  strEvent?: string
  strHomeTeam?: string
  strAwayTeam?: string
  strTimestamp?: string
  dateEvent?: string
  strTime?: string
  strLeague?: string
  strHomeTeamBadge?: string
  strAwayTeamBadge?: string
  intHomeScore?: string | null
  intAwayScore?: string | null
  strStatus?: string | null
  strProgress?: string | null
}

function mapStatus(raw?: string | null): MatchResult['status'] {
  const s = (raw ?? '').toUpperCase()
  if (!s || s === 'NS' || s === 'NOT STARTED' || s === 'SCHEDULED' || s === 'TBD') {
    return 'upcoming'
  }
  if (s === 'FT' || s === 'AET' || s === 'PEN' || s === 'FINISHED' || s === 'AOT') {
    return 'finished'
  }
  if (s === 'LIVE' || s === 'IN PLAY' || s === 'HT' || /^\d/.test(s)) return 'live'
  return 'upcoming'
}

function mapEvent(ev: SportsDbEvent, sport: MatchResult['sport'], priority: number): MatchResult | null {
  const iso =
    ev.strTimestamp ||
    (ev.dateEvent
      ? `${ev.dateEvent}T${(ev.strTime && ev.strTime !== '00:00:00' ? ev.strTime : '12:00:00')}Z`
      : null)
  if (!iso) return null

  const home = (ev.strHomeTeam ?? '').trim() || 'Ev Sahibi'
  const away = (ev.strAwayTeam ?? '').trim() || 'Deplasman'
  const status = mapStatus(ev.strStatus)
  const homeScore = status === 'upcoming' ? null : parseScore(ev.intHomeScore)
  const awayScore = status === 'upcoming' ? null : parseScore(ev.intAwayScore)

  return {
    id: `${sport}-tsdb-${ev.idEvent}`,
    homeTeam: home,
    awayTeam: away,
    homeScore,
    awayScore,
    homeBadge: ev.strHomeTeamBadge || fallbackBadge(home),
    awayBadge: ev.strAwayTeamBadge || fallbackBadge(away),
    date: toTurkeyYmd(iso),
    time: toTurkeyTime(iso),
    league: ev.strLeague?.trim() || (sport === 'voleybol' ? 'Voleybol' : 'Basketbol'),
    status,
    statusDetail:
      status === 'live'
        ? ev.strProgress || ev.strStatus || 'CANLI'
        : status === 'finished'
          ? 'MS'
          : toTurkeyTime(iso),
    priority,
    sport,
  }
}

async function fetchDay(sportLabel: string, ymd: string): Promise<SportsDbEvent[]> {
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${ymd}&s=${encodeURIComponent(sportLabel)}`
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'NaHaber/1.0' },
      signal: AbortSignal.timeout(7000),
    })
    if (!res.ok) return []
    const data = (await res.json()) as { events?: SportsDbEvent[] | null }
    return Array.isArray(data.events) ? data.events : []
  } catch {
    return []
  }
}

/** TheSportsDB — voleybol (FIVB VNL vb.) ve yedek basketbol günlüğü. */
export async function fetchSportsDbDays(
  sport: 'voleybol' | 'basketbol',
  days: string[]
): Promise<MatchResult[]> {
  const label = sport === 'voleybol' ? 'Volleyball' : 'Basketball'
  const batches = await Promise.all(days.map((d) => fetchDay(label, d)))
  const out: MatchResult[] = []
  const seen = new Set<string>()
  for (const batch of batches) {
    for (const ev of batch) {
      const mapped = mapEvent(ev, sport, sport === 'voleybol' ? 1 : 5)
      if (!mapped || seen.has(mapped.id)) continue
      seen.add(mapped.id)
      out.push(mapped)
    }
  }
  return out
}
