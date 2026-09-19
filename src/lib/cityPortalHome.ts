import {
  HOME_CATEGORY_PORTAL_FETCH,
  HOME_FEATURED_LIMIT,
  type HomeCategorySlug,
  type HomeFeedInitialData,
  type NewsItem,
} from '@/types/newsItem'

const PORTAL_CATEGORY_ROW = [
  { id: 'siyaset', title: 'Siyaset', keys: ['siyaset', 'yerel-siyaset'] },
  { id: 'ekonomi', title: 'Ekonomi', keys: ['ekonomi', 'yerel-ekonomi', 'yerel-finans'] },
  { id: 'dunya', title: 'Dünya', keys: ['dunya', 'asayis', 'yerel-asayis'] },
  { id: 'spor', title: 'Spor', keys: ['spor', 'yerel-spor'] },
  { id: 'teknoloji', title: 'Teknoloji', keys: ['teknoloji', 'yerel-teknoloji'] },
] as const

function hasImage(item: NewsItem): item is NewsItem & { imageUrl: string } {
  return Boolean(item.imageUrl?.trim())
}

function uniqueItems(items: NewsItem[]) {
  const seen = new Set<string>()
  const out: NewsItem[] = []
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

function railItems(rails: HomeFeedInitialData['categoryRails'], keys: readonly string[]) {
  return uniqueItems(keys.flatMap((key) => rails[key as HomeCategorySlug] ?? []))
}

export function buildCityPortalHomeProps(data: HomeFeedInitialData) {
  const featured = data.featured ?? []
  const latest = data.latest ?? []
  const rails = data.categoryRails ?? {}
  const used = new Set<string>()

  const take = (source: NewsItem[], count: number) => {
    const out: NewsItem[] = []
    const ordered = [...source.filter(hasImage), ...source]
    for (const item of ordered) {
      if (!item?.id || used.has(item.id)) continue
      if (out.length === 0 && !hasImage(item)) continue
      used.add(item.id)
      out.push(item)
      if (out.length >= count) break
    }
    return out
  }

  const heroSlides = uniqueItems([...featured, ...latest]).filter(hasImage).slice(0, 5)
  heroSlides.forEach((item) => used.add(item.id))

  const mansetItems = take(uniqueItems([...featured.slice(0, HOME_FEATURED_LIMIT), ...latest]), 5)
  const mostRead = take([...(data.mostRead ?? []), ...latest], 5)
  const columnists = uniqueItems(
    [...featured, ...latest].filter((item) => item.articleFormat === 'column')
  ).filter(hasImage)

  const categoryCards = PORTAL_CATEGORY_ROW.map((col) => ({
    id: col.id,
    title: col.title,
    items: take(railItems(rails, col.keys), HOME_CATEGORY_PORTAL_FETCH),
  }))
    .map((col) =>
      col.items.length > 0 ? col : { ...col, items: take(latest, HOME_CATEGORY_PORTAL_FETCH) }
    )
    .filter((col) => col.items.length > 0)

  return {
    heroSlides,
    mansetItems,
    columnists,
    mostRead,
    categoryCards,
    videoItem: take(
      [...(data.trending ?? []), ...latest, ...featured].filter((item) => Boolean(item.videoUrl)),
      1
    )[0] ?? null,
    videoItems: take(
      [...(data.trending ?? []), ...latest, ...featured].filter((item) => Boolean(item.videoUrl)),
      HOME_CATEGORY_PORTAL_FETCH
    ),
    photoItems: take(
      [...railItems(rails, ['kultur', 'yerel-kultur', 'magazin', 'yerel-magazin'])],
      4
    ),
    gundemItems: take(uniqueItems([...railItems(rails, ['gundem', 'yerel-gundem']), ...latest]), HOME_CATEGORY_PORTAL_FETCH),
    yerelItems: take(railItems(rails, ['yerel-haber']), HOME_CATEGORY_PORTAL_FETCH),
    thirdPageItems: take(railItems(rails, ['asayis', 'yerel-asayis']), HOME_CATEGORY_PORTAL_FETCH),
    kulturItems: take(railItems(rails, ['kultur', 'yerel-kultur']), HOME_CATEGORY_PORTAL_FETCH),
    saglikItems: take(railItems(rails, ['saglik', 'yerel-saglik']), HOME_CATEGORY_PORTAL_FETCH),
    turizmItems: take(railItems(rails, ['turizm', 'yerel-turizm']), HOME_CATEGORY_PORTAL_FETCH),
    yasamItems: take(railItems(rails, ['yasam', 'yerel-yasam']), HOME_CATEGORY_PORTAL_FETCH),
    magazinItems: take(railItems(rails, ['magazin', 'yerel-magazin']), HOME_CATEGORY_PORTAL_FETCH),
  }
}

