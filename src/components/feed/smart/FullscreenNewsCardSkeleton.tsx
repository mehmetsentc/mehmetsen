'use client'

import { cn } from '@/lib/utils'
import { FEED_READER_SURFACE_CLASS } from '@/lib/feed/reader/feedChrome'
import { FeedV2BrandLoader } from '@/components/feed/smart/FeedV2BrandLoader'

interface FullscreenNewsCardSkeletonProps {
  className?: string
}

/** First-load wait — brand mark instead of empty card chrome. */
export function FullscreenNewsCardSkeleton({ className }: FullscreenNewsCardSkeletonProps) {
  return (
    <article
      className={cn(
        'relative flex h-[var(--feed-card-h,100dvh)] w-full snap-start snap-always flex-col overflow-hidden select-none',
        FEED_READER_SURFACE_CLASS,
        className
      )}
      aria-label="Yükleniyor..."
      aria-busy="true"
      data-feed-skeleton="true"
      data-testid="smart-feed-skeleton"
    >
      <FeedV2BrandLoader className="h-full min-h-0" />
    </article>
  )
}
