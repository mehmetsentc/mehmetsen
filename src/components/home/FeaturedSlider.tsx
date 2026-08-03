'use client'

import { useMemo } from 'react'
import {
  FeaturedNewsCarousel,
  type FeaturedCarouselSlide,
} from '@/components/news/FeaturedNewsCarousel'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import { HOME_FEATURED_LIMIT, type NewsItem } from '@/types/newsItem'

interface FeaturedSliderProps {
  items: NewsItem[]
}

/** Homepage featured rail — maps NewsItem → shared FeaturedNewsCarousel. */
export function FeaturedSlider({ items }: FeaturedSliderProps) {
  const slides = useMemo<FeaturedCarouselSlide[]>(
    () =>
      items.slice(0, HOME_FEATURED_LIMIT).map((item) => ({
        id: item.id,
        href: newsItemDetailHref(item),
        title: item.title,
        kicker: item.description?.trim() || newsItemCategoryLabel(item),
        imageUrl: item.imageUrl,
      })),
    [items]
  )

  return (
    <div className="home-section max-md:!mb-7 max-md:!px-0">
      <div className="home-full-bleed md:home-contained max-md:!mx-0 max-md:!w-full">
        <FeaturedNewsCarousel
          slides={slides}
          label="Öne Çıkan Haberler"
          showTitle
          limit={HOME_FEATURED_LIMIT}
          priority
        />
      </div>
    </div>
  )
}
