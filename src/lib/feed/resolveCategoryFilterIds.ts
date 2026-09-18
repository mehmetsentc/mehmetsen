import { DEFAULT_CATEGORIES, getCategoryFamily, getSubcategories } from '@/constants/config'

/**
 * Expand a Feed V2 category chip id into itself + all taxonomy descendants
 * (direct children and deeper), using DEFAULT_CATEGORIES.parentId only.
 * No hard-coded Spor/Futbol lists. Leaf ids return [leaf] only.
 */
export function resolveCategoryFilterIds(categoryId: string): string[] {
  const raw = categoryId.trim().toLowerCase()
  if (!raw) return []
  const cat = DEFAULT_CATEGORIES.find((c) => c.id === raw || c.slug === raw)
  if (!cat) return [raw]

  const out: string[] = [cat.id]
  const queue = [cat.id]
  const seen = new Set<string>([cat.id])
  while (queue.length) {
    const parentId = queue.shift()!
    for (const kid of getSubcategories(parentId)) {
      if (seen.has(kid.id)) continue
      seen.add(kid.id)
      out.push(kid.id)
      queue.push(kid.id)
    }
  }
  return out
}

/**
 * City-locked feeds also include getCategoryFamily mirrors so parent chips
 * (Spor, Ekonomi, …) match the yerel-* ids those desks actually publish.
 */
export function resolveLockedCityCategoryFilterIds(categoryId: string): string[] {
  const raw = categoryId.trim().toLowerCase()
  if (!raw) return []
  return [...new Set([...resolveCategoryFilterIds(raw), ...getCategoryFamily(raw)])]
}
