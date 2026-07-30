import {
  BASKETBALL_LEAGUES,
  SOCCER_LEAGUES,
  fetchEspnLeague,
} from '@/lib/sports/espnScoreboard'
import { fetchSportsDbDays } from '@/lib/sports/theSportsDb'
import { addTurkeyDays, turkeyNowParts } from '@/lib/sports/matchTypes'
import {
  CURRENT_SEASON,
  LEAGUE_IDS,
  LEAGUES,
  getDayScoreboard,
  getLiveScoreboard,
  getStandings,
} from '@/services/footballService.server'
import {
  bumpSeasonMeta,
  setSyncState,
  turkeyYmd,
  upsertLeagues,
  upsertMatches,
  upsertStandings,
  upsertSeason,
} from '@/lib/skor/store'
import {
  ensureLeagueFromMatch,
  footballScoreboardToMatchDoc,
  leagueDocId,
  matchResultToMatchDoc,
} from '@/lib/skor/mappers'
import type {
  SkorSport,
  SportsLeagueDoc,
  SportsMatchDoc,
  SportsStandingRow,
  SportsStandingsDoc,
} from '@/lib/skor/types'
import { FOOTBALL_STANDINGS_LEAGUES } from '@/lib/skor/types'

const TR_LEAGUE_SEED: SportsLeagueDoc[] = LEAGUE_IDS.map((id, i) => ({
  id: leagueDocId('futbol', id),
  sport: 'futbol' as const,
  name: LEAGUES[id] ?? `Lig ${id}`,
  country: 'Turkey',
  externalId: String(id),
  provider: 'api-football' as const,
  active: true,
  priority: i + 1,
  updatedAt: Date.now(),
}))

const TR_IDS = new Set(LEAGUE_IDS.map(String))

const EU_LEAGUE_SEED: SportsLeagueDoc[] = FOOTBALL_STANDINGS_LEAGUES.filter(
  (l) => !TR_IDS.has(l.externalId)
).map((l, i) => ({
  id: l.id,
  sport: 'futbol' as const,
  name: l.label,
  country: 'World',
  externalId: l.externalId,
  provider: 'api-football' as const,
  active: true,
  priority: 20 + i,
  updatedAt: Date.now(),
}))

const ESPN_LEAGUE_SEED: SportsLeagueDoc[] = [
  ...SOCCER_LEAGUES.map((l, i) => ({
    id: leagueDocId('futbol', l.slug.toLowerCase().replace(/\./g, '_')),
    sport: 'futbol' as const,
    name: l.label,
    country: 'World',
    externalId: l.slug,
    provider: 'espn' as const,
    active: true,
    priority: 40 + i,
    updatedAt: Date.now(),
  })),
  ...BASKETBALL_LEAGUES.map((l, i) => ({
    id: leagueDocId('basketbol', l.slug),
    sport: 'basketbol' as const,
    name: l.label,
    country: 'USA',
    externalId: l.slug,
    provider: 'espn' as const,
    active: true,
    priority: i + 1,
    updatedAt: Date.now(),
  })),
]

async function persistMatchDocs(docs: SportsMatchDoc[]): Promise<number> {
  if (!docs.length) return 0
  const leagues = new Map<string, ReturnType<typeof ensureLeagueFromMatch>>()
  for (const m of docs) {
    if (!leagues.has(m.leagueId)) leagues.set(m.leagueId, ensureLeagueFromMatch(m))
  }
  await upsertLeagues([...leagues.values()])
  const n = await upsertMatches(docs)

  const seasonKeys = new Map<string, SportsMatchDoc>()
  for (const m of docs) {
    const key = `${m.leagueId}_${m.season}`
    if (!seasonKeys.has(key)) seasonKeys.set(key, m)
  }
  await Promise.all(
    [...seasonKeys.values()].map((m) =>
      bumpSeasonMeta(m.leagueId, m.leagueName, m.sport, m.season, 0)
    )
  )
  return n
}

async function fetchEspnDays(sport: SkorSport, days: string[]): Promise<SportsMatchDoc[]> {
  const compact = days.map((d) => d.replace(/-/g, ''))
  const leagues =
    sport === 'futbol' ? SOCCER_LEAGUES : sport === 'basketbol' ? BASKETBALL_LEAGUES : []
  if (!leagues.length) return []
  const batches = await Promise.all(
    leagues.flatMap((league) => compact.map((d) => fetchEspnLeague(league, d)))
  )
  const daySet = new Set(days)
  return batches
    .flat()
    .filter((m) => daySet.has(m.date) && m.sport === sport)
    .map((m) => matchResultToMatchDoc(m, 'espn'))
}

async function fetchTsdbDays(sport: 'basketbol' | 'voleybol', days: string[]) {
  const matches = await fetchSportsDbDays(sport, days)
  return matches.map((m) => matchResultToMatchDoc(m, 'tsdb'))
}

/** Seed catalog + sync live windows for all sports. */
export async function syncSkorLive(): Promise<Record<string, unknown>> {
  const today = turkeyYmd(0)
  const yesterday = turkeyYmd(-1)
  const counts: Record<string, number> = {}

  try {
    await upsertLeagues([...TR_LEAGUE_SEED, ...EU_LEAGUE_SEED, ...ESPN_LEAGUE_SEED])

    // Football live from API-Football
    let footballDocs: SportsMatchDoc[] = []
    try {
      const live = await getLiveScoreboard()
      footballDocs = live.flatMap((g) => g.matches.map(footballScoreboardToMatchDoc))
    } catch {
      footballDocs = []
    }
    if (footballDocs.length === 0) {
      footballDocs = await fetchEspnDays('futbol', [today, yesterday])
      footballDocs = footballDocs.filter((m) => m.status === 'live')
    } else {
      footballDocs = footballDocs.filter((m) => m.status === 'live')
    }
    counts.futbolLive = await persistMatchDocs(footballDocs)

    // Basketball ESPN + TSDB
    const basketLive = [
      ...(await fetchEspnDays('basketbol', [today, yesterday])),
      ...(await fetchTsdbDays('basketbol', [today, yesterday])),
    ].filter((m) => m.status === 'live')
    counts.basketLive = await persistMatchDocs(dedupeMatches(basketLive))

    // Volleyball TSDB
    const volleyLive = (await fetchTsdbDays('voleybol', [today, yesterday])).filter(
      (m) => m.status === 'live'
    )
    counts.volleyLive = await persistMatchDocs(volleyLive)

    await setSyncState('skor-live', { ok: true, counts })
    return { ok: true, counts }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await setSyncState('skor-live', { ok: false, error: msg, counts })
    throw err
  }
}

/** Upsert today / yesterday results / tomorrow+ program. */
export async function syncSkorDaily(): Promise<Record<string, unknown>> {
  const today = turkeyYmd(0)
  const yesterday = turkeyYmd(-1)
  const tomorrow = turkeyYmd(1)
  const programEnd = turkeyYmd(7)
  const counts: Record<string, number> = {}

  try {
    await upsertLeagues([...TR_LEAGUE_SEED, ...EU_LEAGUE_SEED, ...ESPN_LEAGUE_SEED])

    const dayList = [yesterday, today, tomorrow]
    const footballDayDocs: SportsMatchDoc[] = []
    for (const day of dayList) {
      try {
        const groups = await getDayScoreboard(day)
        footballDayDocs.push(
          ...groups.flatMap((g) => g.matches.map(footballScoreboardToMatchDoc))
        )
      } catch {
        /* ESPN fallback below */
      }
    }
    const espnFutbol = await fetchEspnDays('futbol', [
      ...dayList,
      ...rangeYmd(today, programEnd),
    ])
    counts.futbol = await persistMatchDocs(dedupeMatches([...footballDayDocs, ...espnFutbol]))

    const basketDays = [...dayList, ...rangeYmd(today, programEnd)]
    const basket = [
      ...(await fetchEspnDays('basketbol', basketDays)),
      ...(await fetchTsdbDays('basketbol', basketDays)),
    ]
    counts.basketbol = await persistMatchDocs(dedupeMatches(basket))

    const volley = await fetchTsdbDays('voleybol', basketDays)
    counts.voleybol = await persistMatchDocs(volley)

    await setSyncState('skor-daily', { ok: true, counts })
    return { ok: true, date: today, counts }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await setSyncState('skor-daily', { ok: false, error: msg, counts })
    throw err
  }
}

/** Puan durumu + sezon arşiv meta (futbol API). */
export async function syncSkorStandings(): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {}
  try {
    const ids = [
      ...LEAGUE_IDS.map(String),
      ...FOOTBALL_STANDINGS_LEAGUES.map((l) => l.externalId),
    ]
    const unique = [...new Set(ids)]

    for (const ext of unique) {
      const leagueIdNum = Number(ext)
      const leagueId = leagueDocId('futbol', ext)
      const name =
        LEAGUES[leagueIdNum as keyof typeof LEAGUES] ??
        FOOTBALL_STANDINGS_LEAGUES.find((l) => l.externalId === ext)?.label ??
        `Lig ${ext}`

      try {
        const rows = await getStandings(leagueIdNum, CURRENT_SEASON)
        const mapped: SportsStandingRow[] = rows.map((r) => ({
          rank: r.rank,
          teamId: String(r.teamId),
          teamName: r.teamName,
          teamLogo: r.teamLogo,
          played: r.played,
          won: r.won,
          draw: r.draw,
          lost: r.lost,
          goalsFor: r.goalsFor,
          goalsAgainst: r.goalsAgainst,
          points: r.points,
          form: r.form,
        }))
        const doc: SportsStandingsDoc = {
          id: `${leagueId}_${CURRENT_SEASON}`,
          leagueId,
          leagueName: name,
          season: CURRENT_SEASON,
          sport: 'futbol',
          rows: mapped,
          updatedAt: Date.now(),
        }
        await upsertStandings(doc)
        await upsertSeason({
          id: `${leagueId}_${CURRENT_SEASON}`,
          leagueId,
          leagueName: name,
          sport: 'futbol',
          year: CURRENT_SEASON,
          matchCount: 0,
          updatedAt: Date.now(),
        })
        results[ext] = mapped.length
      } catch (e) {
        results[ext] = e instanceof Error ? e.message : String(e)
      }
    }

    await setSyncState('skor-standings', {
      ok: true,
      counts: Object.fromEntries(
        Object.entries(results).map(([k, v]) => [k, typeof v === 'number' ? v : 0])
      ),
    })
    return { ok: true, season: CURRENT_SEASON, results }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await setSyncState('skor-standings', { ok: false, error: msg })
    throw err
  }
}

/** On-demand hydrate when board is empty. */
export async function hydrateSportBoard(
  sport: SkorSport,
  days: string[]
): Promise<SportsMatchDoc[]> {
  if (sport === 'futbol') {
    const docs: SportsMatchDoc[] = []
    for (const day of days) {
      try {
        const groups = await getDayScoreboard(day)
        docs.push(...groups.flatMap((g) => g.matches.map(footballScoreboardToMatchDoc)))
      } catch {
        /* ignore */
      }
    }
    docs.push(...(await fetchEspnDays('futbol', days)))
    await persistMatchDocs(dedupeMatches(docs))
    return dedupeMatches(docs)
  }
  if (sport === 'basketbol') {
    const docs = dedupeMatches([
      ...(await fetchEspnDays('basketbol', days)),
      ...(await fetchTsdbDays('basketbol', days)),
    ])
    await persistMatchDocs(docs)
    return docs
  }
  const docs = await fetchTsdbDays('voleybol', days)
  await persistMatchDocs(docs)
  return docs
}

function dedupeMatches(docs: SportsMatchDoc[]): SportsMatchDoc[] {
  const map = new Map<string, SportsMatchDoc>()
  for (const d of docs) {
    const key = `${d.sport}|${d.dateYmd}|${d.homeTeam}|${d.awayTeam}`
    const prev = map.get(key)
    // Prefer api-football > espn > tsdb
    const rank = (p: string) => (p === 'api-football' ? 0 : p === 'espn' ? 1 : 2)
    if (!prev || rank(d.provider) < rank(prev.provider)) map.set(key, d)
  }
  return [...map.values()]
}

function rangeYmd(from: string, to: string): string[] {
  const out: string[] = []
  let cur = from
  while (cur <= to && out.length < 14) {
    out.push(cur)
    cur = addTurkeyDays(cur, 1)
  }
  return out
}

export function boardDateLabel(): string {
  return turkeyNowParts().ymd
}
