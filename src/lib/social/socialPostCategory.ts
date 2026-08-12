/** Social post card category labels (ONYEDİTİVİ template). */
import {
  DEFAULT_CATEGORIES,
  YEREL_TO_NATIONAL_CATEGORY_MAP,
  getYerelSubcategoryShortLabel,
  type CategoryDef,
} from '@/constants/config'

export type SocialPostCategoryLabel = string

const SPORT_CATEGORY_IDS = new Set([
  'spor',
  'futbol',
  'basketbol',
  'voleybol',
  'hentbol',
  'atletizm',
  'gures',
  'yerel-spor',
  'yerel-futbol',
  'yerel-basketbol',
  'yerel-voleybol',
  'yerel-hentbol',
  'yerel-atletizm',
  'yerel-gures',
  'yerel-tenis',
  'yerel-yuzme',
  'yerel-motor-sporlari',
  'dunya-kupasi-2026',
])

/** Fixed uppercase labels for ids whose display names are long or ambiguous. */
const SOCIAL_LABEL_BY_ID: Record<string, string> = {
  asayis: 'ASAYİŞ',
  'yerel-asayis': 'ASAYİŞ',
  'emlak-konut': 'EMLAK',
  'yerel-emlak': 'EMLAK',
  'finans-piyasa': 'FİNANS',
  'yerel-finans': 'FİNANS',
  'is-kariyer': 'KARİYER',
  'yerel-kariyer': 'KARİYER',
  'cevre-iklim': 'ÇEVRE',
  'yerel-cevre-iklim': 'ÇEVRE',
  'oyun-espor': 'OYUN',
  'yerel-oyun-espor': 'OYUN',
  'din-inanc': 'DİN',
  'yerel-din-inanc': 'DİN',
  'anne-cocuk': 'ANNE',
  'kibris-haberleri': 'KIBRIS',
  'yerel-haber': 'YEREL',
}

function getCategoryById(categoryId: string): CategoryDef | undefined {
  const id = categoryId.trim().toLowerCase()
  return DEFAULT_CATEGORIES.find((c) => c.id === id || c.slug === id)
}

function toTurkishUpper(text: string): string {
  return text.trim().toLocaleUpperCase('tr-TR')
}

/** Shorten compound names, e.g. "Emlak & Konut" → "Emlak". */
function shortenCategoryName(name: string): string {
  const beforeAmp = name.split(/\s*&\s*/)[0]?.trim()
  return beforeAmp || name
}

function labelFromCategoryDef(cat: CategoryDef): string {
  const fixed = SOCIAL_LABEL_BY_ID[cat.id]
  if (fixed) return fixed
  return toTurkishUpper(shortenCategoryName(cat.name))
}

function labelFromCategoryId(categoryId: string): string | null {
  const cat = getCategoryById(categoryId)
  if (!cat) return null
  return labelFromCategoryDef(cat)
}

/**
 * Maps Firestore categoryId → uppercase social post label.
 * son-dakika / breaking → SON DAKİKA; sport family → SPOR;
 * yerel-* → mapped national or short yerel label; else category name.
 */
export function getSocialPostCategoryLabel(
  categoryId?: string | null,
  isBreaking?: boolean,
): SocialPostCategoryLabel {
  const cat = (categoryId ?? '').trim().toLowerCase()

  if (cat === 'son-dakika' || isBreaking) return 'SON DAKİKA'
  if (!cat) return 'GÜNDEM'

  if (SPORT_CATEGORY_IDS.has(cat)) return 'SPOR'

  const fixed = SOCIAL_LABEL_BY_ID[cat]
  if (fixed) return fixed

  if (cat.startsWith('yerel-')) {
    const nationalId = YEREL_TO_NATIONAL_CATEGORY_MAP[cat]
    if (nationalId) {
      if (SPORT_CATEGORY_IDS.has(nationalId)) return 'SPOR'
      const nationalLabel = labelFromCategoryId(nationalId)
      if (nationalLabel) return nationalLabel
    }
    const yerelCat = getCategoryById(cat)
    if (yerelCat) {
      return toTurkishUpper(getYerelSubcategoryShortLabel(yerelCat))
    }
  }

  const label = labelFromCategoryId(cat)
  if (label) return label

  return 'GÜNDEM'
}
