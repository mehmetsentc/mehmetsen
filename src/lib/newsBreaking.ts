/** Whether the feed should show a Son Dakika badge for this post.
 * KURAL: Tek gerçek kaynak categoryId === 'son-dakika'.
 * isBreaking veya breakingScore tek başına yeterli değil —
 * kategori son-dakika olmadan badge gösterilmez.
 * Köşe/analiz asla son-dakika şeridine girmez.
 */
export function shouldShowBreakingBadge(post: {
  isBreaking?: boolean
  categoryId?: string | null
  breakingScore?: number
  isPinned?: boolean
  articleFormat?: 'standard' | 'column' | 'analysis' | null
}): boolean {
  if (post.articleFormat === 'column' || post.articleFormat === 'analysis') return false
  const cat = post.categoryId?.trim().toLowerCase()
  return cat === 'son-dakika'
}

/** Trending section flag — breakingScore > 70 or explicit isTrending. */
export function shouldShowTrendingFlag(post: {
  isTrending?: boolean
  breakingScore?: number
}): boolean {
  if (post.isTrending) return true
  return (post.breakingScore ?? 0) > 70
}
