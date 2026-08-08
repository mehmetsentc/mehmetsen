'use client'

import { useEffect, useState } from 'react'
import { Calendar, MapPin, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CityEvent {
  id: string
  title: string
  venue?: string
  dateLabel?: string
  city?: string
  url?: string
  imageUrl?: string
  category?: string
}

interface CityEventsClientProps {
  citySlug: string
  cityName: string
}

export function CityEventsClient({ citySlug, cityName }: CityEventsClientProps) {
  const [events, setEvents] = useState<CityEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchEvents() {
      try {
        const res = await fetch(
          `/api/events/aggregate?city=${encodeURIComponent(citySlug)}&limit=20`
        )
        if (!res.ok) throw new Error('fetch failed')
        const data = await res.json()
        if (cancelled) return

        const mapped: CityEvent[] = (data.events ?? data ?? []).map(
          (e: Record<string, unknown>) => ({
            id: (e.id as string) || String(Math.random()),
            title: (e.title as string) || (e.name as string) || '',
            venue: (e.venue as string) || (e.location as string) || '',
            dateLabel: (e.dateLabel as string) || (e.date as string) || '',
            city: (e.city as string) || cityName,
            url: (e.url as string) || (e.ticketUrl as string) || '',
            imageUrl: (e.imageUrl as string) || (e.image as string) || '',
            category: (e.category as string) || '',
          })
        )
        setEvents(mapped)
      } catch {
        // events API might not exist yet — show empty
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchEvents()
    return () => { cancelled = true }
  }, [citySlug, cityName])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-[rgb(var(--color-text))]">
        {cityName} Etkinlikleri
      </h1>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="animate-pulse rounded-xl bg-[rgb(var(--color-surface-raised))] p-4">
              <div className="h-5 w-3/4 rounded bg-[rgb(var(--color-border))]" />
              <div className="mt-2 h-4 w-1/2 rounded bg-[rgb(var(--color-border))]" />
            </div>
          ))}
        </div>
      ) : events.length > 0 ? (
        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-4 transition-colors hover:bg-[rgb(var(--color-surface-raised-hover))]"
            >
              <h3 className="font-semibold text-[rgb(var(--color-text))]">
                {event.title}
              </h3>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[rgb(var(--color-text-secondary))]">
                {event.dateLabel && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {event.dateLabel}
                  </span>
                )}
                {event.venue && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {event.venue}
                  </span>
                )}
              </div>

              {event.url && (
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--color-brand))] hover:underline"
                >
                  Bilet <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <Calendar className="mx-auto h-12 w-12 text-[rgb(var(--color-text-secondary))]/40" />
          <p className="mt-3 text-sm text-[rgb(var(--color-text-secondary))]">
            Yaklaşan etkinlik bulunamadı.
          </p>
          <p className="mt-1 text-xs text-[rgb(var(--color-text-secondary))]/70">
            Yeni etkinlikler eklendikçe burada görünecek.
          </p>
        </div>
      )}
    </div>
  )
}
