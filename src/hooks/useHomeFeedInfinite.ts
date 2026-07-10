'use client'

import { useCallback, useRef, useState } from 'react'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import type { NewsItem } from '@/types/newsItem'

const PAGE_SIZE = 8

interface FeedMoreResponse {
  items: NewsItem[]
  nextCursor: string | null
  hasMore: boolean
}

function getLastCursor(items: NewsItem[]): string | null {
  const last = items[items.length - 1]
  if (!last) return null
  const ts = Date.parse(last.publishedAt ?? last.createdAt ?? '')
  return Number.isFinite(ts) ? String(ts) : null
}

export function useHomeFeedInfinite(initialItems: NewsItem[]) {
  const [items, setItems] = useState<NewsItem[]>(initialItems)
  const [cursor, setCursor] = useState<string | null>(() => getLastCursor(initialItems))
  const [hasMore, setHasMore] = useState(initialItems.length >= PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  const seenIds = useRef(new Set(initialItems.map((i) => i.id)))

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (cursor) params.set('cursor', cursor)

      const res = await fetch(`/api/feed/more?${params}`)
      if (!res.ok) throw new Error('feed more failed')

      const data = (await res.json()) as FeedMoreResponse
      const fresh = data.items.filter((item) => !seenIds.current.has(item.id))
      fresh.forEach((item) => seenIds.current.add(item.id))

      if (fresh.length > 0) {
        setItems((prev) => [...prev, ...fresh])
      }
      setCursor(data.nextCursor)
      setHasMore(data.hasMore)
    } catch {
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, hasMore, loadingMore])

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: () => void loadMore(),
    hasMore,
    loading: loadingMore,
    requireUserScroll: true,
  })

  return { items, loadingMore, hasMore, sentinelRef, loadMore }
}
