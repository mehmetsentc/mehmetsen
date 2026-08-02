'use client'

import Link from 'next/link'
import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { useCategoryDayLoadMore } from '@/hooks/useCategoryDayLoadMore'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { previousTurkeyDayFromPublishedAt } from '@/lib/turkeyCalendar'
import type { NewsItem } from '@/types/newsItem'

interface CategoryLoadMoreProps {
  categoryId: string
  /** Already shown in themed SSR layout — excluded from duplicates. */
  initialItems?: NewsItem[]
  initialBeforeDay: string
  initialHasMore?: boolean
}

/**
 * Mobile append-only day load-more under editorial landing.
 * Does not replace the opening themed composition.
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
        <div className="flex flex-col gap-5">
          {extraItems.map((item) => {
            const href = newsItemDetailHref(item)
            const image = item.imageUrl || FEED_FALLBACK_LOGO
            return (
              <article key={item.id}>
                <Link href={href} className="group block">
                  <div className="relative mx-0 mb-0 aspect-[16/9] w-full overflow-hidden rounded-[14px] bg-[rgb(var(--color-border))]">
                    <SafeNewsImage
                      src={image}
                      alt={item.title}
                      fill
                      sizes="100vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  </div>
                  <h3 className="mt-3 text-[1.125rem] font-extrabold leading-[1.3] text-[rgb(var(--color-text))] group-hover:underline">
                    {item.title}
                  </h3>
                </Link>
              </article>
            )
          })}
        </div>
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
