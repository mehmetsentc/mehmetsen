'use client'

import { useState, useCallback } from 'react'
import { MobileFeedCardNews } from '@/components/feed/MobileFeedCard'
import { CategoryNav, type CategoryNavItem } from '@/components/layout/CategoryNav'
import type { NewsItem } from '@/types/newsItem'
import type { CityCategory } from '@/services/cityNewsService.server'

interface CityFeedClientProps {
  citySlug: string
  initialItems: NewsItem[]
  categories: CityCategory[]
}

export function CityFeedClient({ citySlug, initialItems, categories }: CityFeedClientProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [items, setItems] = useState(initialItems)
  const [loading, setLoading] = useState(false)

  const handleCategorySelect = useCallback(
    async (categoryId: string | null) => {
      setActiveCategory(categoryId)

      if (!categoryId) {
        setItems(initialItems)
        return
      }

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

  const navItems: CategoryNavItem[] = [
    { id: '__all', label: 'Tümü', href: '/' },
    ...categories.map((cat) => ({
      id: cat.id,
      label: cat.name,
      href: `/kategori/${cat.slug}`,
    })),
  ]

  return (
    <div className="home-feed mx-auto w-full max-w-3xl pb-6 max-md:pb-10 max-md:pt-4">
      <CategoryNav
        categories={navItems}
        onCategorySelect={handleCategorySelect}
        activeCategoryId={activeCategory}
      />

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
