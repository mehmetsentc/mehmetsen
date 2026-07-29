'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { LCP_IMAGE_QUALITY, LCP_IMAGE_SIZES } from '@/lib/lcpImage'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import { HOME_FEATURED_LIMIT, type NewsItem } from '@/types/newsItem'
import { cn } from '@/lib/utils'

interface FeaturedSliderProps {
  items: NewsItem[]
}

/** Only keep current ±1 slides in the DOM to avoid loading 8–20 full-bleed images. */
function visibleSlideIndexes(current: number, length: number): number[] {
  if (length <= 1) return [0]
  const set = new Set<number>([
    current,
    (current - 1 + length) % length,
    (current + 1) % length,
  ])
  return [...set]
}

export function FeaturedSlider({ items }: FeaturedSliderProps) {
  // Parent (HomeFeed) already prepares pins + fillers — do not re-filter featured.
  const slides = useMemo(() => items.slice(0, HOME_FEATURED_LIMIT), [items])
  const [current, setCurrent] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  /** Delay neighbour slides so LCP only contends with slide 0. */
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

  const goTo = useCallback(
    (idx: number) => {
      if (slides.length === 0 || transitioning) return
      setExtrasReady(true)
      setTransitioning(true)
      setCurrent((idx + slides.length) % slides.length)
      setTimeout(() => setTransitioning(false), reduceMotion.current ? 0 : 500)
    },
    [slides.length, transitioning]
  )

  const next = useCallback(() => goTo(current + 1), [current, goTo])
  const prev = useCallback(() => goTo(current - 1), [current, goTo])

  if (slides.length === 0) return null

  const item = slides[current]
  const visible = extrasReady ? visibleSlideIndexes(current, slides.length) : [current]
  const counter = `${String(current + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`

  return (
    <section aria-label="Öne Çıkan Haberler" className="home-section max-md:!mb-7 max-md:!px-0">
      <div className="home-rail-title mb-3 px-4 max-md:mb-4 md:px-0">
        <span className="home-rail-accent max-md:h-8 max-md:w-[5px]" aria-hidden />
        <p className="text-lg font-black text-[rgb(var(--color-text))] max-md:text-[1.65rem]">
          Öne Çıkan
        </p>
      </div>

      {/* Mobile: inset cinematic card. Tablet+: existing bleed/contained. */}
      <div className="home-full-bleed md:home-contained max-md:!mx-4 max-md:!w-[calc(100%-2rem)]">
        <div
          className={cn(
            'relative w-full max-w-full overflow-hidden',
            // Mobile: fixed cinematic height band (avoid aspect-ratio+min-height width blowout)
            'h-[clamp(340px,88vw,470px)] rounded-[18px]',
            // Tablet+ (still in HomeFeed under lg): previous denser ratio
            'md:aspect-[16/10] md:h-auto md:rounded-2xl'
          )}
          data-no-category-swipe
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
            const s = slides[index]
            const image = s.imageUrl || FEED_FALLBACK_LOGO
            const isActive = index === current
            return (
              <div
                key={s.id}
                className={cn(
                  'absolute inset-0',
                  !reduceMotion.current && 'transition-opacity duration-500',
                  isActive ? 'z-[1] opacity-100' : 'z-0 opacity-0'
                )}
                aria-hidden={!isActive}
              >
                <div className="absolute inset-0">
                  <SafeNewsImage
                    src={image}
                    alt={s.title}
                    fill
                    sizes={LCP_IMAGE_SIZES}
                    quality={index === 0 ? LCP_IMAGE_QUALITY : 70}
                    priority={index === 0 && current === 0}
                    fetchPriority={index === 0 && current === 0 ? 'high' : 'auto'}
                    className="object-cover object-center max-md:object-center md:object-top"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent max-md:from-black/80 max-md:via-black/25 md:from-black md:via-black/60 md:to-black/5" />
              </div>
            )
          })}

          {slides.length > 1 && (
            <button
              type="button"
              aria-label="Önceki"
              onClick={prev}
              className="absolute left-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60 active:scale-95 max-md:left-3.5 max-md:h-12 max-md:w-12 md:left-4"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {slides.length > 1 && (
            <button
              type="button"
              aria-label="Sonraki"
              onClick={next}
              className="absolute right-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60 active:scale-95 max-md:right-3.5 max-md:h-12 max-md:w-12 md:right-4"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          <Link
            href={newsItemDetailHref(item)}
            className="absolute inset-0 z-10 flex flex-col justify-end focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <div className="px-4 pb-5 pt-10 sm:px-6 max-md:px-5 max-md:pb-6 max-md:pt-16 md:pb-12">
              <span className="mb-2.5 inline-flex items-center rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider text-white max-md:mb-3">
                {newsItemCategoryLabel(item)}
              </span>
              <h2 className="line-clamp-3 text-[1.5rem] font-black leading-[1.12] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] max-md:text-[clamp(1.75rem,_7vw,_2.35rem)] max-md:leading-[1.08] sm:text-[1.85rem]">
                {item.title}
              </h2>
              {slides.length > 1 ? (
                <p
                  className="mt-3.5 text-[12px] font-semibold tabular-nums tracking-wide text-white/80 max-md:mt-4 max-md:text-[13px] md:hidden"
                  aria-live="polite"
                >
                  {counter}
                </p>
              ) : null}
            </div>
          </Link>

          {/* Tablet+: keep classic dots below headline (outside Link for valid HTML) */}
          {slides.length > 1 ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 hidden justify-center md:flex">
              <div className="pointer-events-auto flex items-center">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Slayt ${i + 1}`}
                    aria-current={i === current}
                    onClick={() => goTo(i)}
                    className="flex h-7 w-7 items-center justify-center"
                  >
                    <span
                      className={cn(
                        'rounded-full transition-all duration-300',
                        i === current ? 'h-2.5 w-2.5 scale-110 bg-white' : 'h-2 w-2 bg-white/40'
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
