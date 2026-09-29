'use client'

import Link from 'next/link'
import { ChevronRight, Film } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { CityEventGridCard } from './CityEventGridCard'
import type { NaEvent } from '@/types/event'

interface CityCinemaEventsStripProps {
  events: NaEvent[]
  cityName?: string
  /** Overrides the default "Sinema · city" heading */
  title?: string
  /** Desktop newspaper layout — wider cards, section divider spacing */
  variant?: 'mobile' | 'desktop' | 'newspaper' | 'page'
}

export function CityCinemaEventsStrip({
  events,
  cityName,
  title,
  variant = 'mobile',
}: CityCinemaEventsStripProps) {
  if (events.length === 0) return null
  const heading = title?.trim() || (cityName ? `Sinema · ${cityName}` : 'Sinema')

  const cardWrapClassName =
    variant === 'desktop' || variant === 'page'
      ? 'w-[240px] shrink-0 snap-start xl:w-[260px]'
      : 'w-[min(72vw,280px)] shrink-0 snap-start md:w-[calc(50%-0.5rem)] md:max-w-[320px] xl:w-[240px]'

  const header = (
    <div
      className={
        variant === 'desktop' || variant === 'page'
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
              variant === 'desktop' || variant === 'page'
                ? 'text-base font-black text-[rgb(var(--color-text))] lg:text-lg'
                : 'text-lg font-black text-[rgb(var(--color-text))] max-md:text-[1.25rem]'
            }
          >
            {heading}
          </h2>
        </div>
        {variant === 'page' ? null : (
          <Link
            href={ROUTES.CITY_EVENTS}
            className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-[rgb(var(--color-brand))]"
          >
            Tümü
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  )

  const strip = (
    <div
      className={
        variant === 'desktop' || variant === 'page'
          ? '-mx-1 flex gap-4 overflow-x-auto px-1 pb-1 scrollbar-hide snap-x snap-mandatory'
          : '-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide snap-x snap-mandatory max-md:px-4'
      }
      aria-label={heading}
      data-no-category-swipe
    >
      {events.map((event) => (
        <div key={event.id} className={cardWrapClassName}>
          <CityEventGridCard event={event} compact />
        </div>
      ))}
    </div>
  )

  if (variant === 'newspaper') {
    return (
      <section className="desktop-portal-band desktop-portal-events" aria-label="Etkinlikler">
        <div className="desktop-portal-bottom__head">
          <h2 className="desktop-portal-kicker">Etkinlikler</h2>
          <Link href={ROUTES.CITY_EVENTS} className="desktop-portal-more">
            Tümü
          </Link>
        </div>
        <div className="desktop-portal-rail-x" aria-label="Etkinlikler" data-no-category-swipe>
          {events.map((event) => (
            <div key={event.id}>
              <CityEventGridCard event={event} compact />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (variant === 'page') {
    return (
      <section className="mb-5" aria-label={heading}>
        {header}
        {strip}
      </section>
    )
  }

  if (variant === 'desktop') {
    return (
      <section className="lg:hidden" aria-label={heading}>
        {header}
        {strip}
      </section>
    )
  }

  return (
    <section
      className="home-section max-md:!mb-6 max-md:!mt-5 max-md:!px-0 lg:hidden"
      aria-label={heading}
    >
      {header}
      {strip}
    </section>
  )
}
