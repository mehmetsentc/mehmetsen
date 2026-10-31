'use client'

/**
 * End-of-article recommendations for canonical /haber.
 * FeedDiscoveryRail reader variant; relatedPosts as fallback when rails empty/disabled.
 */
import { FeedDiscoveryRail } from '@/components/feed/smart/FeedDiscoveryRail'
import { ArticleRelatedGridStatic } from '@/components/news/ArticleRelatedGridStatic'
import { useIsDesktopViewport } from '@/hooks/useIsDesktopViewport'
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

  const isDesktop = useIsDesktopViewport()

  // Desktop: compact 4-up related grid. The Reader discovery rail renders
  // full-bleed 100dvh cards, which on a 1280px column became empty black
  // boxes. Mobile (and SSR before hydration) keeps the rail unchanged.
  if (isDesktop) {
    return fallback ? (
      <div className="mt-10 w-full min-w-0" data-testid="haber-end-recommendations">
        {fallback}
      </div>
    ) : null
  }

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
