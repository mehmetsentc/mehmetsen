import { DEFAULT_CATEGORIES, getNationalCategoryForYerelSubcategory } from '@/constants/config'
import { CITY_CATEGORY_CHIPS } from '@/constants/cityCategories'

/**
 * Resolve city category route id → query family root + display label.
 * National chips (siyaset) query their home-feed family (incl. yerel-siyaset).
 * Yerel-only chips (yerel-duyuru) and explicit yerel-* URLs stay as-is.
 */
export function resolveCityCategoryRoute(
  id: string
): { categoryId: string; label: string } | null {
  const raw = id.trim().toLowerCase()
  if (!raw) return null

  const chip = CITY_CATEGORY_CHIPS.find(
    (c) => c.categoryId === raw || (c.id === raw && c.categoryId)
  )
  if (chip?.categoryId) {
    return { categoryId: chip.categoryId, label: chip.label }
  }

  const def = DEFAULT_CATEGORIES.find((c) => c.slug === raw || c.id === raw)
  if (!def) return null

  // /kategori/yerel-siyaset → show under national Siyaset family on city sites
  const national = getNationalCategoryForYerelSubcategory(def.id)
  if (national) {
    const nationalChip = CITY_CATEGORY_CHIPS.find((c) => c.categoryId === national)
    const nationalDef = DEFAULT_CATEGORIES.find((c) => c.id === national)
    return {
      categoryId: national,
      label: nationalChip?.label ?? nationalDef?.name ?? def.name,
    }
  }

  return { categoryId: def.id, label: def.name }
}
