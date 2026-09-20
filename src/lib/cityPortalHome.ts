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
  { id: 'spor', title: 'Spor', href: '/kategori/spor', keys: ['spor', 'yerel-spor', 'yerel-futbol', 'futbol'], layout: 'column' },
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

/** Keep 4-up rows full. Extra rails join the grid; a lone leftover becomes a rail. */
export function packNewspaperCategoryLayout<T>(columns: T[], rails: T[]) {
  const packed = [...columns, ...rails]
  const fullCount = Math.floor(packed.length / NEWSPAPER_COLUMN_ROW) * NEWSPAPER_COLUMN_ROW
  const gridCards = packed.slice(0, fullCount)
  const leftover = packed.slice(fullCount)

  if (leftover.length <= 1) {
    return { gridCards, leftoverGrid: [] as T[], leftoverRails: leftover, restRails: [] as T[] }
  }

  if (leftover.length === 3) {
    return {
      gridCards,
      leftoverGrid: leftover.slice(0, 2),
      leftoverRails: leftover.slice(2),
      restRails: [] as T[],
    }
  }

  return { gridCards, leftoverGrid: leftover, leftoverRails: [] as T[], restRails: [] as T[] }
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
  const cats = [item.category, item.originalCategoryId]
    .map((value) => (value ?? '').trim().toLowerCase())
    .filter(Boolean)
  return cats.some((cat) => keys.some((key) => cat === key || cat.startsWith(`${key}-`)))
}

const COLUMN_TARGET = HOME_CATEGORY_PORTAL_FETCH

function backfillColumn(matched: NewsItem[], archive: NewsItem[], target = COLUMN_TARGET) {
  const out = uniqueItems(matched)
  if (out.length >= target) return out.slice(0, target)
  const seen = new Set(out.map((item) => item.id))
  for (const item of archive) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
    if (out.length >= target) break
  }
  return out
}

function railItems(
  rails: HomeFeedInitialData['categoryRails'],
  keys: readonly string[],
  extras: NewsItem[] = []
) {
  return uniqueItems([
    ...keys.flatMap((key) => rails[key as HomeCategorySlug] ?? []),
    ...Object.values(rails).flatMap((items) => items ?? []),
    ...extras,
  ]).filter((item) => itemMatchesKeys(item, keys))
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
    10
  )
  const mostRead = take([...(data.mostRead ?? []), ...latest], 8)

  const archive = uniqueItems([
    ...featured,
    ...latest,
    ...Object.values(rails).flatMap((items) => items ?? []),
    ...(data.mostRead ?? []),
    ...(data.trending ?? []),
    ...(data.breaking ?? []),
    ...(data.trendFeed ?? []),
  ])
  const drafts = CITY_PORTAL_CATEGORIES.map((col) => ({
    id: col.id,
    title: col.title,
    href: col.href,
    layout: col.layout,
    items: uniqueItems(railItems(rails, col.keys, archive)),
  }))
  const claimed = new Set(drafts.flatMap((card) => card.items.map((item) => item.id)))
  const remaining = archive.filter((item) => item.id && !claimed.has(item.id))

  const fillDrafts = (cards: typeof drafts) => {
    while (remaining.length > 0) {
      const needy = cards.filter((card) => card.items.length > 0 && card.items.length < COLUMN_TARGET)
      if (needy.length === 0) break
      for (const card of needy) {
        const next = remaining.shift()
        if (!next?.id) break
        card.items.push(next)
        if (remaining.length === 0) break
      }
    }
  }
  fillDrafts(drafts)
  for (const card of drafts) {
    if (card.items.length > 0 || (card.id !== 'gundem' && card.id !== 'yerel')) continue
    while (card.items.length < COLUMN_TARGET && remaining.length > 0) {
      const next = remaining.shift()
      if (!next?.id) continue
      card.items.push(next)
    }
  }
  const visibleCards = drafts.filter((card) => card.items.length > 0)
  const cardItems = (id: string) => visibleCards.find((card) => card.id === id)?.items ?? []

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
    categoryCards: visibleCards,
    videoItem: take(videoSource, 1)[0] ?? null,
    videoItems: take(videoSource, HOME_CATEGORY_PORTAL_FETCH),
    photoItems: backfillColumn(
      railItems(rails, ['kultur', 'yerel-kultur', 'magazin', 'yerel-magazin'], archive).filter(hasImage),
      remaining.filter(hasImage),
      4
    ),
    gundemItems: cardItems('gundem'),
    yerelItems: cardItems('yerel'),
    thirdPageItems: cardItems('asayis'),
    kulturItems: cardItems('kultur'),
    saglikItems: cardItems('saglik'),
    turizmItems: cardItems('turizm'),
    yasamItems: cardItems('yasam'),
    magazinItems: cardItems('magazin'),
    egitimItems: cardItems('egitim'),
  }
}
