/**
 * GET /api/sports/matches
 * TheSportsDB free API — bugünün futbol maçlarını döner.
 * Saatler UTC+3 Türkiye saatine çevrilir.
 * Öncelik: Dünya Kupası → Türk takımları → Avrupa ligleri
 * Amerikan ligleri (USL, MLS vb.) gösterilmez.
 */
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SportsDBEvent {
  idEvent: string
  strHomeTeam: string
  strAwayTeam: string
  strHomeTeamBadge?: string
  strAwayTeamBadge?: string
  intHomeScore: string | null
  intAwayScore: string | null
  dateEvent: string      // "YYYY-MM-DD"
  strTime: string | null // "16:00:00+00:00" veya "16:00" (UTC)
  strLeague: string
  strSport?: string
}

export interface MatchResult {
  id: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  homeBadge: string
  awayBadge: string
  date: string
  time: string    // Türkiye saati "HH:MM TSİ"
  league: string
  status: 'finished' | 'upcoming'
  priority: number
}

// ── Öncelik sıralaması ──────────────────────────────────────────────────────
// Düşük sayı = daha önce göster
const LEAGUE_PRIORITY: Array<{ pattern: RegExp; priority: number }> = [
  { pattern: /world cup|dünya kupası|fifa world/i,      priority: 1 },
  { pattern: /euro 20\d\d|avrupa şampiyonası/i,         priority: 2 },
  { pattern: /nations league|uluslar ligi/i,            priority: 3 },
  { pattern: /champions league|şampiyonlar ligi/i,      priority: 4 },
  { pattern: /europa league|avrupa ligi/i,              priority: 5 },
  { pattern: /conference league/i,                      priority: 6 },
  { pattern: /süper lig|superlig|turkish/i,             priority: 7 },
  { pattern: /premier league/i,                         priority: 8 },
  { pattern: /la liga|laliga/i,                         priority: 9 },
  { pattern: /bundesliga/i,                             priority: 10 },
  { pattern: /serie a/i,                                priority: 11 },
  { pattern: /ligue 1/i,                                priority: 12 },
  { pattern: /eredivisie/i,                             priority: 13 },
  { pattern: /primeira liga|liga nos/i,                 priority: 14 },
]

// Gösterilmeyecek ligler — Amerikan ve düşük öncelikli ligler
const EXCLUDED_LEAGUES = [
  /usl/i, /mls/i, /nwsl/i, /usoc/i,
  /concacaf/i,  // Amerika kıtası kupası
  /conmebol/i,  // Güney Amerika (Dünya Kupası dışında)
  /caf /i,      // Afrika
  /afc /i,      // Asya
  /a-league/i,  // Avustralya
  /j[1-3] league/i, // Japonya
  /k league/i,  // Kore
  /chinese super/i,
  /indian super/i,
  /saudi pro/i,
  /süper kupa/i, // Community shield vb.
]

// Türk takım isimleri — bu takımlar içeren maçlar bonus öncelik alır
const TURKISH_TEAMS = [
  'galatasaray', 'fenerbahçe', 'fenerbahce', 'beşiktaş', 'besiktas',
  'trabzonspor', 'başakşehir', 'basaksehir', 'türkiye', 'turkey',
  'kasımpaşa', 'sivasspor', 'konyaspor', 'alanyaspor', 'adana demirspor',
  'ankaragücü', 'gaziantep', 'hatayspor', 'kayserispor', 'rizespor',
  'samsunspor', 'pendikspor', 'eyüpspor',
]

function hasTurkishTeam(home: string, away: string): boolean {
  const combined = `${home} ${away}`.toLowerCase()
  return TURKISH_TEAMS.some((t) => combined.includes(t))
}

function getLeaguePriority(league: string): number {
  for (const { pattern, priority } of LEAGUE_PRIORITY) {
    if (pattern.test(league)) return priority
  }
  return 50 // bilinmeyen lig — düşük öncelik
}

function isExcluded(league: string): boolean {
  return EXCLUDED_LEAGUES.some((re) => re.test(league))
}

// ── UTC → Türkiye saati (UTC+3) ─────────────────────────────────────────────
function utcTimeToTurkey(timeStr: string | null, dateStr: string): string {
  if (!timeStr) return ''

  // "16:00:00+00:00", "16:00:00Z", "16:00" formatlarını destekle
  const match = timeStr.match(/^(\d{2}):(\d{2})/)
  if (!match) return ''

  const utcHour = parseInt(match[1]!, 10)
  const utcMin  = parseInt(match[2]!, 10)

  // UTC+3 ekle
  const trHour = (utcHour + 3) % 24
  const hh = String(trHour).padStart(2, '0')
  const mm = String(utcMin).padStart(2, '0')

  return `${hh}:${mm} TSİ`
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function teamBadge(team: string, badge?: string): string {
  if (badge) return `${badge}/preview`
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(team)}&size=40`
}

async function fetchDay(dateStr: string): Promise<MatchResult[]> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateStr}&s=Soccer`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return []
    const data = await res.json() as { events?: SportsDBEvent[] }
    if (!data.events) return []

    const results: MatchResult[] = []

    for (const e of data.events) {
      // Amerikan ve diğer hariç tutulan ligler
      if (isExcluded(e.strLeague)) continue

      const priority = getLeaguePriority(e.strLeague)

      // Bilinmeyen + Türk takımı yoksa filtrele (priority 50 ve Türk takım yok)
      if (priority === 50 && !hasTurkishTeam(e.strHomeTeam, e.strAwayTeam)) continue

      // Türk takımı içeren maçlar önce gelsin
      const finalPriority = hasTurkishTeam(e.strHomeTeam, e.strAwayTeam)
        ? Math.min(priority, 3)
        : priority

      results.push({
        id: e.idEvent,
        homeTeam: e.strHomeTeam,
        awayTeam: e.strAwayTeam,
        homeScore: e.intHomeScore !== null ? parseInt(e.intHomeScore) : null,
        awayScore: e.intAwayScore !== null ? parseInt(e.intAwayScore) : null,
        homeBadge: teamBadge(e.strHomeTeam, e.strHomeTeamBadge),
        awayBadge: teamBadge(e.strAwayTeam, e.strAwayTeamBadge),
        date: e.dateEvent,
        time: utcTimeToTurkey(e.strTime, e.dateEvent),
        league: e.strLeague,
        status: e.intHomeScore !== null ? 'finished' : 'upcoming',
        priority: finalPriority,
      })
    }

    // Önceliğe göre sırala
    results.sort((a, b) => a.priority - b.priority)
    return results
  } catch {
    return []
  }
}

export async function GET() {
  // Türkiye saatine göre "bugün"
  const nowUTC = new Date()
  const nowTR = new Date(nowUTC.getTime() + 3 * 60 * 60 * 1000)
  const todayTR = toDateStr(nowTR)
  const yesterdayTR = toDateStr(new Date(nowTR.getTime() - 24 * 60 * 60 * 1000))

  let matches = await fetchDay(todayTR)
  let dateLabel = 'Bugün'

  if (matches.length === 0) {
    matches = await fetchDay(yesterdayTR)
    dateLabel = 'Dün'
  }

  return NextResponse.json(
    { matches: matches.slice(0, 20), dateLabel, updatedAt: Date.now() },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } }
  )
}
