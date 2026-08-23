import { getAdminFirestore } from '@/lib/firebase/admin'

/** Canonical: FOOTBALL_API_KEY. Aliases accepted if Pro key was stored under another name. */
const FOOTBALL_KEY = (
  process.env.FOOTBALL_API_KEY ||
  process.env.API_FOOTBALL_KEY ||
  process.env.API_SPORTS_KEY ||
  process.env.APISPORTS_KEY ||
  ''
).trim()
const FOOTBALL_BASE = 'https://v3.football.api-sports.io'

export const LEAGUES: Record<number, string> = {
  203: 'Süper Lig',
  204: 'TFF 1. Lig',
  205: 'TFF 2. Lig',
  552: 'TFF 3. Lig',  // Group 1 — league 206 is Türkiye Kupası, not 3. Lig
}
export const LEAGUE_IDS = [203, 204, 205, 552] as const
export type LeagueId = typeof LEAGUE_IDS[number]

/** API-Football season year = start year (Aug → that calendar year). */
function turkeyParts(ms = Date.now()): { y: number; m: number } {
  const d = new Date(ms + 3 * 3600_000)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }
}

/** Prefer FOOTBALL_SEASON env; else Aug–Dec = year, Jan–Jul = year-1. */
export function resolveCurrentSeason(nowMs = Date.now()): number {
  const raw = Number(process.env.FOOTBALL_SEASON)
  if (Number.isFinite(raw) && raw >= 2000 && raw <= 2100) return Math.trunc(raw)
  const { y, m } = turkeyParts(nowMs)
  return m >= 8 ? y : y - 1
}

export const CURRENT_SEASON = resolveCurrentSeason()
export const PREV_SEASON = CURRENT_SEASON - 1

/** Newest → older seasons to try when Free plan blocks current year. */
export function footballSeasonCandidates(preferred = CURRENT_SEASON): number[] {
  const start = Number.isFinite(preferred) ? preferred : CURRENT_SEASON
  const out: number[] = []
  for (let s = start; s >= start - 4 && s >= 2020; s -= 1) out.push(s)
  return out
}

export function isSeasonAccessError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /access to this season|try from \d{4} to \d{4}|plan:/i.test(msg)
}

/** Parse Free-plan hint like "try from 2022 to 2024" → max allowed year. */
export function parseAllowedSeasonMax(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err)
  const m = msg.match(/try from\s+(\d{4})\s+to\s+(\d{4})/i)
  if (!m) return null
  const max = Number(m[2])
  return Number.isFinite(max) ? max : null
}

/** Remaining candidates after a blocked season, preferring the plan's max year. */
function seasonFallbackQueue(
  preferred: number,
  failedSeason: number,
  err: unknown
): number[] {
  const max = parseAllowedSeasonMax(err)
  const base = footballSeasonCandidates(preferred).filter((s) => s < failedSeason)
  if (max == null) return base
  const capped = base.filter((s) => s <= max)
  const head = capped.filter((s) => s === max)
  const rest = capped.filter((s) => s !== max)
  return [...head, ...rest]
}

export function hasFootballApiKey(): boolean {
  return FOOTBALL_KEY.length > 0
}

// Eski backward-compat export
export const SUPER_LIG_ID = 203

// Cache TTL
const STANDINGS_TTL = 60 * 60 * 1000       // 1 saat
const FIXTURES_TTL  = 30 * 60 * 1000       // 30 dakika
const LIVE_TTL      =  5 * 60 * 1000       // 5 dakika
const PAST_TTL      =  6 * 60 * 60 * 1000  // 6 saat
const CACHE_COL     = 'footballCache'

export interface Standing {
  rank: number
  teamId: number
  teamName: string
  teamLogo: string
  played: number
  won: number
  draw: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
  form: string
}

export interface Fixture {
  id: number
  date: string
  statusShort: string
  homeTeam: string
  homeLogo: string
  awayTeam: string
  awayLogo: string
  homeGoals: number | null
  awayGoals: number | null
  elapsed: number | null
}

/** Maçkolik tarzı gün/canlı skor satırı — ülke + lig bilgili. */
export interface ScoreboardMatch {
  id: number
  date: string
  statusShort: string
  elapsed: number | null
  homeTeam: string
  homeLogo: string
  awayTeam: string
  awayLogo: string
  homeGoals: number | null
  awayGoals: number | null
  leagueId: number
  leagueName: string
  country: string
  countryFlag: string
  season: number
}

export interface ScoreboardLeagueGroup {
  key: string
  leagueId: number
  leagueName: string
  country: string
  countryFlag: string
  matches: ScoreboardMatch[]
}

interface ApiResponse { response: unknown[] }

async function apiFetch<T>(path: string): Promise<T[]> {
  if (!FOOTBALL_KEY) throw new Error('FOOTBALL_API_KEY tanımlanmamış')
  const res = await fetch(`${FOOTBALL_BASE}${path}`, {
    headers: { 'x-apisports-key': FOOTBALL_KEY },
    signal: AbortSignal.timeout(15_000),
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`API-Football ${path} → HTTP ${res.status}`)
  const json = (await res.json()) as ApiResponse & {
    errors?: Record<string, string> | string[]
    results?: number
  }
  const errs = json.errors
  if (errs) {
    const msg = Array.isArray(errs)
      ? errs.join('; ')
      : Object.entries(errs)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ')
    if (msg) throw new Error(`API-Football ${path} → ${msg}`)
  }
  return (json.response ?? []) as T[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStanding(s: any): Standing {
  return {
    rank:         s.rank,
    teamId:       s.team.id,
    teamName:     s.team.name,
    teamLogo:     s.team.logo,
    played:       s.all.played,
    won:          s.all.win,
    draw:         s.all.draw,
    lost:         s.all.lose,
    goalsFor:     s.all.goals.for,
    goalsAgainst: s.all.goals.against,
    points:       s.points,
    form:         s.form ?? '',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFixture(f: any): Fixture {
  return {
    id:          f.fixture.id,
    date:        f.fixture.date,
    statusShort: f.fixture.status.short,
    homeTeam:    f.teams.home.name,
    homeLogo:    f.teams.home.logo,
    awayTeam:    f.teams.away.name,
    awayLogo:    f.teams.away.logo,
    homeGoals:   f.goals.home,
    awayGoals:   f.goals.away,
    elapsed:     f.fixture.status.elapsed,
  }
}

// ─── Puan Tablosu ────────────────────────────────────────────────────────────
async function fetchStandingsForSeason(leagueId: number, season: number): Promise<Standing[]> {
  const db = getAdminFirestore()
  const ref = db.collection(CACHE_COL).doc(`standings-${leagueId}-${season}`)
  const doc = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { standings: Standing[]; cachedAt: number }
    // Empty cache is not authoritative (wrong season / plan miss) — refetch.
    if (d.standings?.length && Date.now() - d.cachedAt < STANDINGS_TTL) return d.standings
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(`/standings?league=${leagueId}&season=${season}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allGroups: any[][] = raw[0]?.league?.standings ?? []
  const standings: Standing[] = allGroups.flat().map(mapStanding)
  if (standings.length) await ref.set({ standings, cachedAt: Date.now() })
  return standings
}

/** Standings for preferred season, falling back when Free plan blocks newer seasons. */
export async function getStandingsResolved(
  leagueId = 203,
  preferredSeason = CURRENT_SEASON
): Promise<{ season: number; standings: Standing[] }> {
  const candidates = footballSeasonCandidates(preferredSeason)
  let lastErr: unknown
  for (const season of candidates) {
    try {
      const standings = await fetchStandingsForSeason(leagueId, season)
      if (standings.length) return { season, standings }
      // Empty table — try older season only if this looks like preseason / unavailable.
      if (season === preferredSeason && candidates.length > 1) continue
      return { season, standings }
    } catch (err) {
      lastErr = err
      if (isSeasonAccessError(err)) continue
      throw err
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`API-Football standings unavailable for league ${leagueId}`)
}

export async function getStandings(leagueId = 203, season = CURRENT_SEASON): Promise<Standing[]> {
  const resolved = await getStandingsResolved(leagueId, season)
  return resolved.standings
}

// ─── Bugünkü Maçlar ──────────────────────────────────────────────────────────
export async function getTodayFixtures(leagueId = 203): Promise<Fixture[]> {
  const today = turkeyYmd()
  const db    = getAdminFirestore()
  const ref   = db.collection(CACHE_COL).doc(`fixtures-today-${leagueId}-${today}`)
  const doc   = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { fixtures: Fixture[]; cachedAt: number }
    if (Date.now() - d.cachedAt < FIXTURES_TTL) return d.fixtures
  }
  let lastErr: unknown
  for (const season of footballSeasonCandidates()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await apiFetch<any>(
        `/fixtures?league=${leagueId}&season=${season}&date=${today}`
      )
      const fixtures = raw.map(mapFixture)
      await ref.set({ fixtures, cachedAt: Date.now() })
      return fixtures
    } catch (err) {
      lastErr = err
      if (isSeasonAccessError(err)) continue
      throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fixtures-today unavailable')
}

// ─── Yaklaşan Maçlar ─────────────────────────────────────────────────────────
// Free plan: `next` parametresi yok — from/to aralığı kullanılır
export async function getUpcomingFixtures(leagueId = 203, next = 10): Promise<Fixture[]> {
  const db  = getAdminFirestore()
  const ref = db.collection(CACHE_COL).doc(`fixtures-upcoming-${leagueId}`)
  const doc = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { fixtures: Fixture[]; cachedAt: number }
    if (Date.now() - d.cachedAt < FIXTURES_TTL) return d.fixtures.slice(0, next)
  }
  const today  = turkeyYmd()
  const future = turkeyYmd(Date.now() + 60 * 24 * 60 * 60 * 1000)
  let lastErr: unknown
  for (const season of footballSeasonCandidates()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await apiFetch<any>(
        `/fixtures?league=${leagueId}&season=${season}&from=${today}&to=${future}`
      )
      const fixtures = raw
        .map(mapFixture)
        .sort((a: Fixture, b: Fixture) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, next)
      await ref.set({ fixtures, cachedAt: Date.now() })
      return fixtures
    } catch (err) {
      lastErr = err
      if (isSeasonAccessError(err)) continue
      throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fixtures-upcoming unavailable')
}

// ─── Geçmiş Maçlar ───────────────────────────────────────────────────────────
// Free plan: `last` parametresi yok — sezonun son ayları (Mart–Temmuz) çekilir
export async function getPastFixtures(leagueId = 203, season = CURRENT_SEASON, last = 20): Promise<Fixture[]> {
  const db = getAdminFirestore()
  let lastErr: unknown
  for (const s of footballSeasonCandidates(season)) {
    const ref = db.collection(CACHE_COL).doc(`fixtures-past-${leagueId}-${s}`)
    const doc = await ref.get()
    if (doc.exists) {
      const d = doc.data() as { fixtures: Fixture[]; cachedAt: number }
      if (d.fixtures?.length && Date.now() - d.cachedAt < PAST_TTL) {
        return d.fixtures.slice(0, last)
      }
    }
    // season=2024 → 2024-25 → bitiş Mart–Temmuz 2025
    const endYear = s + 1
    const from = `${endYear}-03-01`
    const to = `${endYear}-07-31`
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await apiFetch<any>(
        `/fixtures?league=${leagueId}&season=${s}&from=${from}&to=${to}`
      )
      const fixtures = raw
        .map(mapFixture)
        .sort((a: Fixture, b: Fixture) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, last)
      if (fixtures.length) await ref.set({ fixtures, cachedAt: Date.now() })
      if (fixtures.length || s === footballSeasonCandidates(season).at(-1)) return fixtures
    } catch (err) {
      lastErr = err
      if (isSeasonAccessError(err)) continue
      throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fixtures-past unavailable')
}

// ─── Canlı Maçlar ────────────────────────────────────────────────────────────
export async function getLiveFixtures(leagueId = 203): Promise<Fixture[]> {
  const db  = getAdminFirestore()
  const ref = db.collection(CACHE_COL).doc(`fixtures-live-${leagueId}`)
  const doc = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { fixtures: Fixture[]; cachedAt: number }
    if (Date.now() - d.cachedAt < LIVE_TTL) return d.fixtures
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(`/fixtures?live=all&league=${leagueId}`)
  const fixtures = raw.map(mapFixture)
  await ref.set({ fixtures, cachedAt: Date.now() })
  return fixtures
}

const LIVE_SHORT = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT', 'BREAK'])

function turkeyYmd(ms = Date.now()): string {
  return new Date(ms + 3 * 3600_000).toISOString().slice(0, 10)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapScoreboardMatch(f: any): ScoreboardMatch {
  return {
    id: f.fixture.id,
    date: f.fixture.date,
    statusShort: f.fixture.status.short,
    elapsed: f.fixture.status.elapsed,
    homeTeam: f.teams.home.name,
    homeLogo: f.teams.home.logo,
    awayTeam: f.teams.away.name,
    awayLogo: f.teams.away.logo,
    homeGoals: f.goals.home,
    awayGoals: f.goals.away,
    leagueId: f.league.id,
    leagueName: f.league.name,
    country: f.league.country || 'Dünya',
    countryFlag: f.league.flag || '',
    season: f.league.season ?? CURRENT_SEASON,
  }
}

function groupScoreboard(matches: ScoreboardMatch[]): ScoreboardLeagueGroup[] {
  const map = new Map<string, ScoreboardLeagueGroup>()
  for (const m of matches) {
    const key = `${m.country}|${m.leagueId}`
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        leagueId: m.leagueId,
        leagueName: m.leagueName,
        country: m.country,
        countryFlag: m.countryFlag,
        matches: [],
      }
      map.set(key, g)
    }
    g.matches.push(m)
  }

  const countryPriority = (c: string) => {
    const n = c.toLowerCase()
    if (n === 'turkey' || n === 'türkiye' || n === 'turkiye') return 0
    if (n === 'england' || n === 'ingiltere') return 1
    if (n === 'spain' || n === 'ispanya') return 2
    if (n === 'germany' || n === 'almanya') return 3
    if (n === 'italy' || n === 'italya') return 4
    if (n === 'france' || n === 'fransa') return 5
    if (n === 'world' || n === 'dünya' || n === 'europe' || n === 'avrupa') return 6
    return 10
  }

  return [...map.values()]
    .map((g) => ({
      ...g,
      matches: [...g.matches].sort((a, b) => {
        const aLive = LIVE_SHORT.has(a.statusShort) ? 0 : 1
        const bLive = LIVE_SHORT.has(b.statusShort) ? 0 : 1
        if (aLive !== bLive) return aLive - bLive
        return new Date(a.date).getTime() - new Date(b.date).getTime()
      }),
    }))
    .sort((a, b) => {
      const cp = countryPriority(a.country) - countryPriority(b.country)
      if (cp !== 0) return cp
      const aLive = a.matches.some((m) => LIVE_SHORT.has(m.statusShort)) ? 0 : 1
      const bLive = b.matches.some((m) => LIVE_SHORT.has(m.statusShort)) ? 0 : 1
      if (aLive !== bLive) return aLive - bLive
      return a.leagueName.localeCompare(b.leagueName, 'tr')
    })
}

/** Tüm ligler — belirli bir günün maçları (ülke/lig gruplu). */
export async function getDayScoreboard(dateYmd?: string): Promise<ScoreboardLeagueGroup[]> {
  const date = dateYmd || turkeyYmd()
  const db = getAdminFirestore()
  const ref = db.collection(CACHE_COL).doc(`scoreboard-day-${date}`)
  const doc = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { groups: ScoreboardLeagueGroup[]; cachedAt: number }
    if (Date.now() - d.cachedAt < FIXTURES_TTL) return d.groups
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(`/fixtures?date=${date}`)
  const matches = raw.map(mapScoreboardMatch) as ScoreboardMatch[]
  const groups = groupScoreboard(matches)
  await ref.set({ groups, cachedAt: Date.now() })
  return groups
}

/** Tüm ligler — şu an canlı maçlar. */
export async function getLiveScoreboard(): Promise<ScoreboardLeagueGroup[]> {
  const db = getAdminFirestore()
  const ref = db.collection(CACHE_COL).doc('scoreboard-live-all')
  const doc = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { groups: ScoreboardLeagueGroup[]; cachedAt: number }
    if (Date.now() - d.cachedAt < LIVE_TTL) return d.groups
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>('/fixtures?live=all')
  const matches = raw.map(mapScoreboardMatch) as ScoreboardMatch[]
  const groups = groupScoreboard(matches)
  await ref.set({ groups, cachedAt: Date.now() })
  return groups
}

export interface TeamSquadPlayer {
  id: number
  name: string
  age: number | null
  number: number | null
  position: string
  photo: string
}

/** API-Football kadro. */
export async function getTeamSquad(teamId: number): Promise<TeamSquadPlayer[]> {
  const db = getAdminFirestore()
  const ref = db.collection(CACHE_COL).doc(`squad-${teamId}`)
  const doc = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { players: TeamSquadPlayer[]; cachedAt: number }
    if (Date.now() - d.cachedAt < 6 * 3600_000) return d.players
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(`/players/squads?team=${teamId}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const players: TeamSquadPlayer[] = (raw[0]?.players ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    age: p.age ?? null,
    number: p.number ?? null,
    position: p.position ?? '',
    photo: p.photo ?? '',
  }))
  await ref.set({ players, cachedAt: Date.now() })
  return players
}
