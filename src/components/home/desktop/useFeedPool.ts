import type { HomeCategorySlug, HomeFeedInitialData, NewsItem } from '@/types/newsItem'

/** Kategori raylerindeki haberler bölüm slotları için ayrılmış kalsın. */
function reserveRailIds(data: HomeFeedInitialData): Set<string> {
  const ids = new Set<string>()
  for (const items of Object.values(data.categoryRails)) {
    for (const item of items ?? []) ids.add(item.id)
  }
  return ids
}

export function createFeedAllocator(data: HomeFeedInitialData) {
  const used = reserveRailIds(data)

  const masterPool: NewsItem[] = []
  const seen = new Set<string>()

  for (const item of [
    ...data.featured,
    ...data.latest,
    ...data.trending,
    ...data.mostRead,
  ]) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    masterPool.push(item)
  }

  function takeFrom(source: NewsItem[], count: number): NewsItem[] {
    const out: NewsItem[] = []
    for (const item of source) {
      if (used.has(item.id)) continue
      used.add(item.id)
      out.push(item)
      if (out.length >= count) return out
    }
    return out
  }

  function take(count: number): NewsItem[] {
    return takeFrom(masterPool, count)
  }

  function takeCategory(categoryId: string, count: number): NewsItem[] {
    const rail = data.categoryRails[categoryId as HomeCategorySlug] ?? []
    return takeFrom(rail, count)
  }

  /** Featured / trending / popular — used only for row-gap filler sections labeled "Öne Çıkan". */
  function takeFeatured(count: number): NewsItem[] {
    if (count <= 0) return []
    return takeFrom([...data.featured, ...data.trending, ...data.mostRead], count)
  }

  return { take, takeCategory, takeFeatured }
}
