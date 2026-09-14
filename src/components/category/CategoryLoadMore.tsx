'use client'

import { MagazineNewsList } from '@/components/home/MagazineNewsList'
import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import { useCategoryDayLoadMore } from '@/hooks/useCategoryDayLoadMore'
import { previousTurkeyDayFromPublishedAt } from '@/lib/turkeyCalendar'
import type { NewsItem } from '@/types/newsItem'

interface CategoryLoadMoreProps {
  categoryId: string
  initialItems?: NewsItem[]
  initialBeforeDay: string
  initialHasMore?: boolean
}

/**
 * Mobile append-only day load-more under the magazine category landing.
 */
export function CategoryLoadMore({
  categoryId,
  initialItems = [],
  initialBeforeDay,
  initialHasMore = true,
}: CategoryLoadMoreProps) {
  const { extraItems, hasMore, loadingMore, loadMore } = useCategoryDayLoadMore({
    categoryId,
    initialBeforeDay,
    initialHasMore,
    excludeIds: initialItems.map((i) => i.id),
  })

  return (
    <div className="mt-2">
      {extraItems.length > 0 ? (
        <MagazineNewsList
          items={extraItems}
          priorityCount={0}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      ) : hasMore ? (
        <LoadMoreDayButton onClick={loadMore} loading={loadingMore} />
      ) : null}
    </div>
  )
}

export function categoryBeforeDayFromItems(items: NewsItem[]): string {
  const last = items[items.length - 1]
  return previousTurkeyDayFromPublishedAt(last?.publishedAt)
}
