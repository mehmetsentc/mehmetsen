import {
  HOME_CATEGORY_RAIL_DISPLAY,
  HOME_CATEGORY_RAIL_MIN,
  type HomeCategorySlug,
  type HomeFeedInitialData,
  type NewsItem,
} from '@/types/newsItem'
import { MAGAZINE_INLINE_CATEGORY_ORDER } from '@/lib/home/sourceStories'

export const MAGAZINE_CHUNK = 4

export type MagazineNewsBlock = {
  kind: 'magazine'
  items: NewsItem[]
}

export type MagazineCategoryBlock = {
  kind: 'category'
  categoryId: HomeCategorySlug
  items: NewsItem[]
}

export type MagazineBlock = MagazineNewsBlock | MagazineCategoryBlock

export function buildMagazineStream(opts: {
  items: NewsItem[]
  rails: HomeFeedInitialData['categoryRails']
  excludeIds?: Set<string>
  railOrder?: readonly HomeCategorySlug[]
  chunkSize?: number
}): MagazineBlock[] {
  const {
    items,
    rails,
    excludeIds = new Set<string>(),
    railOrder = MAGAZINE_INLINE_CATEGORY_ORDER,
    chunkSize = MAGAZINE_CHUNK,
  } = opts

  const blocks: MagazineBlock[] = []
  const usedRails = new Set<HomeCategorySlug>()
  let railCursor = 0

  const nextCategory = (): MagazineCategoryBlock | null => {
    while (railCursor < railOrder.length) {
      const categoryId = railOrder[railCursor]!
      railCursor += 1
      if (usedRails.has(categoryId)) continue
      const railItems = (rails[categoryId] ?? [])
        .filter((item) => !excludeIds.has(item.id))
        .slice(0, HOME_CATEGORY_RAIL_DISPLAY)
      if (railItems.length < HOME_CATEGORY_RAIL_MIN) continue
      usedRails.add(categoryId)
      return { kind: 'category', categoryId, items: railItems }
    }
    return null
  }

  if (items.length === 0) {
    const first = nextCategory()
    return first ? [first] : []
  }

  for (let i = 0; i < items.length; i += chunkSize) {
    blocks.push({
      kind: 'magazine',
      items: items.slice(i, i + chunkSize),
    })
    const rail = nextCategory()
    if (rail) blocks.push(rail)
  }

  return blocks
}
