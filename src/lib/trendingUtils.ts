import type { Post } from '@/types/post'
import { normalizeTag } from '@/lib/tags'
import { isPubliclyVisibleStatus } from '@/lib/postUtils'

export interface TrendingTopic {
  tag: string
  count: number
}

export const SEED_TRENDING_TAGS = ['çanakkale', 'seçim', 'ekonomi', 'teknoloji'] as const

export function postMatchesTag(post: Post, tag: string): boolean {
  const term = tag.toLocaleLowerCase('tr-TR')

  if (!isPubliclyVisibleStatus(post.status)) return false

  if (post.tags?.some((t) => t.toLocaleLowerCase('tr-TR') === term)) return true
  if (post.categoryId?.toLocaleLowerCase('tr-TR') === term) return true
  if (post.citySlug?.toLocaleLowerCase('tr-TR').includes(term)) return true
  if (post.city?.toLocaleLowerCase('tr-TR').includes(term)) return true

  const haystack = [
    post.title,
    post.content,
    post.summary,
    post.categoryId,
    ...(post.tags ?? []),
  ]
    .join(' ')
    .toLocaleLowerCase('tr-TR')

  return haystack.includes(term)
}

export function countPostsForTag(posts: Post[], tag: string): number {
  return posts.filter((post) => postMatchesTag(post, tag)).length
}

export function buildTrendingFromPosts(
  posts: Post[],
  tags: readonly string[] = SEED_TRENDING_TAGS
): TrendingTopic[] {
  return tags.map((tag) => ({
    tag,
    count: countPostsForTag(posts, tag),
  }))
}

export function buildTopTagsFromPosts(posts: Post[], limit = 4): TrendingTopic[] {
  const counts = new Map<string, number>()

  for (const post of posts) {
    if (!isPubliclyVisibleStatus(post.status)) continue

    const matched = new Set<string>()

    const add = (raw: string | null | undefined) => {
      if (!raw?.trim()) return
      const normalized = normalizeTag(raw) ?? raw.trim().toLocaleLowerCase('tr-TR')
      if (!normalized || matched.has(normalized)) return
      matched.add(normalized)
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
    }

    for (const tag of post.tags ?? []) add(tag)
    add(post.categoryId)
    add(post.citySlug)
  }

  for (const seed of SEED_TRENDING_TAGS) {
    const broad = countPostsForTag(posts, seed)
    counts.set(seed, Math.max(counts.get(seed) ?? 0, broad))
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr-TR'))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }))
}
