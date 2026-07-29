import { hasVideoContent } from '@/lib/postUtils'
import {
  categoryPostHref,
  categoryPostImage,
  categoryPostTimestamp,
} from '@/components/home/desktop/categoryPostUtils'
import type { TimelinePost } from '@/types/post'

export type MobileStoryVariant =
  | 'hero'
  | 'large'
  | 'compact'
  | 'video'
  | 'text'
  | 'feed'

export interface MobileStorySlot {
  variant: MobileStoryVariant
  post: TimelinePost
}

export interface MobileCategoryBlock {
  type: 'hero' | 'latest' | 'stories' | 'section' | 'feed' | 'videos'
  title?: string
  href?: string
  slots: MobileStorySlot[]
  latestTitles?: Array<{ id: string; title: string; href: string }>
}

function scorePost(post: TimelinePost): number {
  let score = categoryPostTimestamp(post)
  if (post.isBreaking) score += 1e13
  const priority = typeof post.priorityScore === 'number' ? post.priorityScore : 0
  score += priority * 1e9
  if (categoryPostImage(post)) score += 1e7
  if (hasVideoContent(post)) score += 5e6
  return score
}

function sortEditorial(posts: TimelinePost[]): TimelinePost[] {
  return [...posts].sort((a, b) => scorePost(b) - scorePost(a))
}

function take(
  pool: TimelinePost[],
  used: Set<string>,
  predicate?: (p: TimelinePost) => boolean
): TimelinePost | null {
  const idx = pool.findIndex((p) => !used.has(p.id) && (!predicate || predicate(p)))
  if (idx < 0) return null
  const post = pool[idx]
  used.add(post.id)
  return post
}

const OPENING_PATTERN: MobileStoryVariant[] = [
  'large',
  'compact',
  'compact',
  'large',
  'compact',
  'compact',
  'compact',
]

function slotsFromPattern(
  pool: TimelinePost[],
  used: Set<string>,
  pattern: MobileStoryVariant[]
): MobileStorySlot[] {
  const slots: MobileStorySlot[] = []
  for (const variant of pattern) {
    let post: TimelinePost | null = null
    if (variant === 'video') {
      post = take(pool, used, hasVideoContent)
      if (!post) post = take(pool, used, (p) => Boolean(categoryPostImage(p)))
      if (!post) post = take(pool, used)
    } else if (variant === 'large' || variant === 'hero') {
      post = take(pool, used, (p) => Boolean(categoryPostImage(p)))
      if (!post) post = take(pool, used)
    } else if (variant === 'text') {
      post = take(pool, used, (p) => !categoryPostImage(p))
      if (!post) post = take(pool, used)
    } else {
      post = take(pool, used)
    }
    if (!post) break
    const resolved: MobileStoryVariant =
      variant === 'video' && !hasVideoContent(post)
        ? categoryPostImage(post)
          ? 'large'
          : 'text'
        : variant === 'large' && !categoryPostImage(post)
          ? 'text'
          : variant
    slots.push({ variant: resolved, post })
  }
  return slots
}

function sectionPattern(count: number): MobileStoryVariant[] {
  if (count <= 1) return ['large']
  if (count === 2) return ['large', 'compact']
  if (count === 3) return ['large', 'compact', 'compact']
  return ['large', 'compact', 'compact', 'compact']
}

function feedPattern(index: number): MobileStoryVariant {
  if (index % 5 === 0) return 'large'
  if (index % 7 === 3) return 'video'
  return 'compact'
}

export interface ComposeMobileCategoryInput {
  /** Flat pool for opening / hero (usually all initial posts) */
  posts: TimelinePost[]
  /** Ordered subcategory sections with their posts */
  sections?: Array<{ id: string; title: string; href: string; posts: TimelinePost[] }>
  /** When true, treat as subcategory page (skip sibling section blocks from empty data) */
  isSubcategory?: boolean
}

/**
 * Deterministic mobile category composition.
 * Deduplicates by post id across hero, opening, sections, and feed.
 */
export function composeMobileCategoryLayout({
  posts,
  sections = [],
  isSubcategory = false,
}: ComposeMobileCategoryInput): MobileCategoryBlock[] {
  const used = new Set<string>()
  const pool = sortEditorial(posts)
  const blocks: MobileCategoryBlock[] = []

  const hero = take(pool, used, (p) => Boolean(categoryPostImage(p))) ?? take(pool, used)
  if (hero) {
    blocks.push({ type: 'hero', slots: [{ variant: 'hero', post: hero }] })
  }

  // Güncel strip: preview next headlines (same stories may appear below —
  // strip is a ticker, not a full module). Exclude hero only.
  const latestCandidates = pool.filter((p) => !used.has(p.id)).slice(0, 8)
  if (latestCandidates.length >= 2) {
    blocks.push({
      type: 'latest',
      slots: [],
      latestTitles: latestCandidates.map((p) => ({
        id: p.id,
        title: p.title,
        href: categoryPostHref(p),
      })),
    })
  }

  const opening = slotsFromPattern(pool, used, OPENING_PATTERN)
  if (opening.length > 0) {
    blocks.push({ type: 'stories', slots: opening })
  }

  // Video cluster from remaining videos (max 2) before sections
  const videoSlots: MobileStorySlot[] = []
  for (let i = 0; i < 2; i++) {
    const v = take(pool, used, hasVideoContent)
    if (!v) break
    videoSlots.push({ variant: 'video', post: v })
  }
  if (videoSlots.length > 0) {
    blocks.push({ type: 'videos', title: 'Video', slots: videoSlots })
  }

  if (!isSubcategory) {
    for (const section of sections) {
      const sectionPool = sortEditorial(section.posts.filter((p) => !used.has(p.id)))
      if (sectionPool.length === 0) continue
      const pattern = sectionPattern(Math.min(sectionPool.length, 4))
      const slots = slotsFromPattern(sectionPool, used, pattern)
      if (slots.length === 0) continue
      blocks.push({
        type: 'section',
        title: section.title,
        href: section.href,
        slots,
      })
    }
  }

  const remaining = pool.filter((p) => !used.has(p.id))
  if (remaining.length > 0) {
    const feedSlots = remaining.map((post, i) => {
      used.add(post.id)
      let variant = feedPattern(i)
      if (variant === 'video' && !hasVideoContent(post)) {
        variant = categoryPostImage(post) ? 'large' : 'compact'
      }
      if (variant === 'large' && !categoryPostImage(post)) variant = 'text'
      return { variant, post } satisfies MobileStorySlot
    })
    blocks.push({ type: 'feed', title: 'Son Haberler', slots: feedSlots })
  }

  return blocks
}

/** Append newly loaded posts into feed-style slots, skipping already-rendered ids. */
export function appendFeedSlots(
  posts: TimelinePost[],
  alreadyRendered: Set<string>,
  startIndex = 0
): MobileStorySlot[] {
  const fresh = sortEditorial(posts).filter((p) => !alreadyRendered.has(p.id))
  return fresh.map((post, i) => {
    alreadyRendered.add(post.id)
    let variant = feedPattern(startIndex + i)
    if (variant === 'video' && !hasVideoContent(post)) {
      variant = categoryPostImage(post) ? 'compact' : 'text'
    }
    if ((variant === 'large' || variant === 'hero') && !categoryPostImage(post)) {
      variant = 'text'
    }
    return { variant, post }
  })
}

export function collectRenderedIds(blocks: MobileCategoryBlock[]): Set<string> {
  const ids = new Set<string>()
  for (const block of blocks) {
    for (const slot of block.slots) ids.add(slot.post.id)
    // latest strip is a ticker preview — do not count toward dedup exclusivity
  }
  return ids
}
