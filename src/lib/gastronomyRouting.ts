/**
 * Gastronomi routing policy:
 * - Never homepage hero / öne çıkan / güncel (latest/breaking/trending) main slots
 * - Never geo-own a city's primary yerel feed via citySlug
 * - National `/kategori/gastronomi` (and optional local strip) is the shared feed
 */

export const GASTRONOMI_CATEGORY_ID = 'gastronomi'
export const YEREL_GASTRONOMI_CATEGORY_ID = 'yerel-gastronomi'

/** National gastronomi (+ recipe-like aliases). */
const NATIONAL_GASTRONOMY_CATEGORIES = new Set([
  GASTRONOMI_CATEGORY_ID,
  'yemek',
  'tarif',
  'food',
])

function normalizeCategory(categoryId?: string | null): string {
  return String(categoryId ?? '')
    .trim()
    .toLowerCase()
}

/** True for national gastronomi category (not yerel-gastronomi). */
export function isNationalGastronomyCategory(categoryId?: string | null): boolean {
  return NATIONAL_GASTRONOMY_CATEGORIES.has(normalizeCategory(categoryId))
}

/**
 * Must not appear as a city's primary yerel haber (citySlug query).
 * National gastronomi is shared across all cities — never city-owned.
 */
export function isExcludedFromCityLocalPrimaryFeed(categoryId?: string | null): boolean {
  return isNationalGastronomyCategory(categoryId)
}

/**
 * Must not fill homepage manşet / öne çıkan / güncel-style main buckets.
 * Category rail `/kategori/gastronomi` remains allowed.
 */
export function isExcludedFromHomepageMainSlots(categoryId?: string | null): boolean {
  const cat = normalizeCategory(categoryId)
  return isNationalGastronomyCategory(cat) || cat === YEREL_GASTRONOMI_CATEGORY_ID
}

/** Pipeline: keep gastronomi national — no citySlug / no yerel remap. */
export function shouldStripCityForGastronomy(categoryId?: string | null): boolean {
  return isNationalGastronomyCategory(categoryId)
}

/** Never remap gastronomi → yerel-gastronomi via city-in-title heuristics. */
export function shouldSkipLocalPrimaryRemapForGastronomy(categoryId?: string | null): boolean {
  return isNationalGastronomyCategory(categoryId)
}
