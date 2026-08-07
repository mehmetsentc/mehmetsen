'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { CalendarDays, ChevronRight, MapPin, PartyPopper, Ticket } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { db, Collections } from '@/lib/firebase/firestore'
import {
  formatEventDayBadge,
  getEventCategoryLabel,
  getEventCategoryStyle,
  resolveEventImageUrl,
} from '@/lib/eventUtils'
import { cn } from '@/lib/utils'
import type { NaEvent } from '@/types/event'

const STRIP_TIMEOUT_MS = 8_000

interface LocalCityEventsStripProps {
  citySlug: string
  cityName: string
}

function EventMiniCard({ event }: { event: NaEvent }) {
  const { day, month } = formatEventDayBadge(event.startsAt)
  const [imageFailed, setImageFailed] = useState(false)
  const coverUrl = resolveEventImageUrl(event.coverImageUrl)
  const showImage = !!coverUrl && !imageFailed

  return (
    <article className="flex w-[160px] shrink-0 flex-col overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm">
      {/* Cover image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[rgb(var(--color-surface-elevated))]">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={event.title}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-500/10 to-purple-500/10">
            <PartyPopper className="h-6 w-6 text-[rgb(var(--color-muted))]" />
          </div>
        )}

        {/* Date badge */}
        {day && (
          <div className="absolute left-2 top-2 flex flex-col items-center rounded-lg bg-[rgb(var(--color-surface))]/95 px-2 py-1 shadow-sm backdrop-blur">
            <span className="text-sm font-black leading-none text-[rgb(var(--color-text))]">{day}</span>
            <span className="text-[9px] font-bold uppercase text-[rgb(var(--color-muted))]">{month}</span>
          </div>
        )}

        {/* Category pill */}
        <span
          className={cn(
            'pill absolute right-2 top-2 text-[10px] font-semibold',
            getEventCategoryStyle(event.category)
          )}
        >
          {getEventCategoryLabel(event.category)}
        </span>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 px-2.5 py-2">
        <h3 className="line-clamp-2 text-[12px] font-bold leading-tight text-[rgb(var(--color-text))]">
          {event.title}
        </h3>

        {(event.venue || event.city) && (
          <p className="flex items-center gap-1 text-[10px] text-[rgb(var(--color-muted))]">
            <MapPin className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">
              {event.venue || event.city}
            </span>
          </p>
        )}

        {event.ticketUrl && (
          <a
            href={event.ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-auto inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white"
          >
            <Ticket className="h-2.5 w-2.5" />
            Bilet
          </a>
        )}
      </div>
    </article>
  )
}

function EventMiniCardSkeleton() {
  return (
    <div className="w-[160px] shrink-0 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <div className="skeleton aspect-[4/3] w-full" />
      <div className="space-y-2 px-2.5 py-2">
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
      </div>
    </div>
  )
}

export function LocalCityEventsStrip({ citySlug, cityName }: LocalCityEventsStripProps) {
  const [events, setEvents] = useState<NaEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setEvents([])

    // Bypass the global firestoreQueue to avoid blocking the news feed.
    // This component is non-critical: a direct getDocs with a short timeout
    // is fine — if it fails or times out we simply show nothing.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), STRIP_TIMEOUT_MS)

    const nowIso = new Date().toISOString()
    // Composite index: citySlug ASC + startsAt ASC (firestore.indexes.json).
    // status filter is applied client-side to avoid needing a 3-field index.
    const q = query(
      collection(db, Collections.EVENTS),
      where('citySlug', '==', citySlug),
      where('startsAt', '>=', nowIso),
      orderBy('startsAt', 'asc'),
      limit(15)
    )

    getDocs(q)
      .then((snap) => {
        if (cancelled) return
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as NaEvent))
          .filter((e) => e.status !== 'cancelled')
          .slice(0, 10)
        setEvents(docs)
      })
      .catch(() => {
        if (!cancelled) setEvents([])
      })
      .finally(() => {
        clearTimeout(timer)
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [citySlug])

  // Yükleniyorsa skeleton göster, boşsa hiç render etme
  if (!loading && events.length === 0) return null

  return (
    <section className="mb-4 mt-1">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between px-3">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-blue-600" />
          <span className="text-[13px] font-bold text-[rgb(var(--color-text))]">
            {cityName} Etkinlikleri
          </span>
        </div>
        <Link
          href={ROUTES.EVENTS}
          className="flex items-center gap-0.5 text-[11px] font-semibold text-blue-600"
        >
          Tümünü gör
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Horizontal scroll */}
      <div className="flex gap-3 overflow-x-auto px-3 pb-1 scrollbar-hide">
        {loading
          ? [...Array(4)].map((_, i) => <EventMiniCardSkeleton key={i} />)
          : events.map((event) => <EventMiniCard key={event.id} event={event} />)}
      </div>

      {/* Tüm etkinlikleri gör */}
      {!loading && events.length > 0 && (
        <div className="mt-3 px-3">
          <Link
            href={ROUTES.EVENTS}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
          >
            <CalendarDays className="h-4 w-4" />
            Tüm etkinlikleri gör
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  )
}
