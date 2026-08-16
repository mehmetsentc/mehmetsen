'use client'

import { useMemo } from 'react'
import { CategoryHeroCarousel } from '@/components/category/CategoryHeroCarousel'
import { pickCityFeaturedCarouselItems } from '@/lib/featuredScope'
import { FEATURED_CAROUSEL_LIMIT } from '@/types/newsItem'
import type { TimelinePost } from '@/types/post'

interface LocalFeaturedCarouselProps {
  posts: TimelinePost[]
  citySlug?: string | null
  priority?: boolean
  className?: string
}

/**
 * Swipeable Öne Çıkan on /yerel/[city] pages.
 * Uses Yerelde öne çıkan pins when any exist; otherwise the latest 10 stories.
 */
export function LocalFeaturedCarousel({
  posts,
  citySlug,
  priority = false,
  className,
}: LocalFeaturedCarouselProps) {
  const slides = useMemo(() => {
    const slug = citySlug?.trim()
    if (!slug || posts.length === 0) return []
    return pickCityFeaturedCarouselItems(posts, slug, FEATURED_CAROUSEL_LIMIT)
  }, [posts, citySlug])

  if (slides.length === 0) return null

  return (
    <div className={className}>
      <CategoryHeroCarousel posts={slides} priority={priority} limit={FEATURED_CAROUSEL_LIMIT} />
    </div>
  )
}
