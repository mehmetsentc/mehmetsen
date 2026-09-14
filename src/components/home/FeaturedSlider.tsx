'use client'

import { useCallback, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  HomeDiscoveryCard,
  newsItemToDiscovery,
} from '@/components/home/HomeDiscoveryCard'
import { getCarouselManset } from '@/lib/carouselManset'
import { FEATURED_CAROUSEL_LIMIT, type NewsItem } from '@/types/newsItem'
import { cn } from '@/lib/utils'

interface FeaturedSliderProps {
  items: NewsItem[]
  /** True when items are CMS-pinned featured; false when latest-news fallback. */
  isFeatured?: boolean
  /** Card cap — homepage hikaye altı 20, kategori manşet 10. */
  limit?: number
}

/**
 * Homepage Öne Çıkanlar — photo + red kicker + black title band + pagination dots.
 * Ranking/order comes from pickHomeFeedFeaturedPins; this is presentation only.
 */
export function FeaturedSlider({
  items,
  isFeatured = true,
  limit = FEATURED_CAROUSEL_LIMIT,
}: FeaturedSliderProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const cards = items.slice(0, limit).map((item) => {
    const discovery = newsItemToDiscovery(item)
    return {
      ...discovery,
      title: getCarouselManset(item.title, item.seoTitle),
    }
  })
  const hrefs = cards.map((card) => card.href)
  const title = isFeatured ? 'Öne Çıkanlar' : 'Manşet'

  const onScroll = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const width = scroller.clientWidth || 1
    const next = Math.round(scroller.scrollLeft / width)
    setActive(Math.max(0, Math.min(next, cards.length - 1)))
  }, [cards.length])

  const goTo = useCallback((index: number) => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const width = scroller.clientWidth || 1
    scroller.scrollTo({ left: index * width, behavior: 'smooth' })
  }, [])

  const goBy = useCallback(
    (delta: number) => {
      if (cards.length < 2) return
      goTo((active + delta + cards.length) % cards.length)
    },
    [active, cards.length, goTo]
  )

  if (cards.length === 0) return null

  return (
    <section
      className="home-featured-rail home-featured-rail--headline"
      aria-label={title}
      data-testid="home-featured-rail"
    >
      <h2 className="sr-only">{title}</h2>
      <div className="home-featured-rail__stage">
        <div
          ref={scrollerRef}
          className="home-featured-rail__scroller"
          data-no-category-swipe
          data-testid="home-featured-rail-scroller"
          onScroll={onScroll}
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
                layout="headline"
                priority={index < 2}
                hrefs={hrefs}
                navSource="featured"
              />
            </div>
          ))}
        </div>
        {cards.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Önceki haber"
              className="home-featured-rail__nav home-featured-rail__nav--prev"
              onClick={() => goBy(-1)}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              aria-label="Sonraki haber"
              className="home-featured-rail__nav home-featured-rail__nav--next"
              onClick={() => goBy(1)}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </>
        ) : null}
      </div>
      {cards.length > 1 ? (
        <div
          className="home-featured-rail__dots"
          data-testid="home-featured-rail-dots"
          role="tablist"
          aria-label="Öne çıkanlar"
        >
          {cards.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-label={`${index + 1} / ${cards.length}`}
              aria-selected={index === active}
              className={cn(
                'home-featured-rail__dot',
                index === active && 'is-active'
              )}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
