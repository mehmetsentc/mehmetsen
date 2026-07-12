import { getAdminFirestore } from '@/lib/firebase/admin'

const FOOTBALL_KEY = process.env.FOOTBALL_API_KEY?.trim()
const FOOTBALL_BASE = 'https://v3.football.api-sports.io'

// Türkiye Süper Lig = 203, sezon 2025 (2025-26)
export const SUPER_LIG_ID = 203
export const CURRENT_SEASON = 2025

// Cache süreleri
const STANDINGS_TTL = 60 * 60 * 1000        // 1 saat
const FIXTURES_TTL  = 30 * 60 * 1000        // 30 dakika
const LIVE_TTL      = 5  * 60 * 1000        // 5 dakika
const CACHE_COL = 'footballCache'

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
  date: string          // ISO string
  statusShort: string   // 'NS' 'FT' '1H' '2H' 'HT' etc.
  homeTeam: string
  homeLogo: string
  awayTeam: string
  awayLogo: string
  homeGoals: number | null
  awayGoals: number | null
  elapsed: number | null
}

interface ApiResponse {
  response: unknown[]
}

async function apiFetch<T>(path: string): Promise<T[]> {
  if (!FOOTBALL_KEY) throw new Error('FOOTBALL_API_KEY env var tanımlanmamış')
  const res = await fetch(`${FOOTBALL_BASE}${path}`, {
    headers: {
      'x-apisports-key': FOOTBALL_KEY,
      'x-rapidapi-key': FOOTBALL_KEY,
      'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
    },
    signal: AbortSignal.timeout(15_000),
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`API-Football ${path} → HTTP ${res.status}`)
  const json: ApiResponse = await res.json()
  return json.response as T[]
}

// ---------- Puan Tablosu ----------
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

export async function getStandings(): Promise<Standing[]> {
  const db  = getAdminFirestore()
  const ref = db.collection(CACHE_COL).doc(`standings-${SUPER_LIG_ID}-${CURRENT_SEASON}`)
  const doc = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { standings: Standing[]; cachedAt: number }
    if (Date.now() - d.cachedAt < STANDINGS_TTL) return d.standings
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(`/standings?league=${SUPER_LIG_ID}&season=${CURRENT_SEASON}`)
  const standings: Standing[] = (raw[0]?.league?.standings?.[0] ?? []).map(mapStanding)
  await ref.set({ standings, cachedAt: Date.now() })
  return standings
}

// ---------- Maçlar ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFixture(f: any): Fixture {
  return {
    id:         f.fixture.id,
    date:       f.fixture.date,
    statusShort: f.fixture.status.short,
    homeTeam:   f.teams.home.name,
    homeLogo:   f.teams.home.logo,
    awayTeam:   f.teams.away.name,
    awayLogo:   f.teams.away.logo,
    homeGoals:  f.goals.home,
    awayGoals:  f.goals.away,
    elapsed:    f.fixture.status.elapsed,
  }
}

export async function getTodayFixtures(): Promise<Fixture[]> {
  const today = new Date().toISOString().slice(0, 10)
  const db    = getAdminFirestore()
  const ref   = db.collection(CACHE_COL).doc(`fixtures-today-${today}`)
  const doc   = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { fixtures: Fixture[]; cachedAt: number }
    if (Date.now() - d.cachedAt < FIXTURES_TTL) return d.fixtures
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(
    `/fixtures?league=${SUPER_LIG_ID}&season=${CURRENT_SEASON}&date=${today}`
  )
  const fixtures = raw.map(mapFixture)
  await ref.set({ fixtures, cachedAt: Date.now() })
  return fixtures
}

export async function getUpcomingFixtures(next = 5): Promise<Fixture[]> {
  const db  = getAdminFirestore()
  const ref = db.collection(CACHE_COL).doc(`fixtures-upcoming-${SUPER_LIG_ID}`)
  const doc = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { fixtures: Fixture[]; cachedAt: number }
    if (Date.now() - d.cachedAt < FIXTURES_TTL) return d.fixtures.slice(0, next)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(
    `/fixtures?league=${SUPER_LIG_ID}&season=${CURRENT_SEASON}&next=${next}`
  )
  const fixtures = raw.map(mapFixture)
  await ref.set({ fixtures, cachedAt: Date.now() })
  return fixtures
}

export async function getLiveFixtures(): Promise<Fixture[]> {
  const db  = getAdminFirestore()
  const ref = db.collection(CACHE_COL).doc(`fixtures-live-${SUPER_LIG_ID}`)
  const doc = await ref.get()
  if (doc.exists) {
    const d = doc.data() as { fixtures: Fixture[]; cachedAt: number }
    if (Date.now() - d.cachedAt < LIVE_TTL) return d.fixtures
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(`/fixtures?live=all&league=${SUPER_LIG_ID}`)
  const fixtures = raw.map(mapFixture)
  await ref.set({ fixtures, cachedAt: Date.now() })
  return fixtures
}
