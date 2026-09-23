import {
  ALL_TURKISH_PRO_FOOTBALL_CLUBS,
  type TurkishFootballClubDef,
  type TurkishProLeague,
} from '@/constants/turkishFootballClubs'

export const NATIONAL_FOOTBALL_CATEGORY_ID = 'futbol' as const
export const YEREL_SPOR_TAG = 'yerel-spor' as const

export interface NationalFootballMatch {
  categoryId: typeof NATIONAL_FOOTBALL_CATEGORY_ID
  clubName: string
  league: TurkishProLeague
}

/** Lowercase + strip diacritics for fuzzy Turkish club name matching. */
export function normalizeFootballMatchText(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function clubTokens(club: TurkishFootballClubDef): string[] {
  const tokens = new Set<string>([
    normalizeFootballMatchText(club.name),
    ...(club.aliases ?? []).map((a) => normalizeFootballMatchText(a)),
  ])
  return [...tokens].filter((t) => t.length >= 3)
}

function textIncludesClubToken(normalizedText: string, token: string): boolean {
  if (token.length < 3) return false
  // Word-start match: "besiktas in avrupa" / "besiktas avrupa"
  const pattern = new RegExp(`(?:^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i')
  return pattern.test(` ${normalizedText} `)
}

/** Hatayspor / Konyaspor / Adana Demir — kulüp adı, şehir değil. */
function isOfficialClubToken(token: string, club: TurkishFootballClubDef): boolean {
  const official = normalizeFootballMatchText(club.name)
  if (token === official) return true
  return /spor$| fk$| sk$|gucu$|birligi$|demir/.test(token)
}

/**
 * City/nickname aliases ("hatay", "konya", "kartal") are not enough on their own.
 * Otherwise every Hatay asayiş / Konya belediye story becomes futbol.
 */
const FOOTBALL_CONTEXT_RE =
  /\b(futbol|super ?lig|trendyol|tff|uefa|fifa|maci?|goller?|penalti|kaleci|forvet|teknik direktor|stadyum|derbi|deplasman|kadro|puan durumu|hakem|kirmizi kart|sari kart|sampiyonlar|forma|skor|ofsayt|offside)\b/

export function hasFootballContext(text: string): boolean {
  const normalized = normalizeFootballMatchText(text)
  if (normalized && FOOTBALL_CONTEXT_RE.test(` ${normalized} `)) return true
  return /\d+\s*[-–:]\s*\d+/.test(text)
}

/**
 * Detect Süper Lig or Trendyol 1. Lig club mention in title/summary/body.
 * Returns national futbol routing when a professional club is referenced.
 */
export function detectNationalFootballClub(text: string): NationalFootballMatch | null {
  const normalized = normalizeFootballMatchText(text)
  if (!normalized) return null
  const footballContext = hasFootballContext(text)

  for (const club of ALL_TURKISH_PRO_FOOTBALL_CLUBS) {
    for (const token of clubTokens(club)) {
      if (!textIncludesClubToken(normalized, token)) continue
      if (!isOfficialClubToken(token, club) && !footballContext) continue
      return {
        categoryId: NATIONAL_FOOTBALL_CATEGORY_ID,
        clubName: club.name,
        league: club.league,
      }
    }
  }

  return null
}

/** Merge yerel-spor tag without duplicates. */
export function mergeNationalFootballTags(existingTags: string[] | undefined): string[] {
  const tags = [...(existingTags ?? [])]
  const hasYerelSpor = tags.some(
    (t) => normalizeFootballMatchText(t) === normalizeFootballMatchText(YEREL_SPOR_TAG)
  )
  if (!hasYerelSpor) tags.push(YEREL_SPOR_TAG)
  return tags
}

/**
 * Yerel kaynak + profesyonel lig kulübü → ulusal futbol kategorisi korunur,
 * citySlug ile şehir spor feed'inde de görünür.
 */
export function resolveNationalFootballLocalRouting(
  text: string,
  citySlug?: string | null,
  articleIsAbroad = false,
): NationalFootballMatch | null {
  if (articleIsAbroad || !citySlug?.trim()) return null
  return detectNationalFootballClub(text)
}
