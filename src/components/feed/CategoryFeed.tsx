'use client'

import { useMemo } from 'react'
import { CategoryBbcSection } from '@/components/category/CategoryBbcSection'
import { DesktopMoreList } from '@/components/home/desktop/DesktopMoreList'
import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import { useCategoryDayLoadMore } from '@/hooks/useCategoryDayLoadMore'
import { getCategoryAccent } from '@/constants/categoryTheme'
import { ROUTES } from '@/constants/routes'
import { previousTurkeyDayFromPublishedAt } from '@/lib/turkeyCalendar'
import type { TimelinePost } from '@/types/post'

interface CategoryFeedProps {
  categoryId: string
  initialPosts?: TimelinePost[]
}

/** Tablet category feed — BBC themed SSR block + day load-more archive. */
export function CategoryFeed({ categoryId, initialPosts = [] }: CategoryFeedProps) {
  const last = initialPosts[initialPosts.length - 1]
  const initialBeforeDay = previousTurkeyDayFromPublishedAt(
    last?.publishedAt == null
      ? undefined
      : typeof last.publishedAt === 'number'
        ? last.publishedAt
        : String(last.publishedAt)
  )

  const excludeIds = useMemo(() => initialPosts.map((p) => p.id), [initialPosts])
  const { extraItems, hasMore, loadingMore, loadMore } = useCategoryDayLoadMore({
    categoryId,
    initialBeforeDay,
    initialHasMore: initialPosts.length > 0,
    excludeIds,
  })

  const accentRgb = getCategoryAccent(categoryId).rgb
  const href = ROUTES.CATEGORY(categoryId)

  return (
    <div className="bbc-category-page">
      <CategoryBbcSection
        title="Öne çıkanlar"
        href={href}
        posts={initialPosts}
        showHeader={false}
        isFirstSection
        loading={false}
        loadingMore={loadingMore && extraItems.length === 0}
        accentRgb={accentRgb}
      />

      {extraItems.length > 0 ? (
        <DesktopMoreList
          newsItems={extraItems}
          title="Daha fazla"
          href={href}
          loadingMore={loadingMore}
        />
      ) : null}

      {hasMore ? (
        <LoadMoreDayButton onClick={loadMore} loading={loadingMore} />
      ) : null}
    </div>
  )
}
