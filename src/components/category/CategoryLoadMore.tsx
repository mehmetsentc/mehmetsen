'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { previousTurkeyDayFromPublishedAt } from '@/lib/turkeyCalendar'
import type { NewsItem } from '@/types/newsItem'
import type { CategoryFeedPage } from '@/services/newsService.server'

interface CategoryLoadMoreProps {
  categoryId: string
  initialItems: NewsItem[]
  /** Turkey YMD to request on first click (day before SSR tail). */
  initialBeforeDay: string
  initialHasMore?: boolean
}

function NewsRow({ item }: { item: NewsItem }) {
  const href = newsItemDetailHref(item)
  const timeAgo = item.publishedAt
    ? formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: tr })
    : ''

  return (
    <Link
      href={href}
      className="flex gap-3 border-b border-[rgb(var(--color-border))] py-3 hover:bg-[rgb(var(--color-surface))] transition-colors px-1"
    >
      {item.imageUrl && (
        <div className="relative h-20 w-28 flex-shrink-0 overflow-hidden rounded-lg">
          <Image
            src={item.imageUrl}
            alt={item.title}
            fill
            className="object-cover"
            sizes="112px"
          />
        </div>
      )}
      <div className="flex flex-col justify-between min-w-0 py-0.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[rgb(var(--color-text))]">
          {item.title}
        </h3>
        {item.description && (
          <p className="mt-1 line-clamp-1 text-xs text-[rgb(var(--color-text-muted))]">
            {item.description}
          </p>
        )}
        <span className="mt-1 text-[11px] text-[rgb(var(--color-text-muted))]">{timeAgo}</span>
      </div>
    </Link>
  )
}

export function CategoryLoadMore({
  categoryId,
  initialItems,
  initialBeforeDay,
  initialHasMore = true,
}: CategoryLoadMoreProps) {
  const [items, setItems] = useState<NewsItem[]>(initialItems)
  const [beforeDay, setBeforeDay] = useState<string | null>(initialBeforeDay)
  const [hasMore, setHasMore] = useState(initialHasMore && Boolean(initialBeforeDay))
  const [isPending, startTransition] = useTransition()

  const loadMore = () => {
    if (!beforeDay || !hasMore) return
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ id: categoryId, beforeDay })
        const res = await fetch(`/api/feed/category?${params}`)
        if (!res.ok) return
        const data: CategoryFeedPage = await res.json()
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id))
          return [...prev, ...data.items.filter((i) => !seen.has(i.id))]
        })
        setBeforeDay(data.prevDay)
        setHasMore(Boolean(data.hasMore && data.prevDay))
      } catch {
        setHasMore(false)
      }
    })
  }

  return (
    <div>
      <div className="divide-y divide-[rgb(var(--color-border))]">
        {items.map((item) => (
          <NewsRow key={item.id} item={item} />
        ))}
      </div>

      {hasMore ? (
        <LoadMoreDayButton onClick={loadMore} loading={isPending} />
      ) : null}
    </div>
  )
}

export function categoryBeforeDayFromItems(items: NewsItem[]): string {
  const last = items[items.length - 1]
  return previousTurkeyDayFromPublishedAt(last?.publishedAt)
}
