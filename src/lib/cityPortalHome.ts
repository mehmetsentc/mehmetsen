import {
  HOME_CATEGORY_PORTAL_FETCH,
  HOME_FEATURED_LIMIT,
  type HomeCategorySlug,
  type HomeFeedInitialData,
  type NewsItem,
} from '@/types/newsItem'

export const CITY_PORTAL_CATEGORIES = [
  { id: 'yerel', title: 'Yerel', href: '/kategori/yerel-haber', keys: ['yerel-haber'], layout: 'column' },
  { id: 'asayis', title: '3. Sayfa', href: '/kategori/asayis', keys: ['asayis', 'yerel-asayis'], layout: 'column' },
  { id: 'dunya', title: 'Dünya', href: '/kategori/dunya', keys: ['dunya'], layout: 'column' },
  { id: 'siyaset', title: 'Siyaset', href: '/kategori/siyaset', keys: ['siyaset', 'yerel-siyaset'], layout: 'column' },
  { id: 'ekonomi', title: 'Ekonomi', href: '/kategori/ekonomi', keys: ['ekonomi', 'yerel-ekonomi', 'yerel-finans'], layout: 'column' },
  { id: 'spor', title: 'Spor', href: '/kategori/spor', keys: ['spor', 'yerel-spor'], layout: 'column' },
  { id: 'teknoloji', title: 'Teknoloji', href: '/kategori/teknoloji', keys: ['teknoloji', 'yerel-teknoloji'], layout: 'column' },
  { id: 'kultur', title: 'Kültür', href: '/kategori/kultur', keys: ['kultur', 'yerel-kultur'], layout: 'column' },
  { id: 'gundem', title: 'Gündem', href: '/kategori/gundem', keys: ['gundem', 'yerel-gundem'], layout: 'rail' },
  { id: 'saglik', title: 'Sağlık', href: '/kategori/saglik', keys: ['saglik', 'yerel-saglik'], layout: 'rail' },
  { id: 'yasam', title: 'Yaşam', href: '/kategori/yasam', keys: ['yasam', 'yerel-yasam'], layout: 'rail' },
  { id: 'egitim', title: 'Eğitim', href: '/kategori/egitim', keys: ['egitim', 'yerel-egitim'], layout: 'rail' },
  { id: 'turizm', title: 'Turizm', href: '/kategori/turizm', keys: ['turizm', 'yerel-turizm'], layout: 'rail' },
  { id: 'magazin', title: 'Magazin', href: '/kategori/magazin', keys: ['magazin', 'yerel-magazin'], layout: 'rail' },
] as const

export const NEWSPAPER_COLUMN_ROW = 4

/** Keep 4-up rows full. A leftover single card becomes a rail; 2–3 leftovers stretch. */
export function packNewspaperCategoryLayout<T>(columns: T[], rails: T[]) {
  const remainder = columns.length % NEWSPAPER_COLUMN_ROW
  if (remainder === 0) {
    return { gridCards: columns, leftoverGrid: [] as T[], leftoverRails: [] as T[], restRails: rails }
  }

  const need = NEWSPAPER_COLUMN_ROW - remainder
  const borrowed = rails.slice(0, need)
  const restRails = rails.slice(borrowed.length)
  const packed = [...columns, ...borrowed]
  const fullCount = Math.floor(packed.length / NEWSPAPER_COLUMN_ROW) * NEWSPAPER_COLUMN_ROW
  const gridCards = packed.slice(0, fullCount)
  const leftover = packed.slice(fullCount)

  if (leftover.length <= 1) {
    return { gridCards, leftoverGrid: [] as T[], leftoverRails: leftover, restRails }
  }

  return { gridCards, leftoverGrid: leftover, leftoverRails: [] as T[], restRails }
}

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

function itemMatchesKeys(item: NewsItem, keys: readonly string[]) {
  const cat = (item.category ?? '').trim().toLowerCase()
  if (!cat) return false
  return keys.some((key) => cat === key || cat.startsWith(`${key}-`))
}

function railItems(rails: HomeFeedInitialData['categoryRails'], keys: readonly string[]) {
  return uniqueItems(keys.flatMap((key) => rails[key as HomeCategorySlug] ?? [])).filter((item) =>
    itemMatchesKeys(item, keys)
  )
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
      used.add(item.id)
      out.push(item)
      if (out.length >= count) break
    }
    return out
  }

  const heroSlides = uniqueItems([...featured, ...latest]).filter(hasImage).slice(0, 5)
  heroSlides.forEach((item) => used.add(item.id))

  const mansetItems = take(
    uniqueItems([...featured.slice(0, HOME_FEATURED_LIMIT), ...latest]),
    8
  )
  const mostRead = take([...(data.mostRead ?? []), ...latest], 8)

  const categoryCards = CITY_PORTAL_CATEGORIES.map((col) => ({
    id: col.id,
    title: col.title,
    href: col.href,
    layout: col.layout,
    items: take(railItems(rails, col.keys), HOME_CATEGORY_PORTAL_FETCH),
  })).filter((col) => col.items.length > 0)

  const videoSource = [...(data.trending ?? []), ...latest, ...featured].filter((item) =>
    Boolean(item.videoUrl)
  )

  return {
    heroSlides,
    mansetItems,
    columnists: uniqueItems(
      [...featured, ...latest].filter((item) => item.articleFormat === 'column')
    ).filter(hasImage),
    mostRead,
    categoryCards,
    videoItem: take(videoSource, 1)[0] ?? null,
    videoItems: take(videoSource, HOME_CATEGORY_PORTAL_FETCH),
    photoItems: take(railItems(rails, ['kultur', 'yerel-kultur', 'magazin', 'yerel-magazin']), 4),
    gundemItems: take(railItems(rails, ['gundem', 'yerel-gundem']), HOME_CATEGORY_PORTAL_FETCH),
    yerelItems: take(railItems(rails, ['yerel-haber']), HOME_CATEGORY_PORTAL_FETCH),
    thirdPageItems: take(railItems(rails, ['asayis', 'yerel-asayis']), HOME_CATEGORY_PORTAL_FETCH),
    kulturItems: take(railItems(rails, ['kultur', 'yerel-kultur']), HOME_CATEGORY_PORTAL_FETCH),
    saglikItems: take(railItems(rails, ['saglik', 'yerel-saglik']), HOME_CATEGORY_PORTAL_FETCH),
    turizmItems: take(railItems(rails, ['turizm', 'yerel-turizm']), HOME_CATEGORY_PORTAL_FETCH),
    yasamItems: take(railItems(rails, ['yasam', 'yerel-yasam']), HOME_CATEGORY_PORTAL_FETCH),
    magazinItems: take(railItems(rails, ['magazin', 'yerel-magazin']), HOME_CATEGORY_PORTAL_FETCH),
  }
}
