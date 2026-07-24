import { getAdminFirestore } from '@/lib/firebase/admin'

const FOOTBALL_KEY  = process.env.FOOTBALL_API_KEY?.trim()
const FOOTBALL_BASE = 'https://v3.football.api-sports.io'

export const LEAGUES: Record<number, string> = {
  203: 'Süper Lig',
  204: 'TFF 1. Lig',
  205: 'TFF 2. Lig',
  552: 'TFF 3. Lig',  // Group 1 — league 206 is Türkiye Kupası, not 3. Lig
}
export const LEAGUE_IDS = [203, 204, 205, 552] as const
export type LeagueId = typeof LEAGUE_IDS[number]

export const CURRENT_SEASON = 2025
export const PREV_SEASON    = 2024

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
  const json: ApiResponse = await res.json()
  return json.response as T[]
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
export async function getStandings(leagueId = 203, season = CURRENT_SEASON): Promise<Standing[]> {
  const db  = getAdminFirestore()
  const ref = db.collection(CACHE_COL).doc(`standings-${leagueId}-${season}`)
  const doc = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { standings: Standing[]; cachedAt: number }
    if (Date.now() - d.cachedAt < STANDINGS_TTL) return d.standings
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw      = await apiFetch<any>(`/standings?league=${leagueId}&season=${season}`)
  // 3. Lig birden fazla grup içerebilir — hepsini birleştir
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allGroups: any[][] = raw[0]?.league?.standings ?? []
  const standings: Standing[] = allGroups.flat().map(mapStanding)
  await ref.set({ standings, cachedAt: Date.now() })
  return standings
}

// ─── Bugünkü Maçlar ──────────────────────────────────────────────────────────
export async function getTodayFixtures(leagueId = 203): Promise<Fixture[]> {
  const today = new Date().toISOString().slice(0, 10)
  const db    = getAdminFirestore()
  const ref   = db.collection(CACHE_COL).doc(`fixtures-today-${leagueId}-${today}`)
  const doc   = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { fixtures: Fixture[]; cachedAt: number }
    if (Date.now() - d.cachedAt < FIXTURES_TTL) return d.fixtures
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(
    `/fixtures?league=${leagueId}&season=${CURRENT_SEASON}&date=${today}`
  )
  const fixtures = raw.map(mapFixture)
  await ref.set({ fixtures, cachedAt: Date.now() })
  return fixtures
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
  const today  = new Date().toISOString().slice(0, 10)
  const future = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(
    `/fixtures?league=${leagueId}&season=${CURRENT_SEASON}&from=${today}&to=${future}`
  )
  const fixtures = raw
    .map(mapFixture)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: Fixture, b: Fixture) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, next)
  await ref.set({ fixtures, cachedAt: Date.now() })
  return fixtures
}

// ─── Geçmiş Maçlar ───────────────────────────────────────────────────────────
// Free plan: `last` parametresi yok — sezonun son ayları (Mart–Temmuz) çekilir
export async function getPastFixtures(leagueId = 203, season = CURRENT_SEASON, last = 20): Promise<Fixture[]> {
  const db  = getAdminFirestore()
  const ref = db.collection(CACHE_COL).doc(`fixtures-past-${leagueId}-${season}`)
  const doc = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { fixtures: Fixture[]; cachedAt: number }
    if (Date.now() - d.cachedAt < PAST_TTL) return d.fixtures.slice(0, last)
  }
  // season=2024 → 2024-25 sezonu → bitiş Mart-Temmuz 2025
  const endYear = season + 1
  const from = `${endYear}-03-01`
  const to   = `${endYear}-07-31`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(
    `/fixtures?league=${leagueId}&season=${season}&from=${from}&to=${to}`
  )
  // En yeni maçlar önce
  const fixtures = raw
    .map(mapFixture)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: Fixture, b: Fixture) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, last)
  await ref.set({ fixtures, cachedAt: Date.now() })
  return fixtures
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
