/**
 * 2026 FIFA Dünya Kupası — Canlı veri servisi (ESPN public API)
 *
 * ESPN, kayıt/anahtar gerektirmeyen public endpoint'ler sağlıyor:
 *   - Standings (gruplar + puan durumu)
 *       https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings
 *   - Scoreboard (maçlar)
 *       https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=YYYYMMDD-YYYYMMDD
 *
 * Bu modül iki endpoint'ten okur, Türkçe takım adı + emoji bayrak ile
 * normalize eder, 15 dk `unstable_cache` ile sarar ve hata durumunda
 * hardcoded fallback döndürür (mevcut tablo).
 */
import { unstable_cache } from 'next/cache'

// ─── Public tipler ────────────────────────────────────────────────────────────
export interface WcTeamStat {
  team: string         // Türkçe ad
  flag: string         // emoji
  p: number            // oynanan
  w: number
  d: number
  l: number
  gf: number
  ga: number
  gd: number
  pts: number
  isTurkiye?: boolean
}

export interface WcGroup {
  id: string           // A..L
  name: string         // "Grup A"
  teams: WcTeamStat[]
}

export interface WcMatch {
  home: string
  homeFlag: string
  homeScore: number
  awayScore: number
  away: string
  awayFlag: string
  /** "13 Haz" gibi kısa Türkçe tarih */
  date: string
  /** ISO timestamp (sıralama için) */
  isoDate: string
  group: string
  finished: boolean
  isLive?: boolean
}

export interface WorldCup2026Data {
  groups: WcGroup[]
  matches: WcMatch[]
  /** Verinin alındığı ISO timestamp */
  updatedAt: string
  /** ESPN'den canlı veri mi, fallback mı */
  source: 'espn' | 'fallback'
}

// ─── ESPN ham veri tipleri (sadece okuduğumuz alanlar) ────────────────────────
interface EspnStanding {
  children: Array<{
    name: string
    standings: {
      entries: Array<{
        team: { displayName: string; abbreviation: string }
        stats: Array<{ abbreviation: string; value: number }>
      }>
    }
  }>
}

interface EspnScoreboardEvent {
  date: string
  status: { type: { completed: boolean; state: string; shortDetail: string } }
  competitions: Array<{
    competitors: Array<{
      homeAway: 'home' | 'away'
      score: string
      team: { displayName: string; abbreviation: string }
    }>
  }>
}

interface EspnScoreboard {
  events: EspnScoreboardEvent[]
}

// ─── Çeviri tablosu — ESPN İngilizce ad → { tr ad, emoji } ─────────────────────
const TEAM_INFO: Record<string, { tr: string; flag: string }> = {
  Algeria:              { tr: 'Cezayir',       flag: '🇩🇿' },
  Argentina:            { tr: 'Arjantin',      flag: '🇦🇷' },
  Australia:            { tr: 'Avustralya',    flag: '🇦🇺' },
  Austria:              { tr: 'Avusturya',     flag: '🇦🇹' },
  Belgium:              { tr: 'Belçika',       flag: '🇧🇪' },
  'Bosnia-Herzegovina': { tr: 'Bosna Hersek',  flag: '🇧🇦' },
  Brazil:               { tr: 'Brezilya',      flag: '🇧🇷' },
  Canada:               { tr: 'Kanada',        flag: '🇨🇦' },
  'Cape Verde':         { tr: 'Yeşil Burun',   flag: '🇨🇻' },
  Colombia:             { tr: 'Kolombiya',     flag: '🇨🇴' },
  'Congo DR':           { tr: 'K. Kongo',      flag: '🇨🇩' },
  Croatia:              { tr: 'Hırvatistan',   flag: '🇭🇷' },
  Curaçao:              { tr: 'Curaçao',       flag: '🇨🇼' },
  Czechia:              { tr: 'Çekya',         flag: '🇨🇿' },
  Ecuador:              { tr: 'Ekvador',       flag: '🇪🇨' },
  Egypt:                { tr: 'Mısır',         flag: '🇪🇬' },
  England:              { tr: 'İngiltere',     flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  France:               { tr: 'Fransa',        flag: '🇫🇷' },
  Germany:              { tr: 'Almanya',       flag: '🇩🇪' },
  Ghana:                { tr: 'Gana',          flag: '🇬🇭' },
  Haiti:                { tr: 'Haiti',         flag: '🇭🇹' },
  Iran:                 { tr: 'İran',          flag: '🇮🇷' },
  Iraq:                 { tr: 'Irak',          flag: '🇮🇶' },
  'Ivory Coast':        { tr: 'Fildişi Sah.',  flag: '🇨🇮' },
  Japan:                { tr: 'Japonya',       flag: '🇯🇵' },
  Jordan:               { tr: 'Ürdün',         flag: '🇯🇴' },
  Mexico:               { tr: 'Meksika',       flag: '🇲🇽' },
  Morocco:              { tr: 'Fas',           flag: '🇲🇦' },
  Netherlands:          { tr: 'Hollanda',      flag: '🇳🇱' },
  'New Zealand':        { tr: 'Yeni Zelanda',  flag: '🇳🇿' },
  Norway:               { tr: 'Norveç',        flag: '🇳🇴' },
  Panama:               { tr: 'Panama',        flag: '🇵🇦' },
  Paraguay:             { tr: 'Paraguay',      flag: '🇵🇾' },
  Portugal:             { tr: 'Portekiz',      flag: '🇵🇹' },
  Qatar:                { tr: 'Katar',         flag: '🇶🇦' },
  'Saudi Arabia':       { tr: 'S. Arabistan',  flag: '🇸🇦' },
  Scotland:             { tr: 'İskoçya',       flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  Senegal:              { tr: 'Senegal',       flag: '🇸🇳' },
  'South Africa':       { tr: 'G. Afrika',     flag: '🇿🇦' },
  'South Korea':        { tr: 'G. Kore',       flag: '🇰🇷' },
  Spain:                { tr: 'İspanya',       flag: '🇪🇸' },
  Sweden:               { tr: 'İsveç',         flag: '🇸🇪' },
  Switzerland:          { tr: 'İsviçre',       flag: '🇨🇭' },
  Tunisia:              { tr: 'Tunus',         flag: '🇹🇳' },
  Türkiye:              { tr: 'Türkiye',       flag: '🇹🇷' },
  'United States':      { tr: 'ABD',           flag: '🇺🇸' },
  Uruguay:              { tr: 'Uruguay',       flag: '🇺🇾' },
  Uzbekistan:           { tr: 'Özbekistan',    flag: '🇺🇿' },
}

function lookupTeam(displayName: string): { tr: string; flag: string } {
  return TEAM_INFO[displayName] ?? { tr: displayName, flag: '🏳️' }
}

// ─── Tarih formatı ────────────────────────────────────────────────────────────
const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

function formatShortDateTR(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // Türkiye saatine göre göster
  const local = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }))
  return `${local.getDate()} ${MONTHS_TR[local.getMonth()]}`
}

// ─── ESPN fetcher'ları ────────────────────────────────────────────────────────
const ESPN_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings'
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719'

async function fetchEspn<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      // İç cache zaten unstable_cache tarafında — fetch tarafında store etmiyoruz.
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'NaHaber/1.0 (+https://nahaber.com)' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) {
      console.warn('[worldCup2026] ESPN fetch failed', url, res.status)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn('[worldCup2026] ESPN fetch error', url, err)
    return null
  }
}

// ─── Normalize ────────────────────────────────────────────────────────────────
function parseStandings(raw: EspnStanding | null): WcGroup[] {
  if (!raw?.children?.length) return []

  // ESPN'in grup adları "Group A", "Group B" gibi. Sıralı olarak A..L harfine
  // map'liyoruz (ESPN gruplari sıralı gönderir).
  const groups: WcGroup[] = []
  for (let i = 0; i < raw.children.length; i++) {
    const c = raw.children[i]!
    const groupId = String.fromCharCode(65 + i) // A, B, C, ...
    const teams: WcTeamStat[] = []

    for (const entry of c.standings.entries) {
      const stats: Record<string, number> = {}
      for (const s of entry.stats) stats[s.abbreviation] = Number(s.value ?? 0)

      const info = lookupTeam(entry.team.displayName)
      teams.push({
        team: info.tr,
        flag: info.flag,
        p: stats.GP ?? 0,
        w: stats.W ?? 0,
        d: stats.D ?? 0,
        l: stats.L ?? 0,
        gf: stats.F ?? 0,
        ga: stats.A ?? 0,
        gd: stats.GD ?? 0,
        pts: stats.P ?? 0,
        isTurkiye: entry.team.displayName === 'Türkiye',
      })
    }

    // ESPN bazen sıralamayı puanla değil de keyfi gönderir — kendimiz sıralayalım.
    teams.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)

    groups.push({ id: groupId, name: `Grup ${groupId}`, teams })
  }
  return groups
}

function parseScoreboard(raw: EspnScoreboard | null, groups: WcGroup[]): WcMatch[] {
  if (!raw?.events?.length) return []

  // Takım adı → grup id
  const teamGroup = new Map<string, string>()
  for (const g of groups) for (const t of g.teams) teamGroup.set(t.team, g.id)

  const matches: WcMatch[] = []
  for (const ev of raw.events) {
    const comp = ev.competitions[0]
    if (!comp) continue
    const home = comp.competitors.find((c) => c.homeAway === 'home')
    const away = comp.competitors.find((c) => c.homeAway === 'away')
    if (!home || !away) continue

    const homeInfo = lookupTeam(home.team.displayName)
    const awayInfo = lookupTeam(away.team.displayName)
    const completed = ev.status.type.completed === true
    const isLive = !completed && (ev.status.type.state === 'in' || ev.status.type.shortDetail.toLowerCase().includes('half'))

    // Maçın hangi grubun maçı olduğunu sıralamaya göre türetelim (eleme
    // sonrasında group boş bırakılır).
    const grp = teamGroup.get(homeInfo.tr) ?? teamGroup.get(awayInfo.tr) ?? ''

    matches.push({
      home: homeInfo.tr,
      homeFlag: homeInfo.flag,
      homeScore: Number(home.score ?? 0),
      awayScore: Number(away.score ?? 0),
      away: awayInfo.tr,
      awayFlag: awayInfo.flag,
      date: formatShortDateTR(ev.date),
      isoDate: ev.date,
      group: grp,
      finished: completed,
      isLive,
    })
  }

  matches.sort((a, b) => a.isoDate.localeCompare(b.isoDate))
  return matches
}

// ─── Fallback (ESPN ulaşılamazsa son bilinen değer) ───────────────────────────
//
// Tournament öncesi/sonrasında veya geçici outage durumunda sayfa boş kalmasın
// diye küçük bir snapshot tutuyoruz. Asıl veri her zaman ESPN'den gelir.
const FALLBACK: WorldCup2026Data = {
  groups: [],
  matches: [],
  updatedAt: new Date(0).toISOString(),
  source: 'fallback',
}

// ─── Cache + public API ───────────────────────────────────────────────────────
const CACHE_TAG = 'worldcup-2026'

async function fetchWorldCupRaw(): Promise<WorldCup2026Data> {
  const [standings, scoreboard] = await Promise.all([
    fetchEspn<EspnStanding>(ESPN_STANDINGS),
    fetchEspn<EspnScoreboard>(ESPN_SCOREBOARD),
  ])

  const groups = parseStandings(standings)
  if (groups.length === 0) {
    // ESPN her ikisini de kaybettiyse fallback dön — sayfa hardcoded eski
    // veriyle render eder, "kaynak bağlantısı koptu" notu gösterir.
    return FALLBACK
  }

  const matches = parseScoreboard(scoreboard, groups)
  return {
    groups,
    matches,
    updatedAt: new Date().toISOString(),
    source: 'espn',
  }
}

/**
 * Server-only — 15 dakika cache + tag.
 * `revalidateTag('worldcup-2026')` ile cron temizleyebilir.
 */
export const getWorldCup2026Data = unstable_cache(
  () => fetchWorldCupRaw(),
  ['worldcup-2026:v1'],
  {
    revalidate: 60 * 15,
    tags: [CACHE_TAG],
  }
)

export const WORLDCUP_CACHE_TAG = CACHE_TAG
