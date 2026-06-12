/**
 * GET /api/sports/matches
 * ESPN public scoreboard API — canlı maç skorları + bugünün programı
 * API key gerektirmez.
 * Öncelik: Dünya Kupası → Türk takımlar → Avrupa ligleri
 */
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── ESPN lig slug listesi ──────────────────────────────────────────────────
// priority = gösterim önceliği (düşük = üste)
const LEAGUES: { slug: string; label: string; priority: number }[] = [
  { slug: 'FIFA.World',           label: 'FIFA Dünya Kupası',    priority: 1 },
  { slug: 'UEFA.EURO',            label: 'Avrupa Şampiyonası',   priority: 2 },
  { slug: 'UEFA.NATIONS',         label: 'Uluslar Ligi',         priority: 3 },
  { slug: 'UEFA.CHAMPIONS',       label: 'Şampiyonlar Ligi',     priority: 4 },
  { slug: 'UEFA.EUROPA',          label: 'Avrupa Ligi',          priority: 5 },
  { slug: 'UEFA.CONFERENCE',      label: 'Konferans Ligi',       priority: 6 },
  { slug: 'TUR.1',                label: 'Süper Lig',            priority: 7 },
  { slug: 'TUR.CUP',              label: 'Türkiye Kupası',       priority: 8 },
  { slug: 'ENG.1',                label: 'Premier League',       priority: 9 },
  { slug: 'ESP.1',                label: 'La Liga',              priority: 10 },
  { slug: 'GER.1',                label: 'Bundesliga',           priority: 11 },
  { slug: 'ITA.1',                label: 'Serie A',              priority: 12 },
  { slug: 'FRA.1',                label: 'Ligue 1',              priority: 13 },
  { slug: 'NED.1',                label: 'Eredivisie',           priority: 14 },
]

export interface MatchResult {
  id: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  homeBadge: string
  awayBadge: string
  date: string
  time: string
  league: string
  status: 'live' | 'finished' | 'upcoming'
  statusDetail: string   // "1st Half 34'", "FT", "16:00 TSİ" etc.
  priority: number
}

// ── ESPN tip dönüşümü ────────────────────────────────────────────────────────
interface EspnCompetitor {
  team: { displayName: string; logo?: string }
  score?: string
  homeAway: 'home' | 'away'
}

interface EspnEvent {
  id: string
  name: string
  date: string          // ISO 8601
  status: {
    clock?: number
    displayClock?: string  // "34:00" when live
    period?: number
    type: {
      id: string
      name: string       // see LIVE_STATES below
      state?: string     // "pre" | "in" | "post"
      completed?: boolean
      description?: string
      detail?: string    // "34:00 - 1st Half" | "Half Time" | "Final"
      shortDetail?: string
    }
  }
  competitions: Array<{
    competitors: EspnCompetitor[]
  }>
}

interface EspnResponse {
  events?: EspnEvent[]
}

// ESPN status types that mean the match is currently being played
const LIVE_STATES = new Set([
  'STATUS_IN_PROGRESS',
  'STATUS_HALFTIME',
  'STATUS_END_PERIOD',
  'STATUS_OVERTIME',
  'STATUS_SHOOTOUT',
  'STATUS_EXTRA_TIME',
])

// ESPN status types that mean the match is finished
const FINISHED_STATES = new Set([
  'STATUS_FINAL',
  'STATUS_FULL_TIME',
  'STATUS_ABANDONED',
  'STATUS_POSTPONED',
  'STATUS_SUSPENDED',
])

function parseScore(s: string | undefined | null): number | null {
  if (s == null || s === '') return null
  const n = parseInt(s, 10)
  return isNaN(n) ? null : n
}

function fallbackBadge(name: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&size=40`
}

function utcToTurkey(isoDate: string): string {
  const d = new Date(isoDate)
  // UTC+3
  const trHour = (d.getUTCHours() + 3) % 24
  const hh = String(trHour).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm} TSİ`
}

async function fetchLeague(
  slug: string,
  label: string,
  priority: number
): Promise<MatchResult[]> {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard`
    const res = await fetch(url, {
      cache: 'no-store',             // her zaman taze veri — canlı skorlar
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return []
    const data = await res.json() as EspnResponse
    if (!data.events?.length) return []

    return data.events.map((ev): MatchResult => {
      const comp = ev.competitions[0]
      const home = comp?.competitors.find(c => c.homeAway === 'home')
      const away = comp?.competitors.find(c => c.homeAway === 'away')

      const typeName = ev.status.type.name
      // Also check state field as fallback ("in" = live, "post" = finished)
      const state    = ev.status.type.state ?? ''
      const isLive     = LIVE_STATES.has(typeName)  || state === 'in'
      const isFinished = FINISHED_STATES.has(typeName) || state === 'post' || (ev.status.type.completed === true)

      // Scores: ESPN always has score field on competitors when match started
      const homeScore = (isLive || isFinished) ? parseScore(home?.score) : null
      const awayScore = (isLive || isFinished) ? parseScore(away?.score) : null

      // Status detail string — use ESPN's pre-built detail when available
      let statusDetail: string
      if (isFinished) {
        statusDetail = ev.status.type.shortDetail ?? ev.status.type.detail ?? 'MS'
      } else if (isLive) {
        // e.g. "34:00 - 1st Half" or "Half Time"
        statusDetail = ev.status.type.detail ?? ev.status.type.shortDetail ?? ''
      } else {
        statusDetail = utcToTurkey(ev.date)
      }

      return {
        id: ev.id,
        homeTeam: home?.team.displayName ?? 'Ev Sahibi',
        awayTeam: away?.team.displayName ?? 'Deplasman',
        homeScore,
        awayScore,
        homeBadge: home?.team.logo ?? fallbackBadge(home?.team.displayName ?? ''),
        awayBadge: away?.team.logo ?? fallbackBadge(away?.team.displayName ?? ''),
        date: ev.date.slice(0, 10),
        time: utcToTurkey(ev.date),
        league: label,
        status: isLive ? 'live' : isFinished ? 'finished' : 'upcoming',
        statusDetail,
        priority,
      }
    })
  } catch {
    return []
  }
}

export async function GET() {
  // Türkiye saatine göre bugün ve dün
  const nowUTC  = Date.now()
  const nowTR   = new Date(nowUTC + 3 * 3600_000)
  const todayTR = nowTR.toISOString().slice(0, 10)          // "2026-06-13"
  const yestTR  = new Date(nowUTC + 3 * 3600_000 - 86400_000).toISOString().slice(0, 10)

  // Tüm ligleri paralel çek
  const allResults = await Promise.all(
    LEAGUES.map(l => fetchLeague(l.slug, l.label, l.priority))
  )

  const matches = allResults
    .flat()
    // Sadece bugün veya dünkü maçlar — eski tarihleri kaldır
    .filter(m => m.date === todayTR || m.date === yestTR)
    // Önce canlı, sonra biten (bugün > dün), en son programlananlar
    .sort((a, b) => {
      const statusOrder = { live: 0, finished: 1, upcoming: 2 }
      const sA = statusOrder[a.status]
      const sB = statusOrder[b.status]
      if (sA !== sB) return sA - sB
      // Aynı durumdaysa: bugünkü önce
      if (a.date !== b.date) return a.date > b.date ? -1 : 1
      return a.priority - b.priority
    })

  const liveCount = matches.filter(m => m.status === 'live').length
  const dateLabel = liveCount > 0
    ? `${liveCount} canlı maç`
    : matches.some(m => m.status === 'finished') ? 'Bugün' : 'Program'

  return NextResponse.json(
    { matches: matches.slice(0, 20), dateLabel, liveCount, updatedAt: Date.now() },
    {
      headers: {
        'Cache-Control': liveCount > 0
          ? 'public, s-maxage=30, stale-while-revalidate=60'
          : 'public, s-maxage=120, stale-while-revalidate=300',
      },
    }
  )
}
