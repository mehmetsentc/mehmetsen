/**
 * Featured ("Öne Çıkan") scope helpers.
 * Local/city news pins belong on city tenant homepages, not national nahaber.com.
 */
import { isYerelCategoryTree } from '@/constants/config'

export type FeaturedScopeInput = {
  citySlug?: string | null
  categoryId?: string | null
  category?: string | null
}

/** True when a story is city/yerel-scoped (featured → city page, not national). */
export function isLocalScopedNews(input: FeaturedScopeInput): boolean {
  if (String(input.citySlug ?? '').trim()) return true
  const cat = String(input.categoryId ?? input.category ?? '').trim()
  return Boolean(cat) && isYerelCategoryTree(cat)
}

/** National homepage featured carousel candidates only. */
export function isNationalFeaturedEligible(input: FeaturedScopeInput): boolean {
  return !isLocalScopedNews(input)
}
