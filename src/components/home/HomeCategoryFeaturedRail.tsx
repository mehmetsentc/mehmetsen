'use client'

import {
  HomeDiscoveryCard,
  newsItemToDiscovery,
} from '@/components/home/HomeDiscoveryCard'
import { getCategoryLabel } from '@/lib/newsMapper'
import type { HomeCategorySlug, NewsItem } from '@/types/newsItem'

type HomeCategoryFeaturedRailProps = {
  categoryId: HomeCategorySlug
  items: NewsItem[]
}

export function HomeCategoryFeaturedRail({
  categoryId,
  items,
}: HomeCategoryFeaturedRailProps) {
  if (items.length === 0) return null
  const label = getCategoryLabel(categoryId)
  const hrefs = items.map((item) => newsItemToDiscovery(item).href)

  return (
    <section
      className="home-category-featured-rail"
      aria-label={`${label} öne çıkanlar`}
      data-testid={`home-category-rail-${categoryId}`}
    >
      <p className="home-discovery-label">
        {label} · Öne çıkanlar
      </p>
      <div className="home-category-featured-rail__scroller">
        {items.map((item, index) => {
          const discovery = newsItemToDiscovery(item)
          return (
            <div
              key={item.id}
              className="home-category-featured-rail__card"
            >
              <HomeDiscoveryCard
                item={discovery}
                index={index}
                hrefs={hrefs}
                navSource="category"
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
