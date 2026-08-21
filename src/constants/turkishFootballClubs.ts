/**
 * Süper Lig + Trendyol 1. Lig kulüp listesi.
 * Yerel kaynaklı profesyonel lig haberlerini ulusal futbol/spor feed'lerine yönlendirmek için.
 *
 * Güncelleme: sezon değişiminde listeyi güncelle; alias'lar eşleşmeyi güçlendirir.
 */

export type TurkishProLeague = 'super-lig' | 'tff-1-lig'

export interface TurkishFootballClubDef {
  /** Canonical display name */
  name: string
  /** Extra match tokens (normalized lowercase, no diacritics) */
  aliases?: string[]
  league: TurkishProLeague
  /** Home province slug — location contradiction checks (never invent from opponent). */
  provinceSlug?: string
}

/** Trendyol Süper Lig — 2025-26 sezonu */
export const SUPER_LIG_CLUBS: readonly TurkishFootballClubDef[] = [
  { name: 'Galatasaray', league: 'super-lig', aliases: ['gala', 'cimbom'], provinceSlug: 'istanbul' },
  { name: 'Fenerbahçe', league: 'super-lig', aliases: ['fener'], provinceSlug: 'istanbul' },
  { name: 'Beşiktaş', league: 'super-lig', aliases: ['besiktas', 'kartal'], provinceSlug: 'istanbul' },
  { name: 'Trabzonspor', league: 'super-lig', aliases: ['trabzon', 'bordo mavi'], provinceSlug: 'trabzon' },
  { name: 'Başakşehir', league: 'super-lig', aliases: ['basaksehir', 'istanbul basaksehir'], provinceSlug: 'istanbul' },
  { name: 'Alanyaspor', league: 'super-lig', aliases: ['alanya'], provinceSlug: 'antalya' },
  { name: 'Antalyaspor', league: 'super-lig', aliases: ['antalya'], provinceSlug: 'antalya' },
  { name: 'Bodrum FK', league: 'super-lig', aliases: ['bodrum', 'bb bodrumspor'], provinceSlug: 'mugla' },
  { name: 'Çaykur Rizespor', league: 'super-lig', aliases: ['rizespor', 'rize'], provinceSlug: 'rize' },
  { name: 'Eyüpspor', league: 'super-lig', aliases: ['eyupspor', 'eyup'], provinceSlug: 'istanbul' },
  { name: 'Gaziantep FK', league: 'super-lig', aliases: ['gaziantep', 'gaziantepspor'], provinceSlug: 'gaziantep' },
  { name: 'Göztepe', league: 'super-lig', aliases: ['goztepe', 'izmir goztepe'], provinceSlug: 'izmir' },
  { name: 'Hatayspor', league: 'super-lig', aliases: ['hatay'], provinceSlug: 'hatay' },
  { name: 'Kasımpaşa', league: 'super-lig', aliases: ['kasimpasa'], provinceSlug: 'istanbul' },
  { name: 'Kayserispor', league: 'super-lig', aliases: ['kayseri'], provinceSlug: 'kayseri' },
  { name: 'Konyaspor', league: 'super-lig', aliases: ['konya'], provinceSlug: 'konya' },
  { name: 'Samsunspor', league: 'super-lig', aliases: ['samsun'], provinceSlug: 'samsun' },
  { name: 'Sivasspor', league: 'super-lig', aliases: ['sivas'], provinceSlug: 'sivas' },
] as const

/** Trendyol 1. Lig — 2025-26 sezonu */
export const TFF_1_LIG_CLUBS: readonly TurkishFootballClubDef[] = [
  { name: 'Adana Demirspor', league: 'tff-1-lig', aliases: ['adana demir'], provinceSlug: 'adana' },
  { name: 'Adanaspor', league: 'tff-1-lig', aliases: ['adana'], provinceSlug: 'adana' },
  { name: 'Amed SK', league: 'tff-1-lig', aliases: ['amedspor', 'diyarbakir'], provinceSlug: 'diyarbakir' },
  { name: 'Bandırmaspor', league: 'tff-1-lig', aliases: ['bandirma'], provinceSlug: 'balikesir' },
  { name: 'Boluspor', league: 'tff-1-lig', aliases: ['bolu'], provinceSlug: 'bolu' },
  { name: 'Çorum FK', league: 'tff-1-lig', aliases: ['corum'], provinceSlug: 'corum' },
  { name: 'Erzurumspor FK', league: 'tff-1-lig', aliases: ['erzurumspor', 'erzurum'], provinceSlug: 'erzurum' },
  { name: 'Gençlerbirliği', league: 'tff-1-lig', aliases: ['genclerbirligi', 'gencler'], provinceSlug: 'ankara' },
  { name: 'Iğdır FK', league: 'tff-1-lig', aliases: ['igdir'], provinceSlug: 'igdir' },
  { name: 'Keçiörengücü', league: 'tff-1-lig', aliases: ['keciorengucu', 'ankara keciorengucu'], provinceSlug: 'ankara' },
  { name: 'Manisa FK', league: 'tff-1-lig', aliases: ['manisa', 'manisaspor'], provinceSlug: 'manisa' },
  { name: 'Pendikspor', league: 'tff-1-lig', aliases: ['pendik'], provinceSlug: 'istanbul' },
  { name: 'Sakaryaspor', league: 'tff-1-lig', aliases: ['sakarya'], provinceSlug: 'sakarya' },
  { name: 'Sarıyerspor', league: 'tff-1-lig', aliases: ['sariyer'], provinceSlug: 'istanbul' },
  { name: 'Şanlıurfaspor', league: 'tff-1-lig', aliases: ['sanliurfaspor', 'sanliurfa'], provinceSlug: 'sanliurfa' },
  { name: 'Ümraniyespor', league: 'tff-1-lig', aliases: ['umraniyespor', 'umraniye'], provinceSlug: 'istanbul' },
  { name: 'Altay', league: 'tff-1-lig', aliases: ['altay izmir'], provinceSlug: 'izmir' },
  { name: 'Bursaspor', league: 'tff-1-lig', aliases: ['bursa'], provinceSlug: 'bursa' },
  { name: 'Giresunspor', league: 'tff-1-lig', aliases: ['giresun'], provinceSlug: 'giresun' },
  { name: 'Kocaelispor', league: 'tff-1-lig', aliases: ['kocaeli', 'izmit'], provinceSlug: 'kocaeli' },
  { name: 'Menemen FK', league: 'tff-1-lig', aliases: ['menemen'], provinceSlug: 'izmir' },
] as const

/** Tüm profesyonel lig kulüpleri — Süper Lig önce (daha spesifik eşleşme). */
export const ALL_TURKISH_PRO_FOOTBALL_CLUBS: readonly TurkishFootballClubDef[] = [
  ...SUPER_LIG_CLUBS,
  ...TFF_1_LIG_CLUBS.filter(
    (c) => !SUPER_LIG_CLUBS.some((s) => s.name === c.name)
  ),
]
