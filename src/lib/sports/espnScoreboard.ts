import {
  fallbackBadge,
  parseScore,
  toTurkeyTime,
  toTurkeyYmd,
  type MatchResult,
} from '@/lib/sports/matchTypes'

const LIVE_STATES = new Set([
  'STATUS_IN_PROGRESS',
  'STATUS_HALFTIME',
  'STATUS_END_PERIOD',
  'STATUS_OVERTIME',
  'STATUS_SHOOTOUT',
  'STATUS_EXTRA_TIME',
])

const FINISHED_STATES = new Set([
  'STATUS_FINAL',
  'STATUS_FULL_TIME',
  'STATUS_ABANDONED',
  'STATUS_POSTPONED',
  'STATUS_SUSPENDED',
])

interface EspnCompetitor {
  team: { displayName: string; logo?: string }
  score?: string
  homeAway: 'home' | 'away'
}

interface EspnEvent {
  id: string
  date: string
  status: {
    type: {
      name: string
      state?: string
      completed?: boolean
      detail?: string
      shortDetail?: string
    }
  }
  competitions: Array<{ competitors: EspnCompetitor[] }>
}

interface EspnResponse {
  events?: EspnEvent[]
}

export type EspnLeague = {
  sportPath: string
  slug: string
  label: string
  priority: number
  sport: MatchResult['sport']
}

/** Futbol — Süper Lig / Avrupa / top-5 öncelikli. */
export const SOCCER_LEAGUES: EspnLeague[] = [
  { sportPath: 'soccer', slug: 'TUR.1', label: 'Süper Lig', priority: 1, sport: 'futbol' },
  { sportPath: 'soccer', slug: 'UEFA.CHAMPIONS', label: 'Şampiyonlar Ligi', priority: 2, sport: 'futbol' },
  { sportPath: 'soccer', slug: 'UEFA.EUROPA', label: 'Avrupa Ligi', priority: 3, sport: 'futbol' },
  { sportPath: 'soccer', slug: 'UEFA.CONFERENCE', label: 'Konferans Ligi', priority: 4, sport: 'futbol' },
  { sportPath: 'soccer', slug: 'TUR.CUP', label: 'Türkiye Kupası', priority: 5, sport: 'futbol' },
  { sportPath: 'soccer', slug: 'ENG.1', label: 'Premier League', priority: 6, sport: 'futbol' },
  { sportPath: 'soccer', slug: 'ESP.1', label: 'La Liga', priority: 7, sport: 'futbol' },
  { sportPath: 'soccer', slug: 'GER.1', label: 'Bundesliga', priority: 8, sport: 'futbol' },
  { sportPath: 'soccer', slug: 'ITA.1', label: 'Serie A', priority: 9, sport: 'futbol' },
  { sportPath: 'soccer', slug: 'FRA.1', label: 'Ligue 1', priority: 10, sport: 'futbol' },
]

/** Basketbol — yazın WNBA canlı; NBA sezon dışıysa yaklaşan maçlar. */
export const BASKETBALL_LEAGUES: EspnLeague[] = [
  { sportPath: 'basketball', slug: 'wnba', label: 'WNBA', priority: 1, sport: 'basketbol' },
  { sportPath: 'basketball', slug: 'nba', label: 'NBA', priority: 2, sport: 'basketbol' },
]

function mapEspnEvent(ev: EspnEvent, league: EspnLeague): MatchResult | null {
  const comp = ev.competitions?.[0]
  const home = comp?.competitors.find((c) => c.homeAway === 'home')
  const away = comp?.competitors.find((c) => c.homeAway === 'away')
  if (!home && !away) return null

  const typeName = ev.status.type.name
  const state = ev.status.type.state ?? ''
  const isLive = LIVE_STATES.has(typeName) || state === 'in'
  const isFinished =
    FINISHED_STATES.has(typeName) || state === 'post' || ev.status.type.completed === true

  let statusDetail: string
  if (isFinished) {
    statusDetail = ev.status.type.shortDetail ?? ev.status.type.detail ?? 'MS'
  } else if (isLive) {
    statusDetail = ev.status.type.detail ?? ev.status.type.shortDetail ?? ''
  } else {
    statusDetail = toTurkeyTime(ev.date)
  }

  return {
    id: `${league.sport}-${ev.id}`,
    homeTeam: home?.team.displayName ?? 'Ev Sahibi',
    awayTeam: away?.team.displayName ?? 'Deplasman',
    homeScore: isLive || isFinished ? parseScore(home?.score) : null,
    awayScore: isLive || isFinished ? parseScore(away?.score) : null,
    homeBadge: home?.team.logo ?? fallbackBadge(home?.team.displayName ?? 'H'),
    awayBadge: away?.team.logo ?? fallbackBadge(away?.team.displayName ?? 'A'),
    date: toTurkeyYmd(ev.date),
    time: toTurkeyTime(ev.date),
    league: league.label,
    status: isLive ? 'live' : isFinished ? 'finished' : 'upcoming',
    statusDetail,
    priority: league.priority,
    sport: league.sport,
  }
}

export async function fetchEspnLeague(
  league: EspnLeague,
  datesCompact?: string
): Promise<MatchResult[]> {
  try {
    const qs = datesCompact ? `?dates=${datesCompact}` : ''
    const url = `https://site.api.espn.com/apis/site/v2/sports/${league.sportPath}/${league.slug}/scoreboard${qs}`
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'NaHaber/1.0' },
      signal: AbortSignal.timeout(7000),
    })
    if (!res.ok) return []
    const data = (await res.json()) as EspnResponse
    if (!data.events?.length) return []
    return data.events
      .map((ev) => mapEspnEvent(ev, league))
      .filter((m): m is MatchResult => m !== null)
  } catch {
    return []
  }
}
