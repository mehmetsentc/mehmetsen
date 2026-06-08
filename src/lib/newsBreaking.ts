/** Whether the feed should show a Son Dakika badge for this post. */
export function shouldShowBreakingBadge(post: {
  isBreaking?: boolean
  categoryId?: string | null
  breakingScore?: number
  isPinned?: boolean
}): boolean {
  if (post.isPinned) return true
  if ((post.breakingScore ?? 0) > 80) return true
  if (!post.isBreaking) return false
  const cat = post.categoryId?.trim().toLowerCase()
  if (cat === 'spor' || cat === 'magazin') return false
  return true
}

/** Trending section flag — breakingScore > 70 or explicit isTrending. */
export function shouldShowTrendingFlag(post: {
  isTrending?: boolean
  breakingScore?: number
}): boolean {
  if (post.isTrending) return true
  return (post.breakingScore ?? 0) > 70
}
