'use client'

/**
 * Featured news carousel — homepage + category pages.
 * Reference: full-bleed image, yellow kicker, white uppercase headline,
 * square chevrons, red/gray dots BELOW the image.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { LCP_IMAGE_QUALITY, LCP_IMAGE_SIZES } from '@/lib/lcpImage'
import { cn } from '@/lib/utils'
import { FEATURED_CAROUSEL_LIMIT } from '@/types/newsItem'
import { usePageStateStore } from '@/store/pageStateStore'
import { saveArticleNav } from '@/lib/articleNavContext'

export type FeaturedCarouselSlide = {
  id: string
  href: string
  title: string
  /** Short punchy manşet for overlay — preferred over title when present. */
  manset?: string
  /** Yellow line above the headline (category / teaser). */
  kicker?: string
  imageUrl?: string
}

interface FeaturedNewsCarouselProps {
  slides: FeaturedCarouselSlide[]
  /** Accessible name for the section */
  label?: string
  /** Max slides (default 10 — tek satır pagination) */
  limit?: number
  /** Show section title row (“Öne Çıkan”) */
  showTitle?: boolean
  className?: string
  /** First slide gets LCP priority */
  priority?: boolean
}

function visibleIndexes(current: number, length: number): number[] {
  if (length <= 1) return [0]
  return [
    ...new Set([
      current,
      (current - 1 + length) % length,
      (current + 1) % length,
    ]),
  ]
}

export function FeaturedNewsCarousel({
  slides: rawSlides,
  label = 'Öne çıkan haberler',
  limit = FEATURED_CAROUSEL_LIMIT,
  showTitle = false,
  className,
  priority = true,
}: FeaturedNewsCarouselProps) {
  const slides = useMemo(() => rawSlides.slice(0, limit), [rawSlides, limit])
  const pathname = usePathname()
  const stateKey = `carousel:${pathname}`
  const getValue = usePageStateStore((s) => s.getValue)
  const setValue = usePageStateStore((s) => s.setValue)

  // Restore saved carousel index on mount (survives back-navigation)
  const savedIdx = getValue<number>(stateKey, 'idx') ?? 0
  const [current, setCurrent] = useState(() =>
    savedIdx < rawSlides.length ? savedIdx : 0
  )
  const [transitioning, setTransitioning] = useState(false)
  const [extrasReady, setExtrasReady] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const reduceMotion = useRef(false)

  useEffect(() => {
    reduceMotion.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  useEffect(() => {
    let idleId: number | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    const enable = () => setExtrasReady(true)
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(enable, { timeout: 3_000 })
    } else {
      timer = setTimeout(enable, 1_800)
    }
    return () => {
      if (idleId != null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timer) clearTimeout(timer)
    }
  }, [])

  // Keep index in range when slide list shrinks
  useEffect(() => {
    if (current >= slides.length && slides.length > 0) {
      setCurrent(0)
    }
  }, [slides.length, current])

  const goTo = useCallback(
    (idx: number) => {
      if (slides.length === 0 || transitioning) return
      setExtrasReady(true)
      setTransitioning(true)
      const next = (idx + slides.length) % slides.length
      setCurrent(next)
      setValue(stateKey, 'idx', next)
      setTimeout(() => setTransitioning(false), reduceMotion.current ? 0 : 450)
    },
    [slides.length, transitioning, stateKey, setValue]
  )

  const next = useCallback(() => goTo(current + 1), [current, goTo])
  const prev = useCallback(() => goTo(current - 1), [current, goTo])

  // Save nav context before navigating to an article
  const handleSlideClick = useCallback(
    (clickedIndex: number) => {
      saveArticleNav({
        hrefs: slides.map((s) => s.href),
        index: clickedIndex,
        source: 'featured',
      })
    },
    [slides]
  )

  if (slides.length === 0) return null

  const item = slides[current]!
  const visible = extrasReady ? visibleIndexes(current, slides.length) : [current]

  return (
    <section
      aria-label={label}
      className={cn('featured-news-carousel', className)}
    >
      {showTitle ? (
        <div className="home-rail-title mb-3 px-4 max-md:mb-4 md:px-0">
          <span className="home-rail-accent max-md:h-8 max-md:w-[5px]" aria-hidden />
          <p className="text-lg font-black text-[rgb(var(--color-text))] max-md:text-[1.65rem]">
            Öne Çıkan
          </p>
        </div>
      ) : null}

      <div className="featured-news-carousel__frame" data-no-category-swipe>
        <div
          className="featured-news-carousel__stage"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0]?.clientX ?? null
          }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null) return
            const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current
            if (Math.abs(dx) > 40) goTo(dx < 0 ? current + 1 : current - 1)
            touchStartX.current = null
          }}
        >
          {visible.map((index) => {
            const s = slides[index]!
            const image = s.imageUrl || FEED_FALLBACK_LOGO
            const isActive = index === current
            return (
              <div
                key={s.id}
                className={cn(
                  'featured-news-carousel__slide',
                  !reduceMotion.current && 'featured-news-carousel__slide--animate',
                  isActive ? 'is-active' : 'is-idle'
                )}
                aria-hidden={!isActive}
              >
                <SafeNewsImage
                  src={image}
                  alt={s.title}
                  fill
                  sizes={LCP_IMAGE_SIZES}
                  quality={index === 0 ? LCP_IMAGE_QUALITY : 70}
                  priority={Boolean(priority && index === 0 && current === 0)}
                  fetchPriority={
                    priority && index === 0 && current === 0 ? 'high' : 'auto'
                  }
                  className="featured-news-carousel__media object-center"
                />
                <div className="featured-news-carousel__scrim" aria-hidden />
              </div>
            )
          })}

          {slides.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Önceki haber"
                onClick={prev}
                className="featured-news-carousel__nav featured-news-carousel__nav--prev"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                aria-label="Sonraki haber"
                onClick={next}
                className="featured-news-carousel__nav featured-news-carousel__nav--next"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </>
          ) : null}

          <Link
            href={item.href}
            className="featured-news-carousel__link"
            onClick={() => handleSlideClick(current)}
          >
            <div className="featured-news-carousel__copy">
              {item.kicker ? (
                <p className="featured-news-carousel__kicker">{item.kicker}</p>
              ) : null}
              <h2
                className="featured-news-carousel__title"
                data-title-length={
                  (item.manset || item.title).length > 55
                    ? 'long'
                    : (item.manset || item.title).length > 40
                      ? 'medium'
                      : 'short'
                }
              >
                {item.manset || item.title}
              </h2>
            </div>
          </Link>
        </div>

        {/* Dots BELOW the image — red pill active / theme-aware inactive */}
        {slides.length > 1 ? (
          <div
            className="featured-news-carousel__dots"
            role="tablist"
            aria-label="Slayt seçimi"
          >
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-label={`Haber ${i + 1}`}
                aria-selected={i === current}
                onClick={() => goTo(i)}
                className={cn(
                  'featured-news-carousel__dot',
                  i === current && 'is-active'
                )}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
