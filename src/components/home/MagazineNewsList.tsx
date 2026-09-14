'use client'

import { HomeMagazineCard } from '@/components/home/HomeMagazineCard'
import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import type { NewsItem } from '@/types/newsItem'

type MagazineNewsListProps = {
  items: NewsItem[]
  priorityCount?: number
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
}

export function MagazineNewsList({
  items,
  priorityCount = 2,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
}: MagazineNewsListProps) {
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: onLoadMore ?? (() => undefined),
    hasMore: Boolean(hasMore && onLoadMore),
    loading: Boolean(loadingMore),
    rootMargin: '560px',
  })

  if (items.length === 0 && !loadingMore) return null

  return (
    <div className="mag-feed" data-testid="magazine-news-list">
      {items.map((item, index) => (
        <HomeMagazineCard key={item.id} item={item} priority={index < priorityCount} />
      ))}
      {loadingMore
        ? [0, 1].map((i) => (
            <div key={`mag-sk-${i}`} className="mag-card mag-card--skeleton" aria-hidden>
              <div className="mag-card__media animate-pulse bg-[rgb(var(--color-border))]" />
              <div className="mag-card__copy">
                <div className="h-5 w-4/5 rounded bg-[rgb(var(--color-border))]" />
              </div>
            </div>
          ))
        : null}
      {hasMore && onLoadMore ? (
        <div ref={sentinelRef} className="h-8 w-full" aria-hidden />
      ) : null}
      {hasMore && onLoadMore ? (
        <LoadMoreDayButton onClick={onLoadMore} loading={loadingMore} label="Daha fazla haber" />
      ) : null}
    </div>
  )
}
