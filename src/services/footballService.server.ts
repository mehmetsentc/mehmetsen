import { getAdminFirestore } from '@/lib/firebase/admin'

const FOOTBALL_KEY  = process.env.FOOTBALL_API_KEY?.trim()
const FOOTBALL_BASE = 'https://v3.football.api-sports.io'

export const LEAGUES: Record<number, string> = {
  203: 'Süper Lig',
  204: 'TFF 1. Lig',
  205: 'TFF 2. Lig',
  206: 'TFF 3. Lig',
}
export const LEAGUE_IDS = [203, 204, 205, 206] as const
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
export async function getUpcomingFixtures(leagueId = 203, next = 10): Promise<Fixture[]> {
  const db  = getAdminFirestore()
  const ref = db.collection(CACHE_COL).doc(`fixtures-upcoming-${leagueId}`)
  const doc = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { fixtures: Fixture[]; cachedAt: number }
    if (Date.now() - d.cachedAt < FIXTURES_TTL) return d.fixtures.slice(0, next)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(
    `/fixtures?league=${leagueId}&season=${CURRENT_SEASON}&next=${next}`
  )
  const fixtures = raw.map(mapFixture)
  await ref.set({ fixtures, cachedAt: Date.now() })
  return fixtures
}

// ─── Geçmiş Maçlar ───────────────────────────────────────────────────────────
export async function getPastFixtures(leagueId = 203, season = CURRENT_SEASON, last = 20): Promise<Fixture[]> {
  const db  = getAdminFirestore()
  const ref = db.collection(CACHE_COL).doc(`fixtures-past-${leagueId}-${season}`)
  const doc = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { fixtures: Fixture[]; cachedAt: number }
    if (Date.now() - d.cachedAt < PAST_TTL) return d.fixtures.slice(0, last)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(
    `/fixtures?league=${leagueId}&season=${season}&last=${last}`
  )
  const fixtures = raw.map(mapFixture)
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
