'use client'

import { useState } from 'react'
import { CalendarDays, MapPin, PartyPopper, Ticket } from 'lucide-react'
import {
  formatEventDayBadge,
  formatEventDisplayDate,
  getEventCategoryLabel,
  getEventCategoryStyle,
  isEventFree,
  resolveEventImageUrl,
} from '@/lib/eventUtils'
import { cn } from '@/lib/utils'
import type { NaEvent } from '@/types/event'
import { CityEventBadges } from './CityEventBadges'

interface CityEventListCardProps {
  event: NaEvent
}

export function CityEventListCard({ event }: CityEventListCardProps) {
  const dateLabel = formatEventDisplayDate(event)
  const { day, month } = formatEventDayBadge(event.startsAt)
  const [imageFailed, setImageFailed] = useState(false)
  const coverImageUrl = resolveEventImageUrl(event.coverImageUrl)
  const showImage = !!coverImageUrl && !imageFailed
  const free = isEventFree(event)

  return (
    <article className="flex gap-3 overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-2.5 shadow-sm">
      <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--color-surface-elevated))]">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt={event.title}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[rgb(var(--color-brand))]/8 to-slate-500/10">
            <PartyPopper className="h-6 w-6 text-[rgb(var(--color-muted))]" />
          </div>
        )}
        {day && (
          <div className="absolute bottom-1 left-1 rounded-md bg-[rgb(var(--color-surface))]/95 px-1.5 py-0.5 text-center shadow-sm backdrop-blur">
            <span className="block text-[11px] font-black leading-none text-[rgb(var(--color-text))]">
              {day}
            </span>
            <span className="block text-[8px] font-bold uppercase text-[rgb(var(--color-muted))]">
              {month}
            </span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={cn(
              'inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold',
              getEventCategoryStyle(event.category)
            )}
          >
            {getEventCategoryLabel(event.category)}
          </span>
          <CityEventBadges event={event} layout="inline" showFree={false} />
        </div>

        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-[rgb(var(--color-text))]">
          {event.title}
        </h3>

        <div className="flex items-center gap-1 text-[11px] text-[rgb(var(--color-muted))]">
          <CalendarDays className="h-3 w-3 shrink-0" />
          <span className="truncate">{dateLabel}</span>
        </div>

        {(event.venue || event.city) && (
          <div className="flex items-center gap-1 text-[11px] text-[rgb(var(--color-muted))]">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {[event.venue, event.city].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}
      </div>

      {event.ticketUrl ? (
        <a
          href={event.ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 flex-col items-center justify-center self-center rounded-lg bg-[rgb(var(--color-brand))] px-2.5 py-2 text-[10px] font-bold text-white"
        >
          <Ticket className="mb-0.5 h-4 w-4" />
          Bilet
        </a>
      ) : free ? (
        <div className="flex shrink-0 flex-col items-center justify-center self-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[10px] font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          Ücretsiz
        </div>
      ) : null}
    </article>
  )
}

export function CityEventListCardSkeleton() {
  return (
    <article className="flex gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-2.5">
      <div className="skeleton h-[88px] w-[88px] shrink-0 rounded-lg" />
      <div className="flex flex-1 flex-col justify-center gap-2">
        <div className="skeleton h-3 w-16 rounded-full" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-3 w-3/4 rounded" />
      </div>
    </article>
  )
}
