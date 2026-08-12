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
}

/** Trendyol Süper Lig — 2025-26 sezonu */
export const SUPER_LIG_CLUBS: readonly TurkishFootballClubDef[] = [
  { name: 'Galatasaray', league: 'super-lig', aliases: ['gala', 'cimbom'] },
  { name: 'Fenerbahçe', league: 'super-lig', aliases: ['fener'] },
  { name: 'Beşiktaş', league: 'super-lig', aliases: ['besiktas', 'kartal'] },
  { name: 'Trabzonspor', league: 'super-lig', aliases: ['trabzon', 'bordo mavi'] },
  { name: 'Başakşehir', league: 'super-lig', aliases: ['basaksehir', 'istanbul basaksehir'] },
  { name: 'Alanyaspor', league: 'super-lig', aliases: ['alanya'] },
  { name: 'Antalyaspor', league: 'super-lig', aliases: ['antalya'] },
  { name: 'Bodrum FK', league: 'super-lig', aliases: ['bodrum', 'bb bodrumspor'] },
  { name: 'Çaykur Rizespor', league: 'super-lig', aliases: ['rizespor', 'rize'] },
  { name: 'Eyüpspor', league: 'super-lig', aliases: ['eyupspor', 'eyup'] },
  { name: 'Gaziantep FK', league: 'super-lig', aliases: ['gaziantep', 'gaziantepspor'] },
  { name: 'Göztepe', league: 'super-lig', aliases: ['goztepe', 'izmir goztepe'] },
  { name: 'Hatayspor', league: 'super-lig', aliases: ['hatay'] },
  { name: 'Kasımpaşa', league: 'super-lig', aliases: ['kasimpasa'] },
  { name: 'Kayserispor', league: 'super-lig', aliases: ['kayseri'] },
  { name: 'Konyaspor', league: 'super-lig', aliases: ['konya'] },
  { name: 'Samsunspor', league: 'super-lig', aliases: ['samsun'] },
  { name: 'Sivasspor', league: 'super-lig', aliases: ['sivas'] },
] as const

/** Trendyol 1. Lig — 2025-26 sezonu */
export const TFF_1_LIG_CLUBS: readonly TurkishFootballClubDef[] = [
  { name: 'Adana Demirspor', league: 'tff-1-lig', aliases: ['adana demir'] },
  { name: 'Adanaspor', league: 'tff-1-lig', aliases: ['adana'] },
  { name: 'Amed SK', league: 'tff-1-lig', aliases: ['amedspor', 'diyarbakir'] },
  { name: 'Bandırmaspor', league: 'tff-1-lig', aliases: ['bandirma'] },
  { name: 'Boluspor', league: 'tff-1-lig', aliases: ['bolu'] },
  { name: 'Çorum FK', league: 'tff-1-lig', aliases: ['corum'] },
  { name: 'Erzurumspor FK', league: 'tff-1-lig', aliases: ['erzurumspor', 'erzurum'] },
  { name: 'Gençlerbirliği', league: 'tff-1-lig', aliases: ['genclerbirligi', 'gencler'] },
  { name: 'Iğdır FK', league: 'tff-1-lig', aliases: ['igdir'] },
  { name: 'Keçiörengücü', league: 'tff-1-lig', aliases: ['keciorengucu', 'ankara keciorengucu'] },
  { name: 'Manisa FK', league: 'tff-1-lig', aliases: ['manisa', 'manisaspor'] },
  { name: 'Pendikspor', league: 'tff-1-lig', aliases: ['pendik'] },
  { name: 'Sakaryaspor', league: 'tff-1-lig', aliases: ['sakarya'] },
  { name: 'Sarıyerspor', league: 'tff-1-lig', aliases: ['sariyer'] },
  { name: 'Şanlıurfaspor', league: 'tff-1-lig', aliases: ['sanliurfaspor', 'sanliurfa'] },
  { name: 'Ümraniyespor', league: 'tff-1-lig', aliases: ['umraniyespor', 'umraniye'] },
  { name: 'Altay', league: 'tff-1-lig', aliases: ['altay izmir'] },
  { name: 'Bursaspor', league: 'tff-1-lig', aliases: ['bursa'] },
  { name: 'Giresunspor', league: 'tff-1-lig', aliases: ['giresun'] },
  { name: 'Kocaelispor', league: 'tff-1-lig', aliases: ['kocaeli', 'izmit'] },
  { name: 'Menemen FK', league: 'tff-1-lig', aliases: ['menemen'] },
] as const

/** Tüm profesyonel lig kulüpleri — Süper Lig önce (daha spesifik eşleşme). */
export const ALL_TURKISH_PRO_FOOTBALL_CLUBS: readonly TurkishFootballClubDef[] = [
  ...SUPER_LIG_CLUBS,
  ...TFF_1_LIG_CLUBS.filter(
    (c) => !SUPER_LIG_CLUBS.some((s) => s.name === c.name)
  ),
]
