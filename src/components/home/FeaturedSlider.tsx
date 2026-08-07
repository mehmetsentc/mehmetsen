'use client'

import { useMemo } from 'react'
import {
  FeaturedNewsCarousel,
  type FeaturedCarouselSlide,
} from '@/components/news/FeaturedNewsCarousel'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import { getCarouselManset } from '@/lib/carouselManset'
import { FEATURED_CAROUSEL_LIMIT, type NewsItem } from '@/types/newsItem'

interface FeaturedSliderProps {
  items: NewsItem[]
  /** True when items are CMS-pinned featured; false when latest-news fallback. */
  isFeatured?: boolean
}

/** Homepage featured rail — maps NewsItem → shared FeaturedNewsCarousel. */
export function FeaturedSlider({ items, isFeatured = true }: FeaturedSliderProps) {
  const slides = useMemo<FeaturedCarouselSlide[]>(
    () =>
      items.slice(0, FEATURED_CAROUSEL_LIMIT).map((item) => ({
        id: item.id,
        href: newsItemDetailHref(item),
        title: item.title,
        manset: getCarouselManset(item.title, item.seoTitle),
        kicker: item.description?.trim() || newsItemCategoryLabel(item),
        imageUrl: item.imageUrl,
      })),
    [items]
  )

  const title = isFeatured ? 'Öne Çıkan' : 'Manşet'

  return (
    <div className="home-section max-md:!mb-7 max-md:!px-0">
      <div className="home-full-bleed md:home-contained max-md:!mx-0 max-md:!w-full">
        <FeaturedNewsCarousel
          slides={slides}
          label={title}
          showTitle
          limit={FEATURED_CAROUSEL_LIMIT}
          priority
        />
      </div>
    </div>
  )
}
