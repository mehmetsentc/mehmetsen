import {
  queryArchiveMatches,
  queryLiveMatches,
  queryMatchesBySportDate,
  queryProgramMatches,
  getStandingsDoc,
  listLeagues,
  listSeasons,
  turkeyYmd,
} from '@/lib/skor/store'
import { groupBoardMatches } from '@/lib/skor/mappers'
import { hydrateSportBoard } from '@/lib/skor/sync'
import type {
  SkorBoardLeagueGroup,
  SkorBoardTab,
  SkorSport,
  SportsMatchDoc,
} from '@/lib/skor/types'
import { FINISHED_SHORT, LIVE_SHORT } from '@/lib/skor/types'

const PROGRAM_DAYS = 21

function filterByTab(
  matches: SportsMatchDoc[],
  tab: SkorBoardTab,
  today: string,
  resultsDay: string
): SportsMatchDoc[] {
  return matches.filter((m) => {
    if (tab === 'live') return m.status === 'live' || LIVE_SHORT.has(m.statusShort)
    if (tab === 'today') return m.dateYmd === today
    if (tab === 'results') {
      return m.dateYmd === resultsDay && (m.status === 'finished' || FINISHED_SHORT.has(m.statusShort))
    }
    if (tab === 'program') {
      return (
        m.dateYmd >= today &&
        m.status === 'upcoming' &&
        !LIVE_SHORT.has(m.statusShort) &&
        !FINISHED_SHORT.has(m.statusShort)
      )
    }
    return true
  })
}

function programDayList(fromYmd: string, days = PROGRAM_DAYS): string[] {
  const out: string[] = []
  for (let i = 0; i <= days; i++) out.push(turkeyYmd(i))
  // turkeyYmd(i) is relative to now — when fromYmd is today this is fine
  void fromYmd
  return out
}

export async function getSkorBoard(opts: {
  sport: SkorSport
  tab: SkorBoardTab
  date?: string
}): Promise<{
  tab: SkorBoardTab
  sport: SkorSport
  date: string
  groups: SkorBoardLeagueGroup[]
  liveCount: number
  emptyReason: string | null
  source: 'firestore' | 'hydrate'
  updatedAt: number
}> {
  const sport = opts.sport
  const tab = opts.tab === 'standings' || opts.tab === 'archive' ? 'today' : opts.tab
  const today = turkeyYmd(0)
  const yesterday = turkeyYmd(-1)
  const date =
    opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date)
      ? opts.date
      : tab === 'results'
        ? yesterday
        : today

  let matches: SportsMatchDoc[] = []
  let source: 'firestore' | 'hydrate' = 'firestore'
  let emptyReason: string | null = null

  if (tab === 'live') {
    matches = await queryLiveMatches(sport)
    if (matches.length === 0) {
      const hydrated = await hydrateSportBoard(sport, [today, yesterday])
      matches = hydrated.filter((m) => m.status === 'live' || LIVE_SHORT.has(m.statusShort))
      source = 'hydrate'
    }
  } else if (tab === 'program') {
    const to = turkeyYmd(PROGRAM_DAYS)
    matches = await queryProgramMatches(sport, today, to)
    matches = filterByTab(matches, 'program', today, yesterday)
    if (matches.length === 0) {
      const hydrated = await hydrateSportBoard(sport, programDayList(today))
      matches = filterByTab(hydrated, 'program', today, yesterday)
      source = 'hydrate'
    }
  } else if (tab === 'results') {
    matches = await queryMatchesBySportDate(sport, date)
    matches = filterByTab(matches, 'results', today, date)
    if (matches.length === 0) {
      const days = [date, turkeyYmd(-2), turkeyYmd(-3)]
      const hydrated = await hydrateSportBoard(sport, days)
      matches = hydrated.filter(
        (m) =>
          (m.status === 'finished' || FINISHED_SHORT.has(m.statusShort)) &&
          days.includes(m.dateYmd)
      )
      source = 'hydrate'
    }
  } else {
    // today
    matches = await queryMatchesBySportDate(sport, date)
    matches = filterByTab(matches, 'today', date, yesterday)
    if (matches.length === 0) {
      const hydrated = await hydrateSportBoard(sport, [date])
      matches = filterByTab(hydrated, 'today', date, yesterday)
      source = 'hydrate'
    }
    // Offseason / sparse days: soft-fill with upcoming so the board isn't blank
    if (matches.length === 0) {
      const to = turkeyYmd(PROGRAM_DAYS)
      let upcoming = await queryProgramMatches(sport, today, to)
      upcoming = filterByTab(upcoming, 'program', today, yesterday)
      if (upcoming.length === 0) {
        const hydrated = await hydrateSportBoard(sport, programDayList(today))
        upcoming = filterByTab(hydrated, 'program', today, yesterday)
        source = 'hydrate'
      }
      if (upcoming.length > 0) {
        matches = upcoming
        emptyReason = 'showing_upcoming'
      } else {
        emptyReason = 'no_matches_today'
      }
    }
  }

  const groups = groupBoardMatches(matches)
  const liveCount = matches.filter(
    (m) => m.status === 'live' || LIVE_SHORT.has(m.statusShort)
  ).length

  if (!emptyReason) {
    emptyReason =
      groups.length === 0 && tab === 'today'
        ? 'no_matches_today'
        : groups.length === 0 && tab === 'live'
          ? 'no_live'
          : null
  }

  return {
    tab,
    sport,
    date,
    groups,
    liveCount,
    emptyReason,
    source,
    updatedAt: Date.now(),
  }
}

export async function getSkorStandings(leagueId: string, season: number | string) {
  const doc = await getStandingsDoc(leagueId, season)
  return doc
}

export async function getSkorArchive(leagueId: string, season: number | string) {
  const [standings, matches, seasons, leagues] = await Promise.all([
    getStandingsDoc(leagueId, season),
    queryArchiveMatches(leagueId, season),
    listSeasons(leagueId),
    listLeagues(),
  ])
  const league = leagues.find((l) => l.id === leagueId) ?? null
  return {
    league,
    season,
    seasons,
    standings,
    matches: groupBoardMatches(matches),
    updatedAt: Date.now(),
  }
}

export function parseSkorSport(raw: string | null): SkorSport {
  const v = (raw ?? 'futbol').trim().toLowerCase()
  if (v === 'basketbol' || v === 'basketball') return 'basketbol'
  if (v === 'voleybol' || v === 'volleyball') return 'voleybol'
  return 'futbol'
}

export function parseSkorTab(raw: string | null): SkorBoardTab {
  const v = (raw ?? 'today').trim().toLowerCase()
  if (
    v === 'live' ||
    v === 'today' ||
    v === 'results' ||
    v === 'program' ||
    v === 'standings' ||
    v === 'archive'
  ) {
    return v
  }
  return 'today'
}
