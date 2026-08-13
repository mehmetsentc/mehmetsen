/**
 * Featured ("Öne Çıkan") scope helpers.
 *
 * Location (citySlug) alone does NOT make a story local-only — every article
 * may carry a city. Only the Yerel Haber category tree scopes pins to city
 * tenant homepages; national categories stay on nahaber.com even with a city.
 */
import { isYerelCategoryTree } from '@/constants/config'

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

/** National homepage featured carousel candidates (non-yerel categories). */
export function isNationalFeaturedEligible(input: FeaturedScopeInput): boolean {
  return !isLocalScopedNews(input)
}

/**
 * City tenant Öne Çıkan: yerel category tree + matching citySlug.
 * National-category stories with a city stay on the national carousel.
 */
export function isCityFeaturedEligible(
  input: FeaturedScopeInput & { forCitySlug: string }
): boolean {
  const forCity = String(input.forCitySlug ?? '').trim().toLowerCase()
  const itemCity = String(input.citySlug ?? '').trim().toLowerCase()
  if (!forCity || itemCity !== forCity) return false
  return isLocalScopedNews(input)
}
