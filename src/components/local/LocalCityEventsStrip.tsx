'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { CalendarDays, ChevronRight, Film, MapPin, PartyPopper, Ticket } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { dedupeEvents } from '@/lib/eventDedupe'
import { db, Collections } from '@/lib/firebase/firestore'
import { resolveEventFilterCategory } from '@/lib/cityEventFilters'
import {
  formatEventDayBadge,
  getEventCategoryLabel,
  getEventCategoryStyle,
  getUpcomingStartsAtLowerBound,
  resolveEventImageUrl,
} from '@/lib/eventUtils'
import {
  filterLocalCityStripEvents,
  LOCAL_CITY_EVENTS_STRIP_LIMIT,
  type LocalCityEventsStripFilter,
} from '@/lib/localCityEventsStrip'
import { cn } from '@/lib/utils'
import type { NaEvent } from '@/types/event'

const STRIP_TIMEOUT_MS = 8_000
/** Oversample — many synced rows may be soft-cancelled and filtered client-side. */
const FETCH_LIMIT = 80

interface LocalCityEventsStripProps {
  citySlug: string
  cityName: string
  /** When `cinema`, shows today + near-term Sinema-tagged events only. */
  filter?: LocalCityEventsStripFilter
  /** Use `/etkinlik` instead of national `/events?sehir=`. */
  cityTenantMode?: boolean
}

function EventMiniCard({
  event,
  fallbackHref,
}: {
  event: NaEvent
  fallbackHref: string
}) {
  const { day, month } = formatEventDayBadge(event.startsAt)
  const [imageFailed, setImageFailed] = useState(false)
  const coverUrl = resolveEventImageUrl(event.coverImageUrl)
  const showImage = !!coverUrl && !imageFailed
  const category = resolveEventFilterCategory(event)
  const cardHref = event.ticketUrl?.trim() || fallbackHref
  const isExternal = Boolean(event.ticketUrl?.trim())

  const card = (
    <article className="flex w-[160px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm transition-shadow hover:shadow-md">
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

        {/* Category pill — uses tags/source so Paribu Sinema rows stay labelled. */}
        <span
          className={cn(
            'pill absolute right-2 top-2 text-[10px] font-semibold',
            getEventCategoryStyle(category)
          )}
        >
          {getEventCategoryLabel(category)}
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

        {event.ticketUrl ? (
          <span className="mt-auto inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white">
            <Ticket className="h-2.5 w-2.5" />
            Bilet
          </span>
        ) : null}
      </div>
    </article>
  )

  if (isExternal) {
    return (
      <a
        href={cardHref}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 snap-start"
        aria-label={`${event.title} — bilet al`}
      >
        {card}
      </a>
    )
  }

  return (
    <Link href={cardHref} className="shrink-0 snap-start" aria-label={event.title}>
      {card}
    </Link>
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

export function LocalCityEventsStrip({
  citySlug,
  cityName,
  filter = 'all',
  cityTenantMode = false,
}: LocalCityEventsStripProps) {
  const [events, setEvents] = useState<NaEvent[]>([])
  const [loading, setLoading] = useState(true)

  const eventsHref = useMemo(() => {
    if (cityTenantMode) return ROUTES.CITY_EVENTS
    return `${ROUTES.EVENTS}?sehir=${encodeURIComponent(citySlug)}`
  }, [citySlug, cityTenantMode])

  const isCinema = filter === 'cinema'
  const sectionIcon = isCinema ? Film : CalendarDays
  const SectionIcon = sectionIcon
  const sectionTitle = isCinema ? `${cityName} Sineması` : `${cityName} Etkinlikleri`
  const ctaLabel = isCinema ? 'Tüm sinema seansları' : 'Tüm etkinlikleri gör'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setEvents([])

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), STRIP_TIMEOUT_MS)

    const nowIso = new Date().toISOString()
    const q = query(
      collection(db, Collections.EVENTS),
      where('citySlug', '==', citySlug),
      where('startsAt', '>=', getUpcomingStartsAtLowerBound(nowIso)),
      orderBy('startsAt', 'asc'),
      limit(FETCH_LIMIT)
    )

    async function fetchStrip() {
      let docs: NaEvent[] = []
      try {
        const snap = await getDocs(q)
        if (cancelled) return
        docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as NaEvent))
        docs = filterLocalCityStripEvents(docs, filter, nowIso)
      } catch {
        // Firestore failed (likely missing composite index) — try aggregate
      }

      if (cancelled) return

      // Sparse Firestore catalogs (e.g. mass soft-cancelled Antalya rows) still
      // return 1–2 published hits — only fall back when empty left the strip
      // stuck. Prefer live aggregate whenever we are under the carousel budget.
      if (docs.length < LOCAL_CITY_EVENTS_STRIP_LIMIT) {
        try {
          const params = new URLSearchParams({ citySlug })
          if (isCinema) params.set('category', 'cinema')
          const res = await fetch(`/api/events/aggregate?${params.toString()}`, {
            signal: controller.signal,
            cache: 'no-store',
          })
          if (cancelled) return
          if (res.ok) {
            const data = await res.json()
            const all: NaEvent[] = Array.isArray(data.events) ? data.events : []
            const live = filterLocalCityStripEvents(all, filter, nowIso)
            docs = filterLocalCityStripEvents(dedupeEvents([...docs, ...live]), filter, nowIso)
          }
        } catch {
          // aggregate also failed — keep whatever Firestore returned
        }
      }

      if (!cancelled) {
        setEvents(docs)
        setLoading(false)
      }
    }

    void fetchStrip().finally(() => clearTimeout(timer))

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [citySlug, filter, isCinema])

  if (!loading && events.length === 0) return null

  return (
    <section className="mb-4 mt-1" aria-label={sectionTitle}>
      {/* Header */}
      <div className="mb-2 flex items-center justify-between px-3">
        <div className="flex items-center gap-1.5">
          <SectionIcon className="h-4 w-4 text-blue-600" />
          <span className="text-[13px] font-bold text-[rgb(var(--color-text))]">
            {sectionTitle}
          </span>
        </div>
        <Link
          href={eventsHref}
          className="flex items-center gap-0.5 text-[11px] font-semibold text-blue-600"
        >
          Tümünü gör
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Horizontal scroll */}
      <div className="flex gap-3 overflow-x-auto px-3 pb-1 scrollbar-hide snap-x snap-mandatory">
        {loading
          ? [...Array(4)].map((_, i) => <EventMiniCardSkeleton key={i} />)
          : events.map((event) => (
              <EventMiniCard
                key={event.id}
                event={event}
                fallbackHref={eventsHref}
              />
            ))}
      </div>

      {!loading && events.length > 0 && (
        <div className="mt-3 px-3">
          <Link
            href={eventsHref}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
          >
            <SectionIcon className="h-4 w-4" />
            {ctaLabel}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  )
}
