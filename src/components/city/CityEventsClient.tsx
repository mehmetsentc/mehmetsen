'use client'

import { CalendarDays } from 'lucide-react'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'
import { useEvents } from '@/hooks/useEvents'

interface CityEventsClientProps {
  citySlug: string
  cityName: string
}

export function CityEventsClient({ citySlug, cityName }: CityEventsClientProps) {
  const { events, loading, error, retry } = useEvents({
    citySlug,
    timeRange: 'upcoming',
  })

  return (
    <div className="home-feed mx-auto w-full max-w-3xl pb-6 max-md:pb-10 max-md:pt-4">
      <header className="mb-4 px-1">
        <h1 className="text-xl font-bold text-[rgb(var(--color-text))]">
          {cityName} Etkinlikleri
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-text-secondary))]">
          Konser, tiyatro, festival ve daha fazlası
        </p>
      </header>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="py-16 text-center">
          <p className="text-sm text-[rgb(var(--color-text-secondary))]">{error}</p>
          <button
            type="button"
            onClick={() => void retry()}
            className="mt-3 rounded-full bg-[rgb(var(--color-brand))] px-4 py-2 text-xs font-bold text-white"
          >
            Tekrar dene
          </button>
        </div>
      ) : events.length > 0 ? (
        <div className="space-y-4">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <CalendarDays className="mx-auto h-12 w-12 text-[rgb(var(--color-text-secondary))]/40" />
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
