'use client'

import { MagazineNewsList } from '@/components/home/MagazineNewsList'
import { DesktopCategoryCard } from '@/components/home/desktop/DesktopCategoryCard'
import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import { useCategoryDayLoadMore } from '@/hooks/useCategoryDayLoadMore'
import { previousTurkeyDayFromPublishedAt } from '@/lib/turkeyCalendar'
import type { NewsItem } from '@/types/newsItem'

interface CategoryLoadMoreProps {
  categoryId: string
  initialItems?: NewsItem[]
  initialBeforeDay: string
  initialHasMore?: boolean
  /** Desktop portal uses a 4-up grid; mobile magazine landing stays default. */
  layout?: 'magazine' | 'desktop-grid'
}

/**
 * Mobile append-only day load-more under the magazine category landing.
 */
export function CategoryLoadMore({
  categoryId,
  initialItems = [],
  initialBeforeDay,
  initialHasMore = true,
  layout = 'magazine',
}: CategoryLoadMoreProps) {
  const { extraItems, hasMore, loadingMore, loadMore } = useCategoryDayLoadMore({
    categoryId,
    initialBeforeDay,
    initialHasMore,
    excludeIds: initialItems.map((i) => i.id),
  })

  const extra =
    extraItems.length > 0 ? (
      layout === 'desktop-grid' ? (
        <div className="dcp-grid">
          {extraItems.map((item) => (
            <DesktopCategoryCard key={item.id} item={item} />
          ))}
          {hasMore ? (
            <div className="dcp-grid__more">
              <LoadMoreDayButton onClick={loadMore} loading={loadingMore} />
            </div>
          ) : null}
        </div>
      ) : (
        <MagazineNewsList
          items={extraItems}
          priorityCount={0}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      )
    ) : hasMore ? (
      <LoadMoreDayButton onClick={loadMore} loading={loadingMore} />
    ) : null

  return <div className="mt-2">{extra}</div>
}

export function categoryBeforeDayFromItems(items: NewsItem[]): string {
  const last = items[items.length - 1]
  return previousTurkeyDayFromPublishedAt(last?.publishedAt)
}
