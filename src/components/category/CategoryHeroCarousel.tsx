'use client'

import { useMemo } from 'react'
import {
  FeaturedNewsCarousel,
  type FeaturedCarouselSlide,
} from '@/components/news/FeaturedNewsCarousel'
import { getCategoryLabel } from '@/lib/newsMapper'
import {
  categoryPostHref,
  categoryPostImage,
} from '@/components/home/desktop/categoryPostUtils'
import type { TimelinePost } from '@/types/post'

interface CategoryHeroCarouselProps {
  posts: TimelinePost[]
  /** Kept for API compat; brand red dots are used for the indicator. */
  accentRgb?: string
  priority?: boolean
  limit?: number
}

function postKicker(post: TimelinePost): string {
  const spot = typeof post.spot === 'string' ? post.spot.trim() : ''
  if (spot) return spot.slice(0, 110)
  const summary = typeof post.summary === 'string' ? post.summary.trim() : ''
  if (summary) return summary.slice(0, 110)
  return getCategoryLabel(post.categoryId) || 'NaHaber'
}

/** Category page featured carousel — same look as homepage. */
export function CategoryHeroCarousel({
  posts,
  priority = false,
  limit = 20,
}: CategoryHeroCarouselProps) {
  const slides = useMemo<FeaturedCarouselSlide[]>(
    () =>
      posts.slice(0, limit).map((post) => ({
        id: post.id,
        href: categoryPostHref(post),
        title: post.title,
        kicker: postKicker(post),
        imageUrl: categoryPostImage(post) || undefined,
      })),
    [posts, limit]
  )

  if (slides.length === 0) return null

  return (
    <FeaturedNewsCarousel
      slides={slides}
      label="Öne çıkan haberler"
      limit={limit}
      priority={priority}
      className="category-featured-carousel"
    />
  )
}
