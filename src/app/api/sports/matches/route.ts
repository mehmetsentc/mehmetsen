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
    type: {
      name: string       // "STATUS_SCHEDULED" | "STATUS_IN_PROGRESS" | "STATUS_FINAL"
      description: string
      detail: string     // "Final" | "1st Half" | "HT" | "2nd Half" | "Extra Time"
    }
    displayClock?: string // "34'" when live
  }
  competitions: Array<{
    competitors: EspnCompetitor[]
  }>
}

interface EspnResponse {
  events?: EspnEvent[]
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
      next: { revalidate: 60 },      // 60s cache — canlı skorlar için kısa
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const data = await res.json() as EspnResponse
    if (!data.events?.length) return []

    return data.events.map((ev): MatchResult => {
      const comp = ev.competitions[0]
      const home = comp?.competitors.find(c => c.homeAway === 'home')
      const away = comp?.competitors.find(c => c.homeAway === 'away')

      const typeName = ev.status.type.name   // STATUS_SCHEDULED | STATUS_IN_PROGRESS | STATUS_FINAL
      const isLive     = typeName === 'STATUS_IN_PROGRESS'
      const isFinished = typeName === 'STATUS_FINAL'
      const isUpcoming = typeName === 'STATUS_SCHEDULED'

      const homeScore = isLive || isFinished ? (parseInt(home?.score ?? '') || 0) : null
      const awayScore = isLive || isFinished ? (parseInt(away?.score ?? '') || 0) : null

      // Status detail string
      let statusDetail: string
      if (isFinished) {
        statusDetail = 'MS'
      } else if (isLive) {
        const clock = ev.status.displayClock
        const half  = ev.status.type.detail
        statusDetail = clock ? `${half} ${clock}` : half
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
  // Tüm ligleri paralel çek
  const allResults = await Promise.all(
    LEAGUES.map(l => fetchLeague(l.slug, l.label, l.priority))
  )

  const matches = allResults
    .flat()
    // Önce canlı, sonra biten, en son programlananlar
    .sort((a, b) => {
      const statusOrder = { live: 0, finished: 1, upcoming: 2 }
      const sA = statusOrder[a.status]
      const sB = statusOrder[b.status]
      if (sA !== sB) return sA - sB
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
        // Canlı maç varsa 30s, yoksa 2 dakika cache
        'Cache-Control': liveCount > 0
          ? 'public, s-maxage=30, stale-while-revalidate=60'
          : 'public, s-maxage=120, stale-while-revalidate=300',
      },
    }
  )
}
