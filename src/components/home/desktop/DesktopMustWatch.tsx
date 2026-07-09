'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { ROUTES } from '@/constants/routes'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import type { NewsItem } from '@/types/newsItem'

interface DesktopMustWatchProps {
  items: NewsItem[]
}

export function DesktopMustWatch({ items }: DesktopMustWatchProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  if (items.length === 0) return null

  const scroll = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' })
  }

  return (
    <section className="desktop-must-watch mb-10 bg-[rgb(var(--color-text))] py-6 text-white" aria-label="Trend haberler">
      <div className="mb-4 flex items-center justify-between px-1">
        <DesktopSectionHeader
          title="Trend Haberler"
          href={ROUTES.CATEGORY('trend')}
          className="mb-0 border-t-0 pt-0 text-white hover:text-red-300"
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label="Önceki"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white transition-colors hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label="Sonraki"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white transition-colors hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto px-1 pb-1 scrollbar-hide"
        data-no-category-swipe
      >
        {items.slice(0, 8).map((item, index) => (
          <Link
            key={item.id}
            href={newsItemDetailHref(item)}
            className="group w-[280px] shrink-0 snap-start"
          >
            <div className="relative mb-3 aspect-video overflow-hidden bg-neutral-800">
              <SafeNewsImage
                src={item.imageUrl || FEED_FALLBACK_LOGO}
                alt={item.title}
                fill
                sizes="280px"
                priority={index === 0}
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </div>
            <h3 className="line-clamp-3 text-sm font-bold leading-snug text-white group-hover:underline">
              {item.title}
            </h3>
            {item.description ? (
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/70">
                {item.description}
              </p>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  )
}
