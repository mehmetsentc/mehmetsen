import { DEFAULT_CATEGORIES, getSubcategories } from '@/constants/config'

/**
 * Expand a top-nav / skin category id into itself + child category ids
 * so feed filters match articles tagged under subcategories.
 */
export function resolveCategoryFilterIds(categoryId: string): string[] {
  const raw = categoryId.trim().toLowerCase()
  if (!raw) return []
  const cat = DEFAULT_CATEGORIES.find((c) => c.id === raw || c.slug === raw)
  if (!cat) return [raw]
  const kids = getSubcategories(cat.id).map((c) => c.id)
  return Array.from(new Set([cat.id, ...kids]))
}
