import {
  HOME_CATEGORY_RAIL_DISPLAY,
  HOME_CATEGORY_RAIL_MIN,
  type HomeCategorySlug,
  type HomeFeedInitialData,
  type NewsItem,
} from '@/types/newsItem'
import type { HomeDiscoveryItem } from '@/components/home/HomeDiscoveryCard'

export const HOME_DISCOVERY_CHUNK = 8

/** Inline “öne çıkanlar” strips while scrolling the masonry wall. */
export const HOME_INLINE_RAIL_ORDER: HomeCategorySlug[] = [
  'gundem',
  'ekonomi',
  'spor',
  'dunya',
  'siyaset',
  'saglik',
]

export type DiscoveryMasonryBlock = {
  kind: 'masonry'
  items: HomeDiscoveryItem[]
}

export type DiscoveryRailBlock = {
  kind: 'rail'
  categoryId: HomeCategorySlug
  items: NewsItem[]
}

export type DiscoveryBlock = DiscoveryMasonryBlock | DiscoveryRailBlock

export function sliceRailItems(
  rails: HomeFeedInitialData['categoryRails'],
  categoryId: HomeCategorySlug,
  excludeIds: Set<string>
): NewsItem[] {
  return (rails[categoryId] ?? [])
    .filter((item) => !excludeIds.has(item.id))
    .slice(0, HOME_CATEGORY_RAIL_DISPLAY)
}

/**
 * Masonry chunks punctuated by per-category swipe rails.
 * Does not invent ranking — uses existing `categoryRails` + latest order.
 */
export function buildDiscoveryStream(opts: {
  masonryItems: HomeDiscoveryItem[]
  rails: HomeFeedInitialData['categoryRails']
  excludeIds: Set<string>
  railOrder?: readonly HomeCategorySlug[]
  chunkSize?: number
}): DiscoveryBlock[] {
  const {
    masonryItems,
    rails,
    excludeIds,
    railOrder = HOME_INLINE_RAIL_ORDER,
    chunkSize = HOME_DISCOVERY_CHUNK,
  } = opts

  const blocks: DiscoveryBlock[] = []
  const usedRails = new Set<HomeCategorySlug>()
  let railCursor = 0

  const nextRail = (): DiscoveryRailBlock | null => {
    while (railCursor < railOrder.length) {
      const categoryId = railOrder[railCursor]!
      railCursor += 1
      if (usedRails.has(categoryId)) continue
      const items = sliceRailItems(rails, categoryId, excludeIds)
      if (items.length < HOME_CATEGORY_RAIL_MIN) continue
      usedRails.add(categoryId)
      return { kind: 'rail', categoryId, items }
    }
    return null
  }

  if (masonryItems.length === 0) {
    const first = nextRail()
    return first ? [first] : []
  }

  for (let i = 0; i < masonryItems.length; i += chunkSize) {
    blocks.push({
      kind: 'masonry',
      items: masonryItems.slice(i, i + chunkSize),
    })
    if (i + chunkSize < masonryItems.length) {
      const rail = nextRail()
      if (rail) blocks.push(rail)
    }
  }

  return blocks
}
