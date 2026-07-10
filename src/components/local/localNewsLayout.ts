import type { TimelinePost } from '@/types/post'

export const LOCAL_HERO_COUNT = 4
export const LOCAL_GRID_SECTION_SIZE = 4

export const LOCAL_NAMED_SECTION_TITLES = [
  'Gündem',
  'Editörün Seçimi',
  'Derinlemesine',
  'Öne Çıkan',
] as const

export function chunkPosts<T>(posts: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < posts.length; i += size) {
    chunks.push(posts.slice(i, i + size))
  }
  return chunks
}

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
  const heroPosts = posts.slice(0, LOCAL_HERO_COUNT)
  const afterHero = posts.slice(LOCAL_HERO_COUNT)

  const namedSections = LOCAL_NAMED_SECTION_TITLES.map((suffix, index) => {
    const start = index * LOCAL_GRID_SECTION_SIZE
    const sectionPosts = afterHero.slice(start, start + LOCAL_GRID_SECTION_SIZE)
    const title =
      suffix === 'Gündem' ? `${cityLabel} ${suffix}` : suffix
    return { title, posts: sectionPosts }
  }).filter((section) => section.posts.length > 0)

  const namedCount = LOCAL_NAMED_SECTION_TITLES.length * LOCAL_GRID_SECTION_SIZE
  const overflowPosts = afterHero.slice(namedCount)
  const overflowChunks = chunkPosts(overflowPosts, LOCAL_GRID_SECTION_SIZE)

  return {
    centerHero: heroPosts[0],
    leftHero: heroPosts[1],
    rightStack: heroPosts.slice(2, LOCAL_HERO_COUNT),
    namedSections,
    overflowChunks,
  }
}
