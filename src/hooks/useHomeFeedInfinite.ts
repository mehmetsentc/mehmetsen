'use client'

import { useCallback, useState } from 'react'
import { previousTurkeyDayFromPublishedAt } from '@/lib/turkeyCalendar'
import type { NewsItem } from '@/types/newsItem'

interface FeedDayResponse {
  items: NewsItem[]
  day: string | null
  prevDay: string | null
  hasMore: boolean
}

function seedBeforeDay(items: NewsItem[]): string {
  const last = items[items.length - 1]
  return previousTurkeyDayFromPublishedAt(last?.publishedAt)
}

export function useHomeFeedInfinite(initialItems: NewsItem[]) {
  const [items, setItems] = useState<NewsItem[]>(initialItems)
  const [beforeDay, setBeforeDay] = useState<string | null>(() => seedBeforeDay(initialItems))
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [seenIds] = useState(() => new Set(initialItems.map((i) => i.id)))

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !beforeDay) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ beforeDay })
      const res = await fetch(`/api/feed/more?${params}`)
      if (!res.ok) throw new Error('feed more failed')

      const data = (await res.json()) as FeedDayResponse
      const fresh = data.items.filter((item) => !seenIds.has(item.id))
      fresh.forEach((item) => seenIds.add(item.id))

      if (fresh.length > 0) {
        setItems((prev) => [...prev, ...fresh])
      }

      setBeforeDay(data.prevDay)
      setHasMore(Boolean(data.hasMore && data.prevDay))
    } catch {
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }, [beforeDay, hasMore, loadingMore, seenIds])

  return { items, loadingMore, hasMore, loadMore }
}
