'use client'

import { useCallback, useState, useTransition } from 'react'
import type { NewsItem } from '@/types/newsItem'
import type { CategoryFeedPage } from '@/services/newsService.server'

/**
 * Day-scoped category pagination — loads one previous Turkey day per click.
 * Does not render UI; parent keeps themed SSR layout and appends extras.
 */
export function useCategoryDayLoadMore(options: {
  categoryId: string
  initialBeforeDay: string
  initialHasMore?: boolean
  excludeIds?: Iterable<string>
}) {
  const { categoryId, initialBeforeDay, initialHasMore = true, excludeIds } = options
  const [extraItems, setExtraItems] = useState<NewsItem[]>([])
  const [beforeDay, setBeforeDay] = useState<string | null>(initialBeforeDay)
  const [hasMore, setHasMore] = useState(initialHasMore && Boolean(initialBeforeDay))
  const [isPending, startTransition] = useTransition()
  const [seenIds] = useState(() => new Set(excludeIds ?? []))

  const loadMore = useCallback(() => {
    if (!beforeDay || !hasMore || isPending) return
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ id: categoryId, beforeDay })
        const res = await fetch(`/api/feed/category?${params}`)
        if (!res.ok) return
        const data = (await res.json()) as CategoryFeedPage
        const fresh = data.items.filter((i) => !seenIds.has(i.id))
        fresh.forEach((i) => seenIds.add(i.id))
        if (fresh.length > 0) {
          setExtraItems((prev) => [...prev, ...fresh])
        }
        setBeforeDay(data.prevDay)
        setHasMore(Boolean(data.hasMore && data.prevDay))
      } catch {
        setHasMore(false)
      }
    })
  }, [beforeDay, categoryId, hasMore, isPending, seenIds])

  return {
    extraItems,
    hasMore,
    loadingMore: isPending,
    loadMore,
  }
}
