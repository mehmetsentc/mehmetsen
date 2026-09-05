import { DEFAULT_CATEGORIES, TOP_NAV_CATEGORY_IDS } from '@/constants/config'

/** Tracked Feed V2 chip buckets (parent / mode aliases). */
export const FEED_V2_TRACKED_CATEGORY_IDS = new Set<string>([
  'son-dakika',
  'yerel-haber',
  ...TOP_NAV_CATEGORY_IDS,
])

/** Fallback order when activity is missing — deterministic, Magazin NOT pinned. */
export const FEED_V2_CATEGORY_FALLBACK_ORDER: string[] = [
  'son-dakika',
  'yerel',
  ...TOP_NAV_CATEGORY_IDS.filter((id) => id !== 'asayis'),
]

/**
 * Map leaf category (+ optional breaking) → Feed V2 chip bucket.
 * Aliases (e.g. yerel-haber → yerel) collapse into one activity bucket.
 */
export function feedV2CategoryParentBucket(
  categoryId: string | null | undefined,
  isBreaking = false
): string | null {
  if (isBreaking) return 'son-dakika'
  if (!categoryId) return null
  const id = categoryId.trim().toLowerCase()
  if (!id) return null
  if (id === 'son-dakika') return 'son-dakika'
  if (id === 'yerel' || id === 'yerel-haber') return 'yerel'

  const cat = DEFAULT_CATEGORIES.find((c) => c.id === id || c.slug === id)
  if (!cat) {
    return FEED_V2_TRACKED_CATEGORY_IDS.has(id) ? id : null
  }
  if (FEED_V2_TRACKED_CATEGORY_IDS.has(cat.id)) {
    return cat.id === 'yerel-haber' ? 'yerel' : cat.id
  }
  if (cat.parentId && FEED_V2_TRACKED_CATEGORY_IDS.has(cat.parentId)) {
    return cat.parentId === 'yerel-haber' ? 'yerel' : cat.parentId
  }
  return null
}

export function feedV2CategoryDisplayName(bucketId: string): string {
  if (bucketId === 'yerel') return 'Yerel'
  if (bucketId === 'son-dakika') return 'Son Dakika'
  const cat = DEFAULT_CATEGORIES.find((c) => c.id === bucketId)
  return cat?.name ?? bucketId
}
