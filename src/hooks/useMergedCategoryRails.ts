'use client'

import { useEffect, useMemo, useState } from 'react'
import type { HomeCategorySlug, NewsItem } from '@/types/newsItem'

/**
 * Merges SSR category rails with a deferred fetch for missing / thin categories.
 */
export function useMergedCategoryRails(
  initialRails: Partial<Record<HomeCategorySlug, NewsItem[]>>,
  ensureCategories: readonly HomeCategorySlug[],
  deferMs = 2500,
  minCount = 1
): Partial<Record<HomeCategorySlug, NewsItem[]>> {
  const [extraRails, setExtraRails] = useState<Partial<Record<HomeCategorySlug, NewsItem[]>>>({})

  const missingKey = useMemo(
    () =>
      ensureCategories
        .filter((id) => (initialRails[id]?.length ?? 0) < minCount)
        .join(','),
    [ensureCategories, initialRails, minCount]
  )

  useEffect(() => {
    if (!missingKey) return
    let cancelled = false

    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/feed/category-rails?cats=${missingKey}`)
          if (!res.ok || cancelled) return
          const data = (await res.json()) as {
            rails?: Partial<Record<HomeCategorySlug, NewsItem[]>>
          }
          if (!cancelled && data.rails) setExtraRails(data.rails)
        } catch {
          /* optional enrichment */
        }
      })()
    }, deferMs)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [missingKey, deferMs])

  return useMemo(() => {
    const merged: Partial<Record<HomeCategorySlug, NewsItem[]>> = { ...initialRails }
    for (const [key, items] of Object.entries(extraRails) as [
      HomeCategorySlug,
      NewsItem[] | undefined,
    ][]) {
      const current = merged[key]
      if (!current?.length || (items?.length ?? 0) > current.length) {
        merged[key] = items
      }
    }
    return merged
  }, [extraRails, initialRails])
}
