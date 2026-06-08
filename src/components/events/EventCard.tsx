'use client'

import { useState } from 'react'
import { CalendarDays, MapPin, Ticket, PartyPopper, Star } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import {
  formatEventDateTime,
  formatEventDayBadge,
  getEventCategoryLabel,
  getEventCategoryStyle,
  resolveEventImageUrl,
} from '@/lib/eventUtils'
import type { NaEvent } from '@/types/event'

interface EventCardProps {
  event: NaEvent
}

export function EventCard({ event }: EventCardProps) {
  const dateLabel = formatEventDateTime(event.startsAt, event.endsAt)
  const { day, month } = formatEventDayBadge(event.startsAt)
  // External (aggregated) events carry a non-firestore source; surface the
  // platform name so users know where the listing comes from.
  const externalSource =
    event.source && event.source !== 'firestore' ? event.provider || event.source : null

  // External cover images are routed through our same-origin proxy; fall back to
  // the gradient only when there's no image or it genuinely fails to load.
  const [imageFailed, setImageFailed] = useState(false)
  const coverImageUrl = resolveEventImageUrl(event.coverImageUrl)
  const showImage = !!coverImageUrl && !imageFailed

  return (
    <article className="news-card overflow-hidden">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[rgb(var(--color-surface-elevated))]">
        {showImage ? (
          // Event covers come from arbitrary hosts (not in next/image allowlist),
          // so use a plain img to avoid build-time domain restrictions. External
          // hosts are served via our same-origin /api/events/image proxy.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt={event.title}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-500/10 to-purple-500/10">
            <PartyPopper className="h-10 w-10 text-[rgb(var(--color-muted))]" />
          </div>
        )}

        {day && (
          <div className="absolute left-3 top-3 flex flex-col items-center rounded-xl bg-[rgb(var(--color-surface))]/95 px-3 py-1.5 shadow-sm backdrop-blur">
            <span className="text-base font-black leading-none text-[rgb(var(--color-text))]">{day}</span>
            <span className="text-[10px] font-semibold uppercase text-[rgb(var(--color-muted))]">{month}</span>
          </div>
        )}

        <span
          className={cn(
            'pill absolute right-3 top-3 font-semibold',
            getEventCategoryStyle(event.category)
          )}
        >
          {getEventCategoryLabel(event.category)}
        </span>

        {externalSource && (
          <span className="pill absolute bottom-3 left-3 flex items-center gap-1 bg-[rgb(var(--color-surface))]/95 font-semibold text-[rgb(var(--color-text))] shadow-sm backdrop-blur">
            <Ticket className="h-3 w-3" />
            {externalSource}
          </span>
        )}
      </div>

      <div className="space-y-2 px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--color-muted))]">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{dateLabel}</span>
        </div>

        <h2 className="line-clamp-2 text-lg font-bold leading-snug text-[rgb(var(--color-text))]">
          {event.title}
        </h2>

        {event.description && (
          <p className="line-clamp-2 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
            {event.description}
          </p>
        )}

        <div className="flex items-center gap-1.5 text-sm text-[rgb(var(--color-muted))]">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {event.venue}
            {event.venue && event.city ? ' · ' : ''}
            {event.city}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {event.ratingCount != null && event.ratingCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {event.averageRating?.toFixed(1)} ({event.ratingCount})
              </span>
            )}
            {event.city && <Badge variant="category">{event.city}</Badge>}
            {event.organizer && event.organizer !== externalSource && (
              <span className="text-xs text-[rgb(var(--color-muted))]">{event.organizer}</span>
            )}
          </div>

          {event.ticketUrl && (
            <a
              href={event.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <Ticket className="h-4 w-4" />
              Bilet
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

export function EventCardSkeleton() {
  return (
    <article className="news-card overflow-hidden">
      <div className="skeleton aspect-[16/9] w-full" />
      <div className="space-y-3 px-4 py-3">
        <div className="skeleton h-3 w-32 rounded" />
        <div className="skeleton h-5 w-3/4 rounded" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
      </div>
    </article>
  )
}
