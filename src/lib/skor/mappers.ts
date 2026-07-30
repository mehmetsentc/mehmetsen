import type { MatchResult } from '@/lib/sports/matchTypes'
import type { ScoreboardMatch } from '@/services/footballService.server'
import type {
  SkorBoardLeagueGroup,
  SkorBoardMatch,
  SkorMatchStatus,
  SkorProvider,
  SkorSport,
  SportsLeagueDoc,
  SportsMatchDoc,
} from '@/lib/skor/types'
import { FINISHED_SHORT, LIVE_SHORT } from '@/lib/skor/types'

export function leagueDocId(sport: SkorSport, externalId: string | number): string {
  return `${sport}_${externalId}`
}

export function matchDocId(provider: SkorProvider, externalId: string | number): string {
  return `${provider}_${externalId}`
}

function statusFromShort(short: string): SkorMatchStatus {
  if (LIVE_SHORT.has(short)) return 'live'
  if (FINISHED_SHORT.has(short)) return 'finished'
  if (short === 'PST' || short === 'POST') return 'postponed'
  if (short === 'CANC' || short === 'ABD') return 'cancelled'
  return 'upcoming'
}

function matchResultStatusShort(m: MatchResult): string {
  if (m.status === 'live') return 'LIVE'
  if (m.status === 'finished') return 'FT'
  return 'NS'
}

function kickoffFromMatchResult(m: MatchResult): string {
  const hm = m.time?.match(/(\d{2}):(\d{2})/)
  if (hm) return `${m.date}T${hm[1]}:${hm[2]}:00+03:00`
  return `${m.date}T12:00:00+03:00`
}

export function footballScoreboardToMatchDoc(m: ScoreboardMatch): SportsMatchDoc {
  const provider: SkorProvider = 'api-football'
  const leagueId = leagueDocId('futbol', m.leagueId)
  const statusShort = m.statusShort || 'NS'
  return {
    id: matchDocId(provider, m.id),
    sport: 'futbol',
    leagueId,
    leagueName: m.leagueName,
    country: m.country || 'Dünya',
    season: m.season,
    kickoff: m.date,
    dateYmd: toYmd(m.date),
    status: statusFromShort(statusShort),
    statusShort,
    elapsed: m.elapsed,
    homeTeam: m.homeTeam,
    homeLogo: m.homeLogo,
    awayTeam: m.awayTeam,
    awayLogo: m.awayLogo,
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    provider,
    externalId: String(m.id),
    updatedAt: Date.now(),
  }
}

export function matchResultToMatchDoc(m: MatchResult, provider: SkorProvider): SportsMatchDoc {
  const externalId = m.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
  const leagueKey = m.league
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40)
  const leagueId = leagueDocId(m.sport, leagueKey || 'unknown')
  const statusShort = matchResultStatusShort(m)
  return {
    id: matchDocId(provider, externalId),
    sport: m.sport,
    leagueId,
    leagueName: m.league,
    country: countryFromLeagueName(m.league, m.sport),
    season: inferSeason(m.date),
    kickoff: kickoffFromMatchResult(m),
    dateYmd: m.date,
    status: m.status,
    statusShort,
    elapsed: null,
    homeTeam: m.homeTeam,
    homeLogo: m.homeBadge,
    awayTeam: m.awayTeam,
    awayLogo: m.awayBadge,
    homeGoals: m.homeScore,
    awayGoals: m.awayScore,
    provider,
    externalId,
    updatedAt: Date.now(),
  }
}

export function ensureLeagueFromMatch(m: SportsMatchDoc, priority = 50): SportsLeagueDoc {
  return {
    id: m.leagueId,
    sport: m.sport,
    name: m.leagueName,
    country: m.country,
    externalId: m.leagueId.replace(`${m.sport}_`, ''),
    provider: m.provider,
    active: true,
    priority,
    updatedAt: Date.now(),
  }
}

export function matchDocToBoard(m: SportsMatchDoc): SkorBoardMatch {
  return {
    id: m.id,
    date: m.kickoff,
    statusShort: m.statusShort,
    elapsed: m.elapsed,
    homeTeam: m.homeTeam,
    homeLogo: m.homeLogo,
    awayTeam: m.awayTeam,
    awayLogo: m.awayLogo,
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    leagueId: m.leagueId,
    leagueName: m.leagueName,
    country: m.country,
    season: m.season,
    status: m.status,
  }
}

export function groupBoardMatches(matches: SportsMatchDoc[]): SkorBoardLeagueGroup[] {
  const map = new Map<string, SkorBoardLeagueGroup>()
  for (const m of matches) {
    const key = `${m.country}|${m.leagueId}`
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        leagueId: m.leagueId,
        leagueName: m.leagueName,
        country: m.country,
        matches: [],
      }
      map.set(key, g)
    }
    g.matches.push(matchDocToBoard(m))
  }

  const countryPriority = (c: string) => {
    const n = c.toLowerCase()
    if (n === 'turkey' || n === 'türkiye' || n === 'turkiye') return 0
    if (n.includes('usa') || n === 'amerika') return 1
    if (n === 'england' || n === 'ingiltere') return 2
    if (n === 'spain' || n === 'ispanya') return 3
    if (n === 'germany' || n === 'almanya') return 4
    if (n === 'italy' || n === 'italya') return 5
    if (n === 'france' || n === 'fransa') return 6
    if (n === 'world' || n === 'dünya' || n === 'europe' || n === 'avrupa') return 7
    return 10
  }

  return [...map.values()]
    .map((g) => ({
      ...g,
      matches: [...g.matches].sort((a, b) => {
        const aLive = a.status === 'live' || LIVE_SHORT.has(a.statusShort) ? 0 : 1
        const bLive = b.status === 'live' || LIVE_SHORT.has(b.statusShort) ? 0 : 1
        if (aLive !== bLive) return aLive - bLive
        return new Date(a.date).getTime() - new Date(b.date).getTime()
      }),
    }))
    .sort((a, b) => {
      const cp = countryPriority(a.country) - countryPriority(b.country)
      if (cp !== 0) return cp
      return a.leagueName.localeCompare(b.leagueName, 'tr')
    })
}

function toYmd(isoOrYmd: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrYmd)) return isoOrYmd
  const tr = new Date(new Date(isoOrYmd).getTime() + 3 * 3600_000)
  return tr.toISOString().slice(0, 10)
}

function inferSeason(ymd: string): number {
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(5, 7))
  // European football season starts Aug
  if (m >= 8) return y
  return y - 1
}

function countryFromLeagueName(league: string, sport: SkorSport): string {
  if (/süper lig|türkiye|turkiye|efeler|sultanlar/i.test(league)) return 'Turkey'
  if (/premier/i.test(league)) return 'England'
  if (/la liga/i.test(league)) return 'Spain'
  if (/bundesliga/i.test(league)) return 'Germany'
  if (/serie a/i.test(league)) return 'Italy'
  if (/ligue 1/i.test(league)) return 'France'
  if (/nba|wnba/i.test(league)) return 'USA'
  if (/uefa|şampiyonlar|avrupa|fivb|cev|vnl/i.test(league)) return 'World'
  if (sport === 'basketbol') return 'USA'
  if (sport === 'voleybol') return 'World'
  return 'World'
}
