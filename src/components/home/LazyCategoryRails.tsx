'use client'

import { useEffect, useMemo, useState } from 'react'
import { CategoryRail } from '@/components/home/CategoryRail'
import { LazySection } from '@/components/home/LazySection'
import { getCategoryLabel } from '@/lib/newsMapper'
import {
  HOME_CATEGORY_RAILS,
  HOME_FEED_SSR_RAILS,
  type HomeCategorySlug,
  type NewsItem,
} from '@/types/newsItem'

interface LazyCategoryRailsProps {
  initialRails: Partial<Record<HomeCategorySlug, NewsItem[]>>
}

/**
 * SSR rayları hemen; kalan kategoriler kısa gecikmeyle tek pool-cached API çağrısıyla.
 */
export function LazyCategoryRails({ initialRails }: LazyCategoryRailsProps) {
  const [extraRails, setExtraRails] = useState<Partial<Record<HomeCategorySlug, NewsItem[]>>>({})

  const missingKey = useMemo(
    () =>
      HOME_CATEGORY_RAILS.filter(
        (id) => !HOME_FEED_SSR_RAILS.includes(id) && !(initialRails[id]?.length)
      ).join(','),
    [initialRails]
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
          /* optional */
        }
      })()
    }, 2500)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [missingKey])

  const merged: Partial<Record<HomeCategorySlug, NewsItem[]>> = {
    ...extraRails,
    ...initialRails,
  }

  return (
    <>
      {HOME_CATEGORY_RAILS.map((categoryId) => {
        const items = merged[categoryId]
        if (!items?.length) return null
        return (
          <LazySection key={categoryId} minHeight={260}>
            <CategoryRail
              categoryId={categoryId}
              title={getCategoryLabel(categoryId)}
              items={items}
            />
          </LazySection>
        )
      })}
    </>
  )
}
