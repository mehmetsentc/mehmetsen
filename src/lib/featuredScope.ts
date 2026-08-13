/**
 * Featured ("Öne Çıkan") scope helpers.
 *
 * Location (citySlug) alone does NOT make a story local-only — every article
 * may carry a city. Only the Yerel Haber category tree scopes pins to city
 * tenant homepages; national categories stay on nahaber.com even with a city.
 *
 * Gastronomi never enters homepage / city Öne Çıkan (manşet) slots.
 */
import { isYerelCategoryTree } from '@/constants/config'
import { isExcludedFromHomepageMainSlots } from '@/lib/gastronomyRouting'

export type FeaturedScopeInput = {
  citySlug?: string | null
  categoryId?: string | null
  category?: string | null
}

function resolveCategoryId(input: FeaturedScopeInput): string {
  return String(input.categoryId ?? input.category ?? '').trim()
}

/**
 * True when a story is Yerel-category-scoped (featured → city page only).
 * citySlug is ignored for this decision — it only identifies which city page.
 */
export function isLocalScopedNews(input: FeaturedScopeInput): boolean {
  const cat = resolveCategoryId(input)
  return Boolean(cat) && isYerelCategoryTree(cat)
}

/** National homepage featured carousel candidates (non-yerel, non-gastronomi). */
export function isNationalFeaturedEligible(input: FeaturedScopeInput): boolean {
  if (isExcludedFromHomepageMainSlots(resolveCategoryId(input))) return false
  return !isLocalScopedNews(input)
}

/**
 * City tenant Öne Çıkan: yerel category tree + matching citySlug.
 * National-category stories with a city stay on the national carousel.
 * Gastronomi never pins as city manşet.
 */
export function isCityFeaturedEligible(
  input: FeaturedScopeInput & { forCitySlug: string }
): boolean {
  if (isExcludedFromHomepageMainSlots(resolveCategoryId(input))) return false
  const forCity = String(input.forCitySlug ?? '').trim().toLowerCase()
  const itemCity = String(input.citySlug ?? '').trim().toLowerCase()
  if (!forCity || itemCity !== forCity) return false
  return isLocalScopedNews(input)
}
