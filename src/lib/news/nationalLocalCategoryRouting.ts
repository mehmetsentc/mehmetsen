import {
  YEREL_HABER_CATEGORY_ID,
  YEREL_TO_NATIONAL_CATEGORY_MAP,
  isYerelCategoryTree,
  mapNationalCategoryToYerelSubcategory,
  shouldLocalizeCategory,
} from '@/constants/config'

export interface NationalLocalDualRouting {
  nationalCategoryId: string
  yerelTag: string
}

/** Merge yerel subcategory tag without duplicates (case-insensitive). */
export function mergeNationalLocalTags(
  existingTags: string[] | undefined,
  yerelTag: string,
): string[] {
  const tags = [...(existingTags ?? [])]
  const normalized = yerelTag.trim().toLowerCase()
  if (!normalized) return tags
  const hasTag = tags.some((t) => t.trim().toLowerCase() === normalized)
  if (!hasTag) tags.push(yerelTag)
  return tags
}

/**
 * Yerel kaynak + eşleşen ulusal kategori → ulusal categoryId korunur,
 * citySlug ile şehir feed'inde de görünür; yerel alt kategori etiketi eklenir.
 *
 * Süper Lig futbol routing ile aynı desen (futbol + yerel-spor etiketi).
 */
export function resolveNationalLocalDualRouting(
  categoryId: string,
  citySlug?: string | null,
  articleIsAbroad = false,
): NationalLocalDualRouting | null {
  if (articleIsAbroad || !citySlug?.trim()) return null

  const cat = categoryId?.trim().toLowerCase() ?? ''
  if (!cat || cat === YEREL_HABER_CATEGORY_ID) return null

  const fromYerel = YEREL_TO_NATIONAL_CATEGORY_MAP[cat]
  if (fromYerel) {
    return { nationalCategoryId: fromYerel, yerelTag: cat }
  }

  if (!isYerelCategoryTree(cat) && !shouldLocalizeCategory(cat, citySlug)) {
    return null
  }

  const yerelTag = mapNationalCategoryToYerelSubcategory(cat)
  if (!yerelTag || yerelTag === YEREL_HABER_CATEGORY_ID) return null

  return { nationalCategoryId: cat, yerelTag }
}

/** Normalize category + tags for manual queue publish / admin edits. */
export function normalizePublishedLocalCategory(
  categoryId: string,
  citySlug?: string | null,
  tags: string[] = [],
): { categoryId: string; tags: string[] } {
  const routing = resolveNationalLocalDualRouting(categoryId, citySlug)
  if (!routing) return { categoryId: categoryId.trim(), tags }
  return {
    categoryId: routing.nationalCategoryId,
    tags: mergeNationalLocalTags(tags, routing.yerelTag),
  }
}
