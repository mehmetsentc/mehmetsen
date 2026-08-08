'use client'

import { useState, useCallback } from 'react'
import { CityCategoryChips } from './CityCategoryChips'
import { CityNewsItem } from './CityNewsItem'
import { CityNewsList } from './CityNewsList'
import type { NewsItem } from '@/types/newsItem'

interface CityFeedClientProps {
  citySlug: string
  initialItems: NewsItem[]
}

export function CityFeedClient({ citySlug, initialItems }: CityFeedClientProps) {
  const [activeChip, setActiveChip] = useState('tumu')
  const [items, setItems] = useState(initialItems)
  const [loading, setLoading] = useState(false)

  const handleCategorySelect = useCallback(
    async (chipId: string, categoryId: string | null) => {
      setActiveChip(chipId)

      if (chipId === 'tumu') {
        setItems(initialItems)
        return
      }

      if (chipId === 'video') {
        setItems(initialItems.filter((item) => item.videoUrl))
        return
      }

      if (!categoryId) return

      setLoading(true)
      try {
        const res = await fetch(
          `/api/city/news?city=${encodeURIComponent(citySlug)}&category=${encodeURIComponent(categoryId)}&limit=30`
        )
        if (res.ok) {
          const data = await res.json()
          setItems(data.items ?? [])
        }
      } catch (err) {
        console.warn('[CityFeed] category fetch failed:', err)
      } finally {
        setLoading(false)
      }
    },
    [citySlug, initialItems]
  )

  return (
    <div className="space-y-4">
      <CityCategoryChips activeId={activeChip} onSelect={handleCategorySelect} />

      {loading ? (
        <CityNewsList.Skeleton count={6} />
      ) : items.length > 0 ? (
        <div className="divide-y divide-[rgb(var(--color-border))]">
          {items.map((item, i) => (
            <CityNewsItem key={item.id} item={item} priority={i < 3} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <p className="text-sm text-[rgb(var(--color-text-secondary))]">
            Bu kategoride henüz haber yok.
          </p>
        </div>
      )}
    </div>
  )
}
