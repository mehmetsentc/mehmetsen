import {
  HOME_CATEGORY_PORTAL_FETCH,
  HOME_FEATURED_LIMIT,
  type HomeCategorySlug,
  type HomeFeedInitialData,
  type NewsItem,
} from '@/types/newsItem'

export const CITY_PORTAL_CATEGORIES = [
  { id: 'gundem', title: 'Gündem', href: '/kategori/gundem', keys: ['gundem', 'yerel-gundem'] },
  { id: 'yerel', title: 'Yerel', href: '/kategori/yerel-haber', keys: ['yerel-haber'] },
  { id: 'asayis', title: '3. Sayfa', href: '/kategori/asayis', keys: ['asayis', 'yerel-asayis'] },
  { id: 'dunya', title: 'Dünya', href: '/kategori/dunya', keys: ['dunya'] },
  { id: 'siyaset', title: 'Siyaset', href: '/kategori/siyaset', keys: ['siyaset', 'yerel-siyaset'] },
  { id: 'ekonomi', title: 'Ekonomi', href: '/kategori/ekonomi', keys: ['ekonomi', 'yerel-ekonomi', 'yerel-finans'] },
  { id: 'spor', title: 'Spor', href: '/kategori/spor', keys: ['spor', 'yerel-spor'] },
  { id: 'teknoloji', title: 'Teknoloji', href: '/kategori/teknoloji', keys: ['teknoloji', 'yerel-teknoloji'] },
  { id: 'kultur', title: 'Kültür', href: '/kategori/kultur', keys: ['kultur', 'yerel-kultur'] },
  { id: 'saglik', title: 'Sağlık', href: '/kategori/saglik', keys: ['saglik', 'yerel-saglik'] },
  { id: 'yasam', title: 'Yaşam', href: '/kategori/yasam', keys: ['yasam', 'yerel-yasam'] },
  { id: 'egitim', title: 'Eğitim', href: '/kategori/egitim', keys: ['egitim', 'yerel-egitim'] },
  { id: 'turizm', title: 'Turizm', href: '/kategori/turizm', keys: ['turizm', 'yerel-turizm'] },
  { id: 'magazin', title: 'Magazin', href: '/kategori/magazin', keys: ['magazin', 'yerel-magazin'] },
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

function take(source: NewsItem[], count: number) {
  const out: NewsItem[] = []
  const seen = new Set<string>()
  const ordered = [...source.filter(hasImage), ...source]
  for (const item of ordered) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
    if (out.length >= count) break
  }
  return out
}

export function buildCityPortalHomeProps(data: HomeFeedInitialData) {
  const featured = data.featured ?? []
  const latest = data.latest ?? []
  const rails = data.categoryRails ?? {}
  const pool = uniqueItems([
    ...featured,
    ...latest,
    ...(data.mostRead ?? []),
    ...(data.trending ?? []),
    ...Object.values(rails).flat(),
  ])

  const heroSlides = uniqueItems([...featured, ...latest]).filter(hasImage).slice(0, 5)
  const mansetItems = take(uniqueItems([...featured.slice(0, HOME_FEATURED_LIMIT), ...latest, ...pool]), 8)
  const mostRead = take([...(data.mostRead ?? []), ...latest, ...pool], 8)

  const categoryCards = CITY_PORTAL_CATEGORIES.map((col) => {
    const rail = railItems(rails, col.keys)
    const items = take(rail.length > 0 ? rail : pool, HOME_CATEGORY_PORTAL_FETCH)
    return { id: col.id, title: col.title, href: col.href, items }
  }).filter((col) => col.items.length > 0)

  return {
    heroSlides,
    mansetItems,
    columnists: uniqueItems(
      [...featured, ...latest].filter((item) => item.articleFormat === 'column')
    ).filter(hasImage),
    mostRead,
    categoryCards,
    videoItem:
      take(
        [...(data.trending ?? []), ...latest, ...featured].filter((item) => Boolean(item.videoUrl)),
        1
      )[0] ?? null,
    videoItems: take(
      [...(data.trending ?? []), ...latest, ...featured, ...pool].filter((item) =>
        Boolean(item.videoUrl)
      ),
      HOME_CATEGORY_PORTAL_FETCH
    ),
    photoItems: take(railItems(rails, ['kultur', 'yerel-kultur', 'magazin', 'yerel-magazin']), 4),
    gundemItems: take(
      uniqueItems([...railItems(rails, ['gundem', 'yerel-gundem']), ...latest, ...pool]),
      HOME_CATEGORY_PORTAL_FETCH
    ),
    yerelItems: take(
      uniqueItems([...railItems(rails, ['yerel-haber']), ...pool]),
      HOME_CATEGORY_PORTAL_FETCH
    ),
    thirdPageItems: take(
      uniqueItems([...railItems(rails, ['asayis', 'yerel-asayis']), ...pool]),
      HOME_CATEGORY_PORTAL_FETCH
    ),
    kulturItems: take(
      uniqueItems([...railItems(rails, ['kultur', 'yerel-kultur']), ...pool]),
      HOME_CATEGORY_PORTAL_FETCH
    ),
    saglikItems: take(
      uniqueItems([...railItems(rails, ['saglik', 'yerel-saglik']), ...pool]),
      HOME_CATEGORY_PORTAL_FETCH
    ),
    turizmItems: take(
      uniqueItems([...railItems(rails, ['turizm', 'yerel-turizm']), ...pool]),
      HOME_CATEGORY_PORTAL_FETCH
    ),
    yasamItems: take(
      uniqueItems([...railItems(rails, ['yasam', 'yerel-yasam']), ...pool]),
      HOME_CATEGORY_PORTAL_FETCH
    ),
    magazinItems: take(
      uniqueItems([...railItems(rails, ['magazin', 'yerel-magazin']), ...pool]),
      HOME_CATEGORY_PORTAL_FETCH
    ),
  }
}
