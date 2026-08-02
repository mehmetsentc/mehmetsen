'use client'

import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import { DesktopMoreList } from '@/components/home/desktop/DesktopMoreList'
import { useCategoryDayLoadMore } from '@/hooks/useCategoryDayLoadMore'
import { previousTurkeyDayFromPublishedAt } from '@/lib/turkeyCalendar'
import type { NewsItem } from '@/types/newsItem'

interface CategoryLoadMoreProps {
  categoryId: string
  /** Already shown above (SSR themed layout) — not re-rendered here. */
  initialItems?: NewsItem[]
  initialBeforeDay: string
  initialHasMore?: boolean
}

/**
 * Append-only day load-more for category pages that already render SSR content
 * in the themed layout (mobile landing / desktop BBC).
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
    <div>
      {extraItems.length > 0 ? (
        <DesktopMoreList newsItems={extraItems} title="Daha fazla" loadingMore={loadingMore} />
      ) : null}

      {hasMore ? (
        <LoadMoreDayButton onClick={loadMore} loading={loadingMore} />
      ) : null}
    </div>
  )
}

export function categoryBeforeDayFromItems(items: NewsItem[]): string {
  const last = items[items.length - 1]
  return previousTurkeyDayFromPublishedAt(last?.publishedAt)
}
