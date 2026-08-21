/**
 * Lifestyle / tech / industry verticals that must NEVER become Yerel Haber
 * (or yerel-* subcategories). Deterministic post-validate for pipeline + CMS.
 */
import {
  getNationalCategoryForYerelSubcategory,
  isYerelCategoryTree,
  YEREL_HABER_CATEGORY_ID,
} from '@/constants/config'

/** National category ids that are never "yerel-*". */
export const NEVER_LOCAL_NATIONAL_IDS = [
  'otomobil',
  'gastronomi',
  'saglik',
  'yasam',
  'teknoloji',
  'magazin',
  'moda',
  'astroloji',
  'anne-cocuk',
  'dekorasyon',
  'iliskiler',
  'oyun-espor',
  'bilim',
  'sinema',
  'tiyatro',
  'konser',
  'festival',
] as const

export type NeverLocalNationalId = (typeof NEVER_LOCAL_NATIONAL_IDS)[number]

const NEVER_LOCAL_NATIONAL = new Set<string>(NEVER_LOCAL_NATIONAL_IDS)

/** Yerel mirror ids that must be demoted to national (config taxonomy). */
const NEVER_LOCAL_YEREL = new Set<string>([
  'yerel-otomobil',
  'yerel-gastronomi',
  'yerel-saglik',
  'yerel-yasam',
  'yerel-teknoloji',
  'yerel-magazin',
  'yerel-bilim',
  'yerel-sinema',
  'yerel-tiyatro',
  'yerel-konser',
  'yerel-festival',
  'yerel-oyun-espor',
])

const ALIAS_TO_NATIONAL: Record<string, string> = {
  yemek: 'gastronomi',
  tarif: 'gastronomi',
  food: 'gastronomi',
  automobile: 'otomobil',
  car: 'otomobil',
  technology: 'teknoloji',
  health: 'saglik',
  lifestyle: 'yasam',
}

export function isNeverLocalNationalCategory(categoryId?: string | null): boolean {
  const cat = normalizeCat(categoryId)
  if (!cat) return false
  if (NEVER_LOCAL_NATIONAL.has(cat)) return true
  if (ALIAS_TO_NATIONAL[cat]) return true
  return false
}

export function isNeverLocalYerelCategory(categoryId?: string | null): boolean {
  const cat = normalizeCat(categoryId)
  if (!cat) return false
  if (NEVER_LOCAL_YEREL.has(cat)) return true
  const national = getNationalCategoryForYerelSubcategory(cat)
  return national != null && NEVER_LOCAL_NATIONAL.has(national)
}

/** True when category (national or yerel-*) is a never-local vertical. */
export function isNeverLocalVertical(categoryId?: string | null): boolean {
  return isNeverLocalNationalCategory(categoryId) || isNeverLocalYerelCategory(categoryId)
}

/**
 * Rewrite yerel-otomobil / yerel-teknoloji / … → national otomobil / teknoloji.
 * Leaves genuine local civic categories (yerel-asayis, yerel-siyaset, …) alone.
 */
export function demoteNeverLocalVertical(categoryId?: string | null): {
  categoryId: string
  demoted: boolean
  reason?: string
} {
  const cat = normalizeCat(categoryId)
  if (!cat) return { categoryId: '', demoted: false }

  if (ALIAS_TO_NATIONAL[cat]) {
    return {
      categoryId: ALIAS_TO_NATIONAL[cat],
      demoted: true,
      reason: `alias → ${ALIAS_TO_NATIONAL[cat]}`,
    }
  }

  if (NEVER_LOCAL_NATIONAL.has(cat)) {
    return { categoryId: cat, demoted: false }
  }

  if (isNeverLocalYerelCategory(cat)) {
    const national =
      getNationalCategoryForYerelSubcategory(cat) ||
      cat.replace(/^yerel-/, '')
    const resolved = NEVER_LOCAL_NATIONAL.has(national)
      ? national
      : ALIAS_TO_NATIONAL[national] || national
    return {
      categoryId: resolved,
      demoted: true,
      reason: `${cat} → ${resolved} (never-local vertical)`,
    }
  }

  // yerel-haber + will be refined elsewhere; callers use keyword demote
  return { categoryId: cat, demoted: false }
}

/**
 * National lifestyle/tech desks must not carry invented TR city.
 * City is only kept when caller already verified explicit place evidence
 * (pass keepCity=true). Default: clear geo for these verticals.
 */
export function shouldClearCityForNeverLocalVertical(
  categoryId?: string | null,
  opts?: { keepCityIfEvidenced?: boolean; hasExplicitPlaceEvidence?: boolean },
): boolean {
  if (!isNeverLocalVertical(categoryId) && !isNeverLocalNationalCategory(categoryId)) {
    return false
  }
  if (opts?.keepCityIfEvidenced && opts.hasExplicitPlaceEvidence) {
    // Gastronomi / tech with a real "Kadıköy'de açılış" — city optional if evidenced
    return false
  }
  // Default: strip city for industry/brand/TV/lifestyle without local civic scope
  return true
}

/** Categories that must not receive CMS suggestedCitySlug from weak district tokens. */
export function shouldStripSuggestedCityForCategory(categoryId?: string | null): boolean {
  const cat = normalizeCat(categoryId)
  if (!cat) return false
  if (cat === 'dunya' || cat === YEREL_HABER_CATEGORY_ID) return cat === 'dunya'
  if (isYerelCategoryTree(cat) && !isNeverLocalYerelCategory(cat)) return false
  return isNeverLocalNationalCategory(cat) || isNeverLocalVertical(cat)
}

function normalizeCat(categoryId?: string | null): string {
  return String(categoryId ?? '')
    .trim()
    .toLowerCase()
}

/** Short rule block for AI prompts / Talimatlar. */
export const NEVER_LOCAL_VERTICAL_PROMPT_RULE = `
KESİN — YAŞAM / TEKNOLOJİ / SEKTÖR DİKEYLERİ ASLA YEREL DEĞİL:
- otomobil, gastronomi, sağlık, yaşam, teknoloji, magazin, moda, bilim, sinema/tiyatro/konser/festival, oyun-espor
  → ULUSAL kategori (otomobil, gastronomi, saglik, yasam, teknoloji, …). ASLA yerel-otomobil / yerel-teknoloji / yerel-saglik vb.
- Marka / sektör / TV / ulusal spor / dünya teknoloji (Apple, OpenAI, Honda, MasterChef) → city=null (TR il uydurma YASAK).
- city/district YALNIZCA metinde açık yerel olay kanıtı varsa ("Kadıköy'de restoran açıldı", "Bingöl'ün Genç ilçesinde…").
- "orta", "genç", "keskin" günlük kelimeler → Çankırı/Orta, Bingöl/Genç, Kırıkkale/Keskin DEĞİL (ilçe + il adı şart).
- Yerel Haber SADECE: belediye / valilik / kaymakam / ilçe olayı / yerel kaza / duyuru — metinde kanıtlı TR il/ilçe.
`.trim()
