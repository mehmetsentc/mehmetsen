/**
 * Transfermarkt API Client — TypeScript
 *
 * R karşılıkları:
 *   httr2::request()     → fetch()
 *   tryCatch()           → try/catch
 *   purrr::map()         → Array.map() / Promise.all()
 *   tibble / data.frame  → TypeScript interface[]
 *   Sys.sleep()          → sleep()
 *   DRY fonksiyonlar     → aynı prensip
 */

// ── Sabitler (R'daki TM_BASE_URL, TM_API_KEY) ────────────────────────────────
const TM_BASE  = 'https://transfermarkt-db.p.rapidapi.com/v1'
const API_KEY  = process.env.RAPIDAPI_KEY ?? ''
const API_HOST = process.env.RAPIDAPI_HOST ?? 'transfermarkt-db.p.rapidapi.com'

// Süper Lig kulüp ID'leri — merkezi tanım (DRY)
export const SUPER_LIG_CLUBS: Record<string, string> = {
  Galatasaray:   '141',
  Fenerbahçe:    '631',
  Beşiktaş:      '985',
  Trabzonspor:   '449',
  Başakşehir:    '6890',
  Sivasspor:     '2010',
  Kasımpaşa:     '4751',
  Antalyaspor:   '589',
}

const SUPER_LIG_ID   = 'TR1'
const CURRENT_SEASON = '2024'

// ── TypeScript Tipleri (R'daki interface / tibble kolonları) ──────────────────

export interface TmPlayer {
  id:           string
  name:         string
  position:     string
  age:          number
  nationality:  string
  marketValue:  number      // EUR
  marketValueM: number      // milyon EUR
  shirtNumber:  number | null
  imageUrl:     string
  posGroup:     'Kaleci' | 'Defans' | 'Orta Saha' | 'Forvet'
}

export interface TmSquad {
  clubId:   string
  clubName: string
  season:   string
  players:  TmPlayer[]
  totalValueM: number
}

export interface TmTransfer {
  id:          string
  playerName:  string
  playerImage: string
  fromClub:    string
  toClub:      string
  fee:         number | null
  feeLabel:    string
  date:        string
  season:      string
}

export interface TmStanding {
  rank:     number
  clubId:   string
  clubName: string
  clubLogo: string
  played:   number
  won:      number
  drawn:    number
  lost:     number
  gf:       number
  ga:       number
  gd:       number
  points:   number
}

// ── Yardımcı: R'daki Sys.sleep() karşılığı ───────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Temel istek fonksiyonu (R'daki tm_get + guvenli_cek birleşimi) ────────────
async function tmGet<T = unknown>(
  endpoint: string,
  params: Record<string, string> = {},
  retries = 2
): Promise<T | null> {

  if (!API_KEY) {
    console.warn('[TM] RAPIDAPI_KEY tanımlı değil')
    return null
  }

  // URL + query parametreleri (R'daki req_url_query)
  const url = new URL(`${TM_BASE}${endpoint}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  // tryCatch karşılığı: try/catch
  try {
    const res = await fetch(url.toString(), {
      headers: {
        'x-rapidapi-key':  API_KEY,
        'x-rapidapi-host': API_HOST,
      },
      next: { revalidate: 1800 },   // 30 dk cache
    })

    // HTTP hata yönetimi (R'daki httr2_http handler)
    if (res.status === 429 && retries > 0) {
      console.warn('[TM] Rate limit — 10s bekleniyor...')
      await sleep(10_000)
      return tmGet<T>(endpoint, params, retries - 1)
    }

    if (!res.ok) {
      console.error(`[TM] HTTP ${res.status} — ${endpoint}`)
      return null
    }

    const data = await res.json() as { data?: T }

    // Boş veri kontrolü (R'daki NULL kontrolü)
    if (!data?.data) {
      console.warn('[TM] Boş veri:', endpoint)
      return null
    }

    return data.data as T

  } catch (err) {
    // Ağ/parse hatası (R'daki httr2_failure + genel error handler)
    console.error('[TM] Hata:', err instanceof Error ? err.message : err)
    return null
  }
}

// ── Veri dönüştürme (R'daki oyuncu_listesini_duzenle fonksiyonu) ──────────────

function pozisyonGrubu(pos: string): TmPlayer['posGroup'] {
  // R'daki case_when() karşılığı
  if (pos.includes('Goalkeeper'))           return 'Kaleci'
  if (/Back|Wing-Back|Centre-Back/.test(pos)) return 'Defans'
  if (/Midfield/.test(pos))                 return 'Orta Saha'
  return 'Forvet'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function oyuncuDonustur(raw: any): TmPlayer {
  const deger = Number(raw?.marketValue?.value ?? 0)
  return {
    id:           String(raw?.id ?? ''),
    name:         String(raw?.name ?? ''),
    position:     String(raw?.position ?? ''),
    age:          Number(raw?.age ?? 0),
    nationality:  String(raw?.nationality ?? ''),
    marketValue:  deger,
    marketValueM: Math.round(deger / 1e5) / 10,  // 1 ondalık
    shirtNumber:  raw?.shirtNumber ? Number(raw.shirtNumber) : null,
    imageUrl:     String(raw?.imageUrl ?? ''),
    posGroup:     pozisyonGrubu(String(raw?.position ?? '')),
  }
}

// ── Katmanlı fonksiyonlar (R'daki kadro_cek → kadro_isle → klub_kadrosu) ──────

/** Katman 1: Ham veri */
async function kadroHamCek(klubId: string, sezon = CURRENT_SEASON) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tmGet<any[]>('/clubs/squad', { club_id: klubId, season: sezon, locale: 'TR' })
}

/** Katman 2: Ham → Temiz */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function kadroIsle(ham: any[] | null): TmPlayer[] {
  if (!ham) return []
  return ham
    .map(oyuncuDonustur)
    .sort((a, b) => b.marketValue - a.marketValue)   // R'daki arrange(desc(piyasa_m))
}

/** Katman 3: Herkese açık API — tek kulüp kadrosu */
export async function klubKadrosu(klubId: string, sezon = CURRENT_SEASON): Promise<TmSquad | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clubInfo = await tmGet<any>('/clubs/profile', { club_id: klubId, locale: 'TR' })
  const ham      = await kadroHamCek(klubId, sezon)
  const players  = kadroIsle(ham)

  if (players.length === 0) return null

  return {
    clubId:      klubId,
    clubName:    String(clubInfo?.name ?? klubId),
    season:      sezon,
    players,
    totalValueM: players.reduce((s, p) => s + p.marketValueM, 0),
  }
}

// ── Hiyerarşik toplama (R'daki lig_tum_kadrolar) ─────────────────────────────
/**
 * Birden fazla kulübü sırayla çek (rate limit'e saygı için).
 * R'daki: map(BSBK_KULUPLER, ~ { Sys.sleep(0.8); klub_kadrosu(.x) })
 */
export async function cokluKadro(
  klubIdler: string[],
  sezon = CURRENT_SEASON
): Promise<TmSquad[]> {

  const sonuclar: TmSquad[] = []

  // for döngüsü — R'daki for (i in seq_along(klub_idleri))
  for (const klubId of klubIdler) {
    const kadro = await klubKadrosu(klubId, sezon)
    if (kadro) sonuclar.push(kadro)
    await sleep(800)    // R'daki Sys.sleep(0.8)
  }

  return sonuclar
}

/** Süper Lig puan tablosu */
export async function superLigTablosu(sezon = CURRENT_SEASON): Promise<TmStanding[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await tmGet<any[]>('/competitions/standings', {
    competition_id: SUPER_LIG_ID,
    season: sezon,
  })
  if (!raw) return []

  // R'daki map_dfr() karşılığı
  return raw.map((r, i) => ({
    rank:     i + 1,
    clubId:   String(r?.id ?? ''),
    clubName: String(r?.name ?? ''),
    clubLogo: String(r?.imageUrl ?? ''),
    played:   Number(r?.matches ?? 0),
    won:      Number(r?.wins ?? 0),
    drawn:    Number(r?.draws ?? 0),
    lost:     Number(r?.losses ?? 0),
    gf:       Number(r?.goals ?? 0),
    ga:       Number(r?.goalsAgainst ?? 0),
    gd:       Number(r?.goals ?? 0) - Number(r?.goalsAgainst ?? 0),
    points:   Number(r?.points ?? 0),
  }))
}

/** Son transferler */
export async function sonTransferler(sezon = CURRENT_SEASON): Promise<TmTransfer[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await tmGet<any[]>('/competitions/transfers', {
    competition_id: SUPER_LIG_ID,
    season: sezon,
  })
  if (!raw) return []

  // while döngüsü yerine slice (sayfalama tek çağrıda yeterliyse)
  return raw.slice(0, 20).map(t => ({
    id:          String(t?.id ?? Math.random()),
    playerName:  String(t?.playerName ?? ''),
    playerImage: String(t?.playerImage ?? ''),
    fromClub:    String(t?.fromClub?.name ?? ''),
    toClub:      String(t?.toClub?.name ?? ''),
    fee:         t?.fee ? Number(t.fee) : null,
    feeLabel:    t?.feeLabel ? String(t.feeLabel) : 'Bilinmiyor',
    date:        String(t?.date ?? ''),
    season:      sezon,
  }))
}
