'use client'

import { useState, useEffect } from 'react'
import { MobileFeedCardNews } from '@/components/feed/MobileFeedCard'
import { useCityCategoryFilter } from '@/store/cityCategoryContext'
import type { NewsItem } from '@/types/newsItem'

interface CityFeedClientProps {
  citySlug: string
  initialItems: NewsItem[]
}

export function CityFeedClient({ citySlug, initialItems }: CityFeedClientProps) {
  const { activeCategoryId } = useCityCategoryFilter()
  const [items, setItems] = useState(initialItems)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

  useEffect(() => {
    let cancelled = false

    async function loadCategory() {
      if (!activeCategoryId) {
        setItems(initialItems)
        return
      }

      setLoading(true)
      try {
        const res = await fetch(
          `/api/city/news?city=${encodeURIComponent(citySlug)}&category=${encodeURIComponent(activeCategoryId)}&limit=30`
        )
        if (!cancelled && res.ok) {
          const data = await res.json()
          setItems(data.items ?? [])
        }
      } catch (err) {
        console.warn('[CityFeed] category fetch failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadCategory()
    return () => {
      cancelled = true
    }
  }, [activeCategoryId, citySlug, initialItems])

  return (
    <div className="home-feed mx-auto w-full max-w-3xl pb-6 max-md:pb-10 max-md:pt-4">
      {loading ? (
        <div className="sd-feed">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="sd-feed__skeleton">
              <div className="sd-feed__skeleton-time animate-pulse bg-[rgb(var(--color-border))]" />
              <div className="sd-feed__skeleton-title animate-pulse bg-[rgb(var(--color-border))]" />
              <div className="sd-feed__skeleton-media animate-pulse bg-[rgb(var(--color-border))]" />
            </div>
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="sd-feed">
          {items.map((item, i) => (
            <MobileFeedCardNews key={item.id} item={item} priority={i === 0} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <p className="text-lg font-semibold text-[rgb(var(--color-text))]">
            Henüz haber yok
          </p>
          <p className="mt-1 text-sm text-[rgb(var(--color-text-secondary))]">
            Bu kategoride henüz haber bulunmuyor.
          </p>
        </div>
      )}
    </div>
  )
}
