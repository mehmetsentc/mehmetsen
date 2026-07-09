'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

interface FeaturedSliderProps {
  items: NewsItem[]
}

export function FeaturedSlider({ items }: FeaturedSliderProps) {
  const [current, setCurrent] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const touchStartX = useRef<number | null>(null)

  const goTo = useCallback(
    (idx: number) => {
      if (items.length === 0 || transitioning) return
      setTransitioning(true)
      setCurrent((idx + items.length) % items.length)
      setTimeout(() => setTransitioning(false), 500)
    },
    [items.length, transitioning]
  )

  const next = useCallback(() => goTo(current + 1), [current, goTo])
  const prev = useCallback(() => goTo(current - 1), [current, goTo])

  if (items.length === 0) return null

  const item = items[current]

  return (
    <section aria-label="Öne Çıkan Haberler" className="home-section">
      <div className="home-full-bleed md:home-contained">
        <div
          className="relative overflow-hidden rounded-none md:rounded-2xl"
          style={{ height: 'clamp(22rem, 62vw, 38rem)' }}
          data-no-category-swipe
          onTouchStart={(e) => { touchStartX.current = e.touches[0]?.clientX ?? null }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null) return
            const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current
            if (Math.abs(dx) > 40) goTo(dx < 0 ? current + 1 : current - 1)
            touchStartX.current = null
          }}
        >
          {/* ── Slaytlar ── */}
          {items.map((s, index) => {
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
                {/* Görsel — hafif zoom animasyonu */}
                <div
                  className={`absolute inset-0 transition-transform duration-[6000ms] ease-out ${
                    isActive ? 'scale-[1.05]' : 'scale-100'
                  }`}
                >
                  <SafeNewsImage
                    src={image}
                    alt={s.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 860px"
                    priority={index === 0}
                    className="object-cover object-center"
                  />
                </div>

                {/* Degrade: üstten hafif, alttan siyah */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/5" />
              </div>
            )
          })}

          {/* ── Sol ok ── */}
          {items.length > 1 && (
            <button
              type="button"
              aria-label="Önceki"
              onClick={prev}
              className="absolute left-3 top-1/2 z-20 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/75 active:scale-95 md:left-4 md:h-11 md:w-11"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {/* ── Sağ ok ── */}
          {items.length > 1 && (
            <button
              type="button"
              aria-label="Sonraki"
              onClick={next}
              className="absolute right-3 top-1/2 z-20 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/75 active:scale-95 md:right-4 md:h-11 md:w-11"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {/* ── İçerik ── tüm slayt tıklanabilir, içerik altta */}
          <Link
            href={newsItemDetailHref(item)}
            className="absolute inset-0 z-10 flex flex-col justify-end focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <div className="px-4 pb-4 pt-6 sm:px-6 sm:pb-5">
              {/* Kategori rozeti */}
              <span className="mb-2.5 inline-flex items-center rounded-md bg-[rgb(var(--color-brand))] px-2.5 py-[5px] text-[10px] font-black uppercase tracking-widest text-white">
                {newsItemCategoryLabel(item)}
              </span>

              {/* Başlık */}
              <h2 className="line-clamp-3 text-[1.5rem] font-black leading-[1.18] tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] sm:text-[1.85rem]">
                {item.title}
              </h2>

              {/* Dot göstergeler */}
              {items.length > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  {items.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Slayt ${i + 1}`}
                      onClick={(e) => { e.preventDefault(); goTo(i) }}
                      className={`rounded-full transition-all duration-300 ${
                        i === current
                          ? 'h-2.5 w-2.5 bg-white scale-110'
                          : 'h-2 w-2 bg-white/40 hover:bg-white/70'
                      }`}
                    />
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
