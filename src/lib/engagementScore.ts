import type { Post } from '@/types/post'

export type EngageablePost = Pick<
  Post,
  'likesCount' | 'commentsCount' | 'savesCount' | 'viewsCount' | 'publishedAt' | 'createdAt'
> & {
  sharesCount?: number
}

/** Weighted engagement: views×1, likes×2, comments×4, saves×5, shares×6. */
export function computeEngagementScore(post: EngageablePost): number {
  const views = post.viewsCount ?? 0
  const likes = post.likesCount ?? 0
  const comments = post.commentsCount ?? 0
  const saves = post.savesCount ?? 0
  const shares = post.sharesCount ?? 0

  return views * 1 + likes * 2 + comments * 4 + saves * 5 + shares * 6
}

/** @deprecated Prefer `computeEngagementScore`. */
export const getEngagementScore = computeEngagementScore

export function compareByEngagement<T extends EngageablePost>(a: T, b: T): number {
  const scoreDiff = computeEngagementScore(b) - computeEngagementScore(a)
  if (scoreDiff !== 0) return scoreDiff

  const tb = new Date(b.publishedAt ?? b.createdAt).getTime()
  const ta = new Date(a.publishedAt ?? a.createdAt).getTime()
  return tb - ta
}

export function sortByEngagement<T extends EngageablePost>(posts: T[]): T[] {
  return [...posts].sort(compareByEngagement)
}
