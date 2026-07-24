/** Shared match card model for /api/sports/matches and score UIs. */
export type SportMatchKind = 'futbol' | 'basketbol' | 'voleybol' | 'all'

export interface MatchResult {
  id: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  homeBadge: string
  awayBadge: string
  /** Turkey calendar day YYYY-MM-DD */
  date: string
  time: string
  league: string
  status: 'live' | 'finished' | 'upcoming'
  statusDetail: string
  priority: number
  sport: Exclude<SportMatchKind, 'all'>
}

export function turkeyNowParts(nowMs = Date.now()) {
  const tr = new Date(nowMs + 3 * 3600_000)
  const ymd = tr.toISOString().slice(0, 10)
  return {
    ymd,
    compact: ymd.replace(/-/g, ''),
    ms: tr.getTime(),
  }
}

export function addTurkeyDays(ymd: string, delta: number): string {
  const ms = Date.parse(`${ymd}T12:00:00.000Z`) + delta * 86400_000
  return new Date(ms).toISOString().slice(0, 10)
}

export function toTurkeyYmd(iso: string): string {
  const tr = new Date(new Date(iso).getTime() + 3 * 3600_000)
  return tr.toISOString().slice(0, 10)
}

export function toTurkeyTime(iso: string): string {
  const d = new Date(iso)
  const hh = String((d.getUTCHours() + 3) % 24).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm} TSİ`
}

export function fallbackBadge(name: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&size=40`
}

export function parseScore(s: string | number | null | undefined): number | null {
  if (s == null || s === '') return null
  const n = typeof s === 'number' ? s : parseInt(String(s), 10)
  return Number.isFinite(n) ? n : null
}
