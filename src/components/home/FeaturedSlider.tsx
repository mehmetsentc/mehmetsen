'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

interface FeaturedSliderProps {
  items: NewsItem[]
}

const AUTOPLAY_MS = 5000

export function FeaturedSlider({ items }: FeaturedSliderProps) {
  const [current, setCurrent] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartX = useRef<number | null>(null)

  const goTo = useCallback(
    (idx: number) => {
      if (items.length === 0) return
      setCurrent((idx + items.length) % items.length)
    },
    [items.length]
  )

  const next = useCallback(() => goTo(current + 1), [current, goTo])

  useEffect(() => {
    if (items.length < 2) return
    timerRef.current = setInterval(next, AUTOPLAY_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [items.length, next])

  if (items.length === 0) return null

  return (
    <section className="home-section" aria-label="Gündem">
      <div className="home-full-bleed md:home-contained">
        <div
          className="relative h-[15rem] overflow-hidden rounded-none md:h-[22rem] md:rounded-2xl"
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
          {items.map((item, index) => {
            const image = item.imageUrl || FEED_FALLBACK_LOGO
            return (
              <Link
                key={item.id}
                href={newsItemDetailHref(item)}
                className={`absolute inset-0 transition-opacity duration-500 ${
                  index === current ? 'z-10 opacity-100' : 'z-0 opacity-0'
                }`}
                tabIndex={index === current ? 0 : -1}
                aria-hidden={index !== current}
              >
                <Image
                  src={image}
                  alt={item.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 720px"
                  priority={index === 0}
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent" />
                <div className="absolute left-4 top-4">
                  <span className="rounded bg-[rgb(var(--color-brand))] px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                    {newsItemCategoryLabel(item)}
                  </span>
                </div>
                <h2 className="absolute bottom-0 left-0 right-0 line-clamp-3 px-5 pb-6 text-2xl font-black leading-tight text-white md:text-3xl">
                  {item.title}
                </h2>
              </Link>
            )
          })}
        </div>

        {items.length > 1 && (
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Slayt ${index + 1}`}
                onClick={() => goTo(index)}
                className={`rounded-full transition-all ${
                  index === current
                    ? 'h-2 w-5 bg-[rgb(var(--color-brand))]'
                    : 'h-2 w-2 bg-[rgb(var(--color-border))]'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
