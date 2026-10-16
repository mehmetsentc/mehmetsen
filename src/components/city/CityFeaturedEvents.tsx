'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { getEventCategoryLabel, resolveEventImageUrl } from '@/lib/eventUtils'
import type { NaEvent } from '@/types/event'
import { EventCategoryIcon } from './eventCategoryIcon'

function whenLabel(startsAt: string): { day: string; month: string; time: string; weekday: string } {
  const d = new Date(startsAt)
  if (Number.isNaN(d.getTime())) return { day: '', month: '', time: '', weekday: '' }
  return {
    day: format(d, 'd', { locale: tr }),
    month: format(d, 'MMM', { locale: tr }),
    time: format(d, 'HH:mm', { locale: tr }),
    weekday: format(d, 'EEEE', { locale: tr }),
  }
}

function FeaturedCard({ event }: { event: NaEvent }) {
  const [failed, setFailed] = useState(false)
  const img = resolveEventImageUrl(event.coverImageUrl)
  const w = whenLabel(event.startsAt)
  return (
    <article className="relative h-full overflow-hidden rounded-2xl bg-[rgb(var(--color-surface-raised))] shadow-md">
      <Link prefetch={false} href={`/etkinlik/${event.id}`} className="block">
        <div className="relative aspect-[4/5] w-full">
          {img && !failed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt={event.title}
              loading="lazy"
              decoding="async"
              onError={() => setFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[rgb(var(--color-brand))]/30 to-slate-800">
              <EventCategoryIcon category={event.category} className="h-12 w-12 text-white/70" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
          <div className="absolute left-2.5 top-2.5 rounded-xl bg-white px-2 py-1 text-center text-slate-900 shadow">
            <span className="block text-lg font-black leading-none">{w.day}</span>
            <span className="block text-[10px] font-bold uppercase leading-tight">{w.month}</span>
          </div>
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
            <EventCategoryIcon category={event.category} className="h-3 w-3" />
            {getEventCategoryLabel(event.category)}
          </span>
          <div className="absolute inset-x-0 bottom-0 p-3 text-white">
            <p className="text-[11px] font-semibold capitalize text-white/80">
              {w.weekday} · {w.time}
            </p>
            <h3 className="mt-0.5 line-clamp-2 text-[15px] font-black leading-snug">{event.title}</h3>
            {event.venue ? (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-white/80">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{event.venue}</span>
              </p>
            ) : null}
          </div>
        </div>
      </Link>
    </article>
  )
}

/** CITY-SERVICES-1 — swipeable «Öne çıkan etkinlikler» with big photos. */
export function CityFeaturedEvents({ events }: { events: NaEvent[] }) {
  if (events.length < 2) return null
  return (
    <section className="mb-5" aria-label="Öne çıkan etkinlikler">
      <div className="mb-2 flex items-end justify-between">
        <h2 className="text-base font-black text-[rgb(var(--color-text))]">Öne çıkan etkinlikler</h2>
        <span className="text-[11px] font-semibold text-[rgb(var(--color-muted))]">Kaydır →</span>
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide md:mx-0 md:px-0">
        {events.map((e) => (
          <li key={e.id} className="w-[62%] max-w-[240px] shrink-0 snap-start sm:w-[42%] md:w-[30%]">
            <FeaturedCard event={e} />
          </li>
        ))}
      </ul>
    </section>
  )
}
