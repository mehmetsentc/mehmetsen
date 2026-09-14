'use client'

import { useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  HomeDiscoveryCard,
  newsItemToDiscovery,
} from '@/components/home/HomeDiscoveryCard'
import { FEATURED_CAROUSEL_LIMIT, type NewsItem } from '@/types/newsItem'

interface FeaturedSliderProps {
  items: NewsItem[]
  /** True when items are CMS-pinned featured; false when latest-news fallback. */
  isFeatured?: boolean
  /** Card cap — homepage hikaye altı 20, kategori manşet 10. */
  limit?: number
}

/**
 * Homepage Öne Çıkanlar — equal-size horizontal rail.
 * Ranking/order comes from pickHomeFeedFeaturedPins; this is presentation only.
 */
export function FeaturedSlider({
  items,
  isFeatured = true,
  limit = FEATURED_CAROUSEL_LIMIT,
}: FeaturedSliderProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const cards = items.slice(0, limit).map(newsItemToDiscovery)
  const hrefs = cards.map((card) => card.href)
  const title = isFeatured ? 'Öne Çıkanlar' : 'Manşet'

  const scrollByCard = useCallback((direction: 1 | -1) => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const card = scroller.querySelector<HTMLElement>('[data-testid="home-featured-rail-card"]')
    const gap = 10
    const delta = (card?.offsetWidth ?? Math.round(scroller.clientWidth * 0.72)) + gap
    scroller.scrollBy({ left: direction * delta, behavior: 'smooth' })
  }, [])

  if (cards.length === 0) return null

  return (
    <section
      className="home-featured-rail"
      aria-label={title}
      data-testid="home-featured-rail"
    >
      <div className="home-featured-rail__header">
        <p className="home-discovery-label">{title}</p>
        {cards.length > 1 ? (
          <div className="home-featured-rail__controls" aria-hidden={false}>
            <button
              type="button"
              className="home-featured-rail__nav"
              aria-label="Önceki öne çıkan"
              onClick={() => scrollByCard(-1)}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className="home-featured-rail__nav"
              aria-label="Sonraki öne çıkan"
              onClick={() => scrollByCard(1)}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        ) : null}
      </div>
      <div
        ref={scrollerRef}
        className="home-featured-rail__scroller"
        data-no-category-swipe
        data-testid="home-featured-rail-scroller"
      >
        {cards.map((item, index) => (
          <div
            key={item.id}
            className="home-featured-rail__card"
            data-testid="home-featured-rail-card"
          >
            <HomeDiscoveryCard
              item={item}
              index={index}
              featured
              layout="featuredRail"
              priority={index < 2}
              hrefs={hrefs}
              navSource="featured"
            />
          </div>
        ))}
      </div>
    </section>
  )
}
