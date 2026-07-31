import type { TimelinePost } from '@/types/post'

/** Lead + yan şerit + okunabilir liste + ızgara devam */
export const LOCAL_RAIL_COUNT = 5
export const LOCAL_LIST_COUNT = 8
export const LOCAL_GRID_SECTION_SIZE = 6

export function chunkPosts<T>(posts: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < posts.length; i += size) {
    chunks.push(posts.slice(i, i + size))
  }
  return chunks
}

export interface LocalNewsReadableLayout {
  lead: TimelinePost | undefined
  rail: TimelinePost[]
  list: TimelinePost[]
  gridChunks: TimelinePost[][]
}

/**
 * Okunabilirlik öncelikli dizilim:
 * 1) Tek büyük lead
 * 2) Yan şeritte 5 kısa haber
 * 3) Yatay satır listesi (başlık + özet)
 * 4) Kalanlar ızgara
 */
export function buildLocalNewsReadableLayout(posts: TimelinePost[]): LocalNewsReadableLayout {
  const lead = posts[0]
  const rail = posts.slice(1, 1 + LOCAL_RAIL_COUNT)
  const afterRail = posts.slice(1 + LOCAL_RAIL_COUNT)
  const list = afterRail.slice(0, LOCAL_LIST_COUNT)
  const rest = afterRail.slice(LOCAL_LIST_COUNT)
  return {
    lead,
    rail,
    list,
    gridChunks: chunkPosts(rest, LOCAL_GRID_SECTION_SIZE),
  }
}

/** @deprecated — eski dergi layout; yeni sayfa readable layout kullanır */
export const LOCAL_HERO_COUNT = 4
export const LOCAL_NAMED_SECTION_TITLES = [
  'Gündem',
  'Editörün Seçimi',
  'Derinlemesine',
  'Öne Çıkan',
] as const

export interface LocalNewsMagazineLayout {
  centerHero: TimelinePost | undefined
  leftHero: TimelinePost | undefined
  rightStack: TimelinePost[]
  namedSections: Array<{ title: string; posts: TimelinePost[] }>
  overflowChunks: TimelinePost[][]
}

export function buildLocalNewsMagazineLayout(
  posts: TimelinePost[],
  cityLabel: string
): LocalNewsMagazineLayout {
  const readable = buildLocalNewsReadableLayout(posts)
  return {
    centerHero: readable.lead,
    leftHero: undefined,
    rightStack: readable.rail.slice(0, 3),
    namedSections: [],
    overflowChunks: chunkPosts(
      [...readable.list, ...readable.gridChunks.flat()],
      LOCAL_GRID_SECTION_SIZE
    ),
  }
}
