'use client'

import { useState } from 'react'
import { CalendarDays, MapPin, PartyPopper, Ticket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveEventFilterCategory } from '@/lib/cityEventFilters'
import {
  formatEventDayBadge,
  formatEventDisplayDate,
  getEventCategoryLabel,
  getEventCategoryStyle,
  isEventFree,
  resolveEventImageUrl,
} from '@/lib/eventUtils'
import type { NaEvent } from '@/types/event'
import { CityEventBadges } from './CityEventBadges'

interface CityEventGridCardProps {
  event: NaEvent
  compact?: boolean
}

export function CityEventGridCard({ event, compact = false }: CityEventGridCardProps) {
  const dateLabel = formatEventDisplayDate(event)
  const { day, month } = formatEventDayBadge(event.startsAt)
  const [imageFailed, setImageFailed] = useState(false)
  const coverImageUrl = resolveEventImageUrl(event.coverImageUrl)
  const showImage = !!coverImageUrl && !imageFailed
  const free = isEventFree(event)
  const category = resolveEventFilterCategory(event)

  return (
    <article
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-xl border border-[rgb(var(--color-border))]',
        'bg-[rgb(var(--color-card))] shadow-sm transition-shadow hover:shadow-md'
      )}
    >
      <div
        className={cn(
          'relative w-full overflow-hidden bg-[rgb(var(--color-surface-elevated))]',
          compact ? 'aspect-[4/3]' : 'aspect-[16/10]'
        )}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt={event.title}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[rgb(var(--color-brand))]/8 to-slate-500/10">
            <PartyPopper className="h-8 w-8 text-[rgb(var(--color-muted))]" />
          </div>
        )}

        {day && (
          <div className="absolute left-2 top-2 flex flex-col items-center rounded-lg bg-[rgb(var(--color-surface))]/95 px-2 py-1 shadow-sm backdrop-blur">
            <span className="text-sm font-black leading-none text-[rgb(var(--color-text))]">
              {day}
            </span>
            <span className="text-[9px] font-bold uppercase text-[rgb(var(--color-muted))]">
              {month}
            </span>
          </div>
        )}

        <span
          className={cn(
            'pill absolute right-2 top-2 text-[10px] font-semibold',
            getEventCategoryStyle(category)
          )}
        >
          {getEventCategoryLabel(category)}
        </span>

        <CityEventBadges event={event} layout="overlay" />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3
          className={cn(
            'line-clamp-2 font-bold leading-snug text-[rgb(var(--color-text))]',
            compact ? 'text-[13px]' : 'text-sm'
          )}
        >
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

        {event.ticketUrl ? (
          <a
            href={event.ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg',
              'bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-bold text-white',
              'transition-opacity hover:opacity-90'
            )}
          >
            <Ticket className="h-3.5 w-3.5" />
            Bilet Al
          </a>
        ) : free ? (
          <div className="mt-auto pt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            Halka açık · giriş ücretsiz
          </div>
        ) : (
          <div className="mt-auto pt-1 text-[11px] font-medium text-[rgb(var(--color-text-secondary))]">
            Bilgi yok
          </div>
        )}
      </div>
    </article>
  )
}

export function CityEventGridCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <article className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <div className={cn('skeleton w-full', compact ? 'aspect-[4/3]' : 'aspect-[16/10]')} />
      <div className="space-y-2 p-3">
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-3 w-2/3 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton mt-2 h-8 w-full rounded-lg" />
      </div>
    </article>
  )
}
