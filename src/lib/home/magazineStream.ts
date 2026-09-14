import { getParentCategory } from '@/constants/config'
import {
  HOME_CATEGORY_RAIL_DISPLAY,
  HOME_CATEGORY_RAIL_MIN,
  type HomeCategorySlug,
  type HomeFeedInitialData,
  type NewsItem,
} from '@/types/newsItem'
import { MAGAZINE_INLINE_CATEGORY_ORDER } from '@/lib/home/sourceStories'

export const MAGAZINE_CHUNK = 5

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

export function collectMagazineCandidates(
  latest: NewsItem[],
  rails: HomeFeedInitialData['categoryRails']
): NewsItem[] {
  const seen = new Set<string>()
  const out: NewsItem[] = []
  const push = (items?: NewsItem[]) => {
    for (const item of items ?? []) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
    }
  }
  push(latest)
  for (const items of Object.values(rails)) push(items)
  return out
}

function resolveMagazineCategory(
  item: NewsItem,
  orderSet: Set<string>
): HomeCategorySlug | null {
  const raw = String(item.category ?? item.originalCategoryId ?? '').trim()
  if (!raw) return null
  if (orderSet.has(raw)) return raw as HomeCategorySlug
  const parent = getParentCategory(raw)
  if (parent && orderSet.has(parent.id)) return parent.id as HomeCategorySlug
  return null
}

/**
 * Her kategorinin en son haberini nav sırasıyla round-robin dizer.
 * Yeni ranking yok — eldeki latest + kategori raylarını yeniden sıralar.
 */
export function sequentialCategoryLatest(
  items: NewsItem[],
  order: readonly HomeCategorySlug[] = MAGAZINE_INLINE_CATEGORY_ORDER
): NewsItem[] {
  const orderSet = new Set<string>(order)
  const buckets = new Map<HomeCategorySlug, NewsItem[]>()
  const leftover: NewsItem[] = []

  for (const item of items) {
    const categoryId = resolveMagazineCategory(item, orderSet)
    if (!categoryId) {
      leftover.push(item)
      continue
    }
    const bucket = buckets.get(categoryId)
    if (bucket) bucket.push(item)
    else buckets.set(categoryId, [item])
  }

  const out: NewsItem[] = []
  const seen = new Set<string>()
  let added = true
  while (added) {
    added = false
    for (const categoryId of order) {
      const bucket = buckets.get(categoryId)
      const next = bucket?.shift()
      if (!next || seen.has(next.id)) continue
      seen.add(next.id)
      out.push(next)
      added = true
    }
  }

  for (const item of leftover) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }

  return out
}
