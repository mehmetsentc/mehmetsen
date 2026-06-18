'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

interface FeaturedSliderProps {
  items: NewsItem[]
}

const AUTOPLAY_MS = 5500

export function FeaturedSlider({ items }: FeaturedSliderProps) {
  const [current, setCurrent] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartX = useRef<number | null>(null)

  const goTo = useCallback(
    (idx: number) => {
      if (items.length === 0 || transitioning) return
      setTransitioning(true)
      setCurrent((idx + items.length) % items.length)
      setTimeout(() => setTransitioning(false), 600)
    },
    [items.length, transitioning]
  )

  const next = useCallback(() => goTo(current + 1), [current, goTo])

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (items.length < 2) return
    timerRef.current = setInterval(next, AUTOPLAY_MS)
  }, [items.length, next])

  useEffect(() => {
    resetTimer()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [resetTimer])

  if (items.length === 0) return null

  const item = items[current]

  return (
    <section aria-label="Öne Çıkan Haberler" className="home-section">
      <div className="home-full-bleed md:home-contained">
        {/* ── Hero kart ── */}
        <div
          className="relative overflow-hidden rounded-none md:rounded-2xl"
          style={{ height: 'clamp(18rem, 52vw, 28rem)' }}
          onTouchStart={(e) => { touchStartX.current = e.touches[0]?.clientX ?? null }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null) return
            const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current
            if (Math.abs(dx) > 40) {
              resetTimer()
              goTo(dx < 0 ? current + 1 : current - 1)
            }
            touchStartX.current = null
          }}
        >
          {/* Slides */}
          {items.map((s, index) => {
            const image = s.imageUrl || FEED_FALLBACK_LOGO
            const isActive = index === current
            return (
              <div
                key={s.id}
                className={`absolute inset-0 transition-opacity duration-700 ${
                  isActive ? 'z-10 opacity-100' : 'z-0 opacity-0'
                }`}
                aria-hidden={!isActive}
              >
                {/* Background image with subtle zoom */}
                <div
                  className={`absolute inset-0 transition-transform duration-[6000ms] ease-out ${
                    isActive ? 'scale-[1.04]' : 'scale-100'
                  }`}
                >
                  <SafeNewsImage
                    src={image}
                    alt={s.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 800px"
                    priority={index === 0}
                    className="object-cover"
                  />
                </div>

                {/* Deep gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/10" />
                {/* Side vignette */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />

                {/* Content */}
                <Link
                  href={newsItemDetailHref(s)}
                  className="absolute inset-0 flex flex-col justify-end focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  tabIndex={isActive ? 0 : -1}
                >
                  <div className="px-4 pb-5 sm:px-6 sm:pb-7">
                    {/* Category badge */}
                    <span className="mb-3 inline-flex items-center rounded-md bg-[rgb(var(--color-brand))] px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-white shadow-sm">
                      {newsItemCategoryLabel(s)}
                    </span>

                    {/* Headline */}
                    <h2 className="line-clamp-3 text-[1.45rem] font-black leading-[1.2] tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] sm:text-[1.8rem]">
                      {s.title}
                    </h2>

                    {/* Progress bar */}
                    {items.length > 1 && (
                      <div className="mt-4 flex gap-1.5">
                        {items.map((_, i) => (
                          <div
                            key={i}
                            className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25"
                          >
                            <div
                              className={`h-full rounded-full bg-white transition-all ${
                                i < current
                                  ? 'w-full'
                                  : i === current
                                    ? 'w-full animate-[progress_5.5s_linear_forwards]'
                                    : 'w-0'
                              }`}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              </div>
            )
          })}

          {/* Dot indicators — overlay bottom right */}
          {items.length > 1 && (
            <div className="absolute bottom-5 right-4 z-20 flex gap-1.5 sm:right-6">
              {items.map((s, index) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Slayt ${index + 1}`}
                  onClick={() => { resetTimer(); goTo(index) }}
                  className={`rounded-full transition-all duration-300 ${
                    index === current
                      ? 'h-2 w-5 bg-white'
                      : 'h-2 w-2 bg-white/40 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
