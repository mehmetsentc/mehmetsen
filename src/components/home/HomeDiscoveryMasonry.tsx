'use client'

import { HomeDiscoveryCard, type HomeDiscoveryItem } from '@/components/home/HomeDiscoveryCard'
import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { cn } from '@/lib/utils'

type HomeDiscoveryMasonryProps = {
  items: HomeDiscoveryItem[]
  featuredCount?: number
  priorityCount?: number
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  navSource?: 'featured' | 'feed' | 'category'
  className?: string
}

/**
 * Visual discovery wall — reuses AdaptiveMasonry CSS columns
 * (`.exp-masonry`) with a denser `--discovery` modifier. No extra JS layout lib.
 */
export function HomeDiscoveryMasonry({
  items,
  featuredCount = 0,
  priorityCount = 4,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  navSource = 'feed',
  className,
}: HomeDiscoveryMasonryProps) {
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: onLoadMore ?? (() => undefined),
    hasMore: Boolean(hasMore && onLoadMore),
    loading: Boolean(loadingMore),
    rootMargin: '560px',
  })

  const hrefs = items.map((item) => item.href)

  return (
    <div className={cn('home-discovery', className)}>
      <div
        className="exp-masonry exp-masonry--discovery"
        role="feed"
        aria-label="Görsel haber keşfi"
        data-testid="home-discovery-masonry"
      >
        {items.map((item, index) => (
          <HomeDiscoveryCard
            key={item.id}
            item={item}
            index={index}
            featured={index < featuredCount}
            priority={index < priorityCount}
            hrefs={hrefs}
            navSource={index < featuredCount ? 'featured' : navSource}
          />
        ))}
        {loadingMore
          ? [0, 1, 2, 3].map((i) => (
              <div
                key={`sk-${i}`}
                className="exp-slot home-discovery-slot home-discovery-skeleton"
                aria-hidden
              >
                <div
                  className="home-discovery-card home-discovery-card--skeleton"
                  style={{ aspectRatio: i % 2 === 0 ? '4 / 5' : '3 / 4' }}
                />
              </div>
            ))
          : null}
      </div>
      {hasMore && onLoadMore ? (
        <div ref={sentinelRef} className="h-8 w-full" aria-hidden />
      ) : null}
      {hasMore && onLoadMore ? (
        <LoadMoreDayButton onClick={onLoadMore} loading={loadingMore} label="Daha fazla haber" />
      ) : null}
    </div>
  )
}
