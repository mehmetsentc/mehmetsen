/** Social post card category labels (ONYEDİTİVİ template). */
export type SocialPostCategoryLabel = 'SON DAKİKA' | 'GÜNDEM' | 'SPOR'

const SPORT_CATEGORY_IDS = new Set([
  'spor',
  'futbol',
  'basketbol',
  'voleybol',
  'hentbol',
  'atletizm',
  'gures',
])

/**
 * Maps Firestore categoryId → uppercase social post label.
 * son-dakika / breaking → SON DAKİKA; sport family → SPOR; else GÜNDEM.
 */
export function getSocialPostCategoryLabel(
  categoryId?: string | null,
  isBreaking?: boolean,
): SocialPostCategoryLabel {
  const cat = (categoryId ?? '').trim().toLowerCase()
  if (cat === 'son-dakika' || isBreaking) return 'SON DAKİKA'
  if (SPORT_CATEGORY_IDS.has(cat)) return 'SPOR'
  return 'GÜNDEM'
}
