import { isKibrisCategoryTree, isYerelCategoryTree } from '@/constants/config'

/** Yerel ve Kıbrıs ağaçlarında boş alt kategori sekme/bölümleri gizlenir. */
export function shouldHideEmptyScopedCategories(categoryId: string): boolean {
  return isKibrisCategoryTree(categoryId) || isYerelCategoryTree(categoryId)
}

export function filterItemsWithPresence<T extends { id: string }>(
  items: T[],
  activeIds: Iterable<string>,
  alwaysIncludeIds: Iterable<string> = []
): T[] {
  const active = new Set(activeIds)
  for (const id of alwaysIncludeIds) {
    const trimmed = id?.trim()
    if (trimmed) active.add(trimmed)
  }
  return items.filter((item) => active.has(item.id))
}

/**
 * Themed category sections: drop ids with no published news.
 * A dedicated empty subcategory page keeps its single section so the URL still works.
 */
export function filterThemedSectionIds(
  sectionIds: string[],
  activeIds: Iterable<string>,
  options: { currentCategoryId: string }
): string[] {
  const active = new Set(activeIds)
  const filtered = sectionIds.filter((id) => active.has(id))
  if (filtered.length > 0) return filtered
  if (sectionIds.length === 1 && sectionIds[0] === options.currentCategoryId) {
    return sectionIds
  }
  return []
}
