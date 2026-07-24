import {
  BASKETBALL_LEAGUES,
  SOCCER_LEAGUES,
  fetchEspnLeague,
  type EspnLeague,
} from '@/lib/sports/espnScoreboard'
import {
  addTurkeyDays,
  turkeyNowParts,
  type MatchResult,
  type SportMatchKind,
} from '@/lib/sports/matchTypes'
import { fetchSportsDbDays } from '@/lib/sports/theSportsDb'

const STATUS_ORDER = { live: 0, finished: 1, upcoming: 2 } as const

function sortMatches(a: MatchResult, b: MatchResult, today: string): number {
  const sA = STATUS_ORDER[a.status]
  const sB = STATUS_ORDER[b.status]
  if (sA !== sB) return sA - sB
  if (a.date !== b.date) {
    // Today first, then future ascending, then past descending
    const aToday = a.date === today ? 0 : a.date > today ? 1 : 2
    const bToday = b.date === today ? 0 : b.date > today ? 1 : 2
    if (aToday !== bToday) return aToday - bToday
    if (aToday === 1) return a.date.localeCompare(b.date)
    if (aToday === 2) return b.date.localeCompare(a.date)
  }
  return a.priority - b.priority
}

function pickWindow(all: MatchResult[], today: string, yesterday: string): MatchResult[] {
  const liveOrToday = all.filter(
    (m) =>
      m.status === 'live' ||
      m.date === today ||
      (m.date === yesterday && m.status === 'finished')
  )

  if (liveOrToday.length >= 4) return liveOrToday

  const upcoming = all
    .filter((m) => m.status === 'upcoming' && m.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.priority - b.priority)

  const recentFinished = all
    .filter((m) => m.status === 'finished' && m.date < today)
    .sort((a, b) => b.date.localeCompare(a.date) || a.priority - b.priority)

  const merged: MatchResult[] = []
  const seen = new Set<string>()
  for (const m of [...liveOrToday, ...upcoming, ...recentFinished]) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    merged.push(m)
  }
  return merged
}

async function fetchEspnWindow(leagues: EspnLeague[], fromYmd: string, toYmd: string) {
  const range = `${fromYmd.replace(/-/g, '')}-${toYmd.replace(/-/g, '')}`
  const batches = await Promise.all(
    leagues.map(async (league) => {
      const ranged = await fetchEspnLeague(league, range)
      if (ranged.length > 0) return ranged
      // Some boards ignore ranges — fall back to default scoreboard
      return fetchEspnLeague(league)
    })
  )
  return batches.flat()
}

function sportsDbDayList(today: string): string[] {
  return [-2, -1, 0, 1, 2, 3, 4, 5, 6].map((d) => addTurkeyDays(today, d))
}

export async function collectSportMatches(
  sport: SportMatchKind = 'all'
): Promise<{ matches: MatchResult[]; dateLabel: string; liveCount: number }> {
  const { ymd: today } = turkeyNowParts()
  const yesterday = addTurkeyDays(today, -1)
  const from = addTurkeyDays(today, -3)
  const to = addTurkeyDays(today, 14)

  const wantFutbol = sport === 'all' || sport === 'futbol'
  const wantBasket = sport === 'all' || sport === 'basketbol'
  const wantVoleybol = sport === 'all' || sport === 'voleybol'

  const tasks: Promise<MatchResult[]>[] = []
  if (wantFutbol) tasks.push(fetchEspnWindow(SOCCER_LEAGUES, from, to))
  if (wantBasket) {
    tasks.push(fetchEspnWindow(BASKETBALL_LEAGUES, from, to))
    tasks.push(fetchSportsDbDays('basketbol', sportsDbDayList(today)))
  }
  if (wantVoleybol) tasks.push(fetchSportsDbDays('voleybol', sportsDbDayList(today)))

  const all = (await Promise.all(tasks)).flat()
  const dedup = new Map<string, MatchResult>()
  for (const m of all) {
    // Prefer ESPN ids when both sources collide on same teams/day
    const key = `${m.sport}|${m.date}|${m.homeTeam}|${m.awayTeam}`
    const prev = dedup.get(key)
    if (!prev || (prev.id.includes('tsdb') && !m.id.includes('tsdb'))) {
      dedup.set(key, m)
    }
  }

  const picked = pickWindow([...dedup.values()], today, yesterday)
    .sort((a, b) => sortMatches(a, b, today))
    .slice(0, sport === 'all' ? 24 : 16)

  const liveCount = picked.filter((m) => m.status === 'live').length
  const hasFinishedToday = picked.some((m) => m.status === 'finished' && m.date === today)
  const hasUpcoming = picked.some((m) => m.status === 'upcoming')

  const dateLabel =
    liveCount > 0
      ? `${liveCount} canlı maç`
      : hasFinishedToday
        ? 'Bugün'
        : hasUpcoming
          ? 'Program'
          : picked.some((m) => m.status === 'finished')
            ? 'Son sonuçlar'
            : ''

  return { matches: picked, dateLabel, liveCount }
}

export function parseSportParam(raw: string | null): SportMatchKind {
  const v = (raw ?? 'all').trim().toLowerCase()
  if (v === 'futbol' || v === 'soccer' || v === 'football') return 'futbol'
  if (v === 'basketbol' || v === 'basketball') return 'basketbol'
  if (v === 'voleybol' || v === 'volleyball') return 'voleybol'
  return 'all'
}
