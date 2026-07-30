/** NaHaber Skor — shared domain types (Firestore + API). */

export type SkorSport = 'futbol' | 'basketbol' | 'voleybol'

export type SkorProvider = 'api-football' | 'espn' | 'tsdb'

export type SkorMatchStatus = 'live' | 'finished' | 'upcoming' | 'postponed' | 'cancelled'

export type SkorBoardTab = 'live' | 'today' | 'results' | 'program' | 'standings' | 'archive'

export interface SportsLeagueDoc {
  id: string
  sport: SkorSport
  name: string
  country: string
  externalId: string
  provider: SkorProvider
  active: boolean
  priority: number
  updatedAt: number
}

export interface SportsMatchDoc {
  id: string
  sport: SkorSport
  leagueId: string
  leagueName: string
  country: string
  season: number | string
  kickoff: string
  dateYmd: string
  status: SkorMatchStatus
  statusShort: string
  elapsed: number | null
  homeTeam: string
  homeLogo: string
  awayTeam: string
  awayLogo: string
  homeGoals: number | null
  awayGoals: number | null
  provider: SkorProvider
  externalId: string
  updatedAt: number
}

export interface SportsStandingRow {
  rank: number
  teamId: string
  teamName: string
  teamLogo: string
  played: number
  won: number
  draw: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
  form?: string
}

export interface SportsStandingsDoc {
  id: string
  leagueId: string
  leagueName: string
  season: number | string
  sport: SkorSport
  rows: SportsStandingRow[]
  updatedAt: number
}

export interface SportsSeasonDoc {
  id: string
  leagueId: string
  leagueName: string
  sport: SkorSport
  year: number | string
  matchCount: number
  updatedAt: number
}

export interface SportsSyncStateDoc {
  id: string
  lastSyncAt: number
  lastOkAt: number | null
  lastError: string | null
  counts?: Record<string, number>
}

/** API board row — UI-facing (compatible with Mackolik-style rows). */
export interface SkorBoardMatch {
  id: string
  date: string
  statusShort: string
  elapsed: number | null
  homeTeam: string
  homeLogo: string
  awayTeam: string
  awayLogo: string
  homeGoals: number | null
  awayGoals: number | null
  leagueId: string
  leagueName: string
  country: string
  season: number | string
  status: SkorMatchStatus
}

export interface SkorBoardLeagueGroup {
  key: string
  leagueId: string
  leagueName: string
  country: string
  matches: SkorBoardMatch[]
}

export const LIVE_SHORT = new Set([
  '1H',
  '2H',
  'HT',
  'ET',
  'BT',
  'P',
  'LIVE',
  'INT',
  'BREAK',
])

export const FINISHED_SHORT = new Set(['FT', 'AET', 'PEN', 'AOT', 'WO', 'AWD'])

export const SKOR_SPORTS: { id: SkorSport; label: string }[] = [
  { id: 'futbol', label: 'Futbol' },
  { id: 'basketbol', label: 'Basketbol' },
  { id: 'voleybol', label: 'Voleybol' },
]

export const FOOTBALL_STANDINGS_LEAGUES = [
  { id: 'futbol_203', externalId: '203', label: 'Süper Lig' },
  { id: 'futbol_39', externalId: '39', label: 'Premier League' },
  { id: 'futbol_140', externalId: '140', label: 'La Liga' },
  { id: 'futbol_78', externalId: '78', label: 'Bundesliga' },
  { id: 'futbol_135', externalId: '135', label: 'Serie A' },
  { id: 'futbol_61', externalId: '61', label: 'Ligue 1' },
  { id: 'futbol_2', externalId: '2', label: 'Şampiyonlar Ligi' },
] as const
