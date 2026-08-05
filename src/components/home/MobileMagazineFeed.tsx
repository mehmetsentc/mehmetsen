'use client'

import { MobileFeedCardNews } from '@/components/feed/MobileFeedCard'
import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import type { NewsItem } from '@/types/newsItem'

interface MobileMagazineFeedProps {
  items: NewsItem[]
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
}

/** Mobile home Akış: SonDakika-style dot+clock → title → full-width image. */
export function MobileMagazineFeed({
  items,
  loadingMore,
  hasMore,
  onLoadMore,
}: MobileMagazineFeedProps) {
  if (items.length === 0 && !loadingMore) return null

  return (
    <div className="sd-feed">
      {items.map((item, i) => (
        <MobileFeedCardNews key={item.id} item={item} priority={i === 0} />
      ))}

      {loadingMore ? (
        <>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="sd-feed__skeleton">
              <div className="sd-feed__skeleton-time animate-pulse bg-[rgb(var(--color-border))]" />
              <div className="sd-feed__skeleton-title animate-pulse bg-[rgb(var(--color-border))]" />
              <div className="sd-feed__skeleton-media animate-pulse bg-[rgb(var(--color-border))]" />
            </div>
          ))}
        </>
      ) : null}

      {hasMore && onLoadMore ? (
        <LoadMoreDayButton onClick={onLoadMore} loading={loadingMore} />
      ) : null}
    </div>
  )
}
