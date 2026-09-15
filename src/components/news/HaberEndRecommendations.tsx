'use client'

/**
 * End-of-article recommendations for canonical /haber.
 * FeedDiscoveryRail reader variant; relatedPosts as fallback when rails empty/disabled.
 */
import { FeedDiscoveryRail } from '@/components/feed/smart/FeedDiscoveryRail'
import { ArticleRelatedGridStatic } from '@/components/news/ArticleRelatedGridStatic'
import type { Post } from '@/types/post'

interface HaberEndRecommendationsProps {
  category?: string | null
  excludeIds: string[]
  relatedPosts: Post[]
}

export function HaberEndRecommendations({
  category,
  excludeIds,
  relatedPosts,
}: HaberEndRecommendationsProps) {
  const fallback =
    relatedPosts.length > 0 ? (
      <ArticleRelatedGridStatic posts={relatedPosts} />
    ) : null

  return (
    <div className="mt-10 w-full min-w-0" data-testid="haber-end-recommendations">
      <FeedDiscoveryRail
        variant="reader"
        category={category}
        excludeIds={new Set(excludeIds)}
        fallback={fallback}
      />
    </div>
  )
}
