'use client'

import Link from 'next/link'
import { ChevronRight, Film } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { CityEventGridCard } from './CityEventGridCard'
import type { NaEvent } from '@/types/event'

interface CityCinemaEventsStripProps {
  events: NaEvent[]
  cityName?: string
  /** Desktop newspaper layout — wider cards, section divider spacing */
  variant?: 'mobile' | 'desktop'
}

export function CityCinemaEventsStrip({
  events,
  cityName,
  variant = 'mobile',
}: CityCinemaEventsStripProps) {
  if (events.length === 0) return null

  const cardWrapClassName =
    variant === 'desktop'
      ? 'w-[240px] shrink-0 snap-start xl:w-[260px]'
      : 'w-[min(72vw,280px)] shrink-0 snap-start md:w-[calc(50%-0.5rem)] md:max-w-[320px] xl:w-[240px]'

  const header = (
    <div
      className={
        variant === 'desktop'
          ? 'mb-4 flex items-center justify-between gap-3'
          : 'home-rail-title max-md:mb-3 max-md:px-4'
      }
    >
      {variant === 'mobile' ? (
        <span className="home-rail-accent max-md:h-8 max-md:w-[5px]" aria-hidden />
      ) : null}
      <div className="flex flex-1 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-950/40">
            <Film className="h-4 w-4 text-rose-600 dark:text-rose-300" />
          </span>
          <h2
            className={
              variant === 'desktop'
                ? 'text-base font-black text-[rgb(var(--color-text))] lg:text-lg'
                : 'text-lg font-black text-[rgb(var(--color-text))] max-md:text-[1.25rem]'
            }
          >
            Sinema
            {cityName ? (
              <span className="ml-1 text-sm font-semibold text-[rgb(var(--color-muted))]">
                · {cityName}
              </span>
            ) : null}
          </h2>
        </div>
        <Link
          href={ROUTES.CITY_EVENTS}
          className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-[rgb(var(--color-brand))]"
        >
          Tümü
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )

  const strip = (
    <div
      className={
        variant === 'desktop'
          ? '-mx-1 flex gap-4 overflow-x-auto px-1 pb-1 scrollbar-hide snap-x snap-mandatory'
          : '-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide snap-x snap-mandatory max-md:px-4'
      }
      aria-label="Sinema"
      data-no-category-swipe
    >
      {events.map((event) => (
        <div key={event.id} className={cardWrapClassName}>
          <CityEventGridCard event={event} compact />
        </div>
      ))}
    </div>
  )

  if (variant === 'desktop') {
    return (
      <section aria-label="Sinema">
        {header}
        {strip}
      </section>
    )
  }

  return (
    <section className="home-section max-md:!mb-6 max-md:!mt-5 max-md:!px-0" aria-label="Sinema">
      {header}
      {strip}
    </section>
  )
}
