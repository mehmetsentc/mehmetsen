'use client'

import { Flame } from 'lucide-react'
import { CityEventGridCard, CityEventGridCardSkeleton } from './CityEventGridCard'
import type { NaEvent } from '@/types/event'

interface CityEventTopSellersProps {
  events: NaEvent[]
  loading?: boolean
  /** Mobile shows ~2.5 cards; desktop shows more in the strip */
  title?: string
}

export function CityEventTopSellers({
  events,
  loading = false,
  title = 'Öne Çıkan Etkinlikler',
}: CityEventTopSellersProps) {
  if (!loading && events.length === 0) return null

  return (
    <section className="mb-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgb(var(--color-brand))]/10">
          <Flame className="h-4 w-4 text-[rgb(var(--color-brand))]" />
        </span>
        <h2 className="text-sm font-bold text-[rgb(var(--color-text))] lg:text-base">
          {title}
        </h2>
      </div>

      <div
        className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide snap-x snap-mandatory md:gap-4"
        aria-label={title}
      >
        {loading
          ? [...Array(4)].map((_, i) => (
              <div
                key={i}
                className="w-[min(72vw,280px)] shrink-0 snap-start md:w-[calc(50%-0.5rem)] md:max-w-[320px] xl:w-[240px]"
              >
                <CityEventGridCardSkeleton compact />
              </div>
            ))
          : events.map((event) => (
              <div
                key={event.id}
                className="w-[min(72vw,280px)] shrink-0 snap-start md:w-[calc(50%-0.5rem)] md:max-w-[320px] xl:w-[240px]"
              >
                <CityEventGridCard event={event} compact />
              </div>
            ))}
      </div>
    </section>
  )
}
