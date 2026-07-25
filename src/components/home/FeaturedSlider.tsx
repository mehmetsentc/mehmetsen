'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { LCP_IMAGE_QUALITY, LCP_IMAGE_SIZES } from '@/lib/lcpImage'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

interface FeaturedSliderProps {
  items: NewsItem[]
  /** Desktop newspaper shell — contained, slightly shorter hero */
  variant?: 'default' | 'desktop'
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

export function FeaturedSlider({ items, variant = 'default' }: FeaturedSliderProps) {
  const slides = useMemo(() => items.slice(0, 8), [items])
  const isDesktop = variant === 'desktop'
  const [current, setCurrent] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  /** Delay neighbour slides so LCP only contends with slide 0. */
  const [extrasReady, setExtrasReady] = useState(false)
  const touchStartX = useRef<number | null>(null)

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
      setTimeout(() => setTransitioning(false), 500)
    },
    [slides.length, transitioning]
  )

  const next = useCallback(() => goTo(current + 1), [current, goTo])
  const prev = useCallback(() => goTo(current - 1), [current, goTo])

  if (slides.length === 0) return null

  const item = slides[current]
  const visible = extrasReady ? visibleSlideIndexes(current, slides.length) : [current]

  return (
    <section
      aria-label="Öne Çıkan Haberler"
      className={isDesktop ? undefined : 'home-section'}
    >
      <div className={isDesktop ? undefined : 'home-full-bleed md:home-contained'}>
        <div
          className={`relative overflow-hidden ${isDesktop ? 'rounded-2xl' : 'rounded-none md:rounded-2xl'}`}
          style={{
            height: isDesktop ? 'clamp(18rem, 36vh, 28rem)' : 'clamp(22rem, 62vw, 38rem)',
          }}
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
                className={`absolute inset-0 transition-opacity duration-500 ${
                  isActive ? 'z-10 opacity-100' : 'z-0 opacity-0'
                }`}
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
                    className="object-cover object-center"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/5" />
              </div>
            )
          })}

          {slides.length > 1 && (
            <button
              type="button"
              aria-label="Önceki"
              onClick={prev}
              className="absolute left-3 top-1/2 z-20 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/75 active:scale-95 md:left-4 md:h-11 md:w-11"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {slides.length > 1 && (
            <button
              type="button"
              aria-label="Sonraki"
              onClick={next}
              className="absolute right-3 top-1/2 z-20 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/75 active:scale-95 md:right-4 md:h-11 md:w-11"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          <Link
            href={newsItemDetailHref(item)}
            className="absolute inset-0 z-10 flex flex-col justify-end focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <div className="px-4 pb-4 pt-6 sm:px-6 sm:pb-5">
              <span className="mb-2.5 inline-flex items-center rounded-md bg-[rgb(var(--color-brand))] px-2.5 py-[5px] text-[10px] font-black uppercase tracking-widest text-white">
                {newsItemCategoryLabel(item)}
              </span>
              <h2 className="line-clamp-3 text-[1.5rem] font-black leading-[1.18] tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] sm:text-[1.85rem]">
                {item.title}
              </h2>
              {slides.length > 1 && (
                <div className="mt-3 flex items-center justify-center">
                  {slides.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Slayt ${i + 1}`}
                      aria-current={i === current}
                      onClick={(e) => {
                        e.preventDefault()
                        goTo(i)
                      }}
                      className="flex h-7 w-7 items-center justify-center"
                    >
                      <span
                        className={`rounded-full transition-all duration-300 ${
                          i === current
                            ? 'h-2.5 w-2.5 bg-white scale-110'
                            : 'h-2 w-2 bg-white/40'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Link>
        </div>
      </div>
    </section>
  )
}
