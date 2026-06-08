'use client'

import { useEffect, useRef, useCallback } from 'react'

interface UseInfiniteScrollOptions {
  onLoadMore: () => void
  hasMore: boolean
  loading: boolean
  rootMargin?: string
  threshold?: number
}

export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  loading,
  rootMargin = '400px',
  threshold = 0.1,
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) onLoadMore()
  }, [loading, hasMore, onLoadMore])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadMore()
      },
      { rootMargin, threshold }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [handleLoadMore, rootMargin, threshold])

  return { sentinelRef }
}

interface UseActiveSnapItemOptions {
  onActiveChange?: (index: number) => void
  itemCount?: number
  suspend?: boolean
}

export function useActiveSnapItem({
  onActiveChange,
  itemCount = 0,
  suspend = false,
}: UseActiveSnapItemOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const setItemRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) itemRefs.current.set(index, el)
    else itemRefs.current.delete(index)
  }, [])

  useEffect(() => {
    if (suspend) return

    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        let best: { index: number; ratio: number } | null = null

        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.index)
          if (Number.isNaN(index)) continue
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { index, ratio: entry.intersectionRatio }
          }
        }

        if (best && best.ratio >= 0.5) {
          onActiveChange?.(best.index)
        }
      },
      { root: container, threshold: [0.25, 0.5, 0.75, 1] }
    )

    itemRefs.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [onActiveChange, itemCount, suspend])

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const el = itemRefs.current.get(index)
    if (!el) return false
    el.scrollIntoView({ behavior, block: 'start' })
    return true
  }, [])

  return { containerRef, setItemRef, scrollToIndex }
}
