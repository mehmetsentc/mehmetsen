'use client'

import { useEffect, useState } from 'react'
import { Calendar } from 'lucide-react'

interface OnThisDayEvent {
  year: number
  text: string
  link?: string
}

interface ApiResponse {
  events?: OnThisDayEvent[]
}

export function OnThisDayArchive() {
  const [events, setEvents] = useState<OnThisDayEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    const params = new URLSearchParams({
      month: String(now.getMonth() + 1),
      day: String(now.getDate()),
      limit: '5',
    })
    fetch(`/api/news/on-this-day?${params}`)
      .then((r) => r.json())
      .then((d: ApiResponse) => setEvents(d.events ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const todayLabel = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(
    new Date()
  )

  return (
    <section
      className="mb-8 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-5"
      aria-label="Tarihte bugün"
    >
      <div className="mb-4 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-[rgb(var(--color-brand))]" aria-hidden />
        <h2 className="text-base font-bold text-[rgb(var(--color-text))]">
          Tarihte Bugün — {todayLabel}
        </h2>
      </div>

      {loading ? (
        <ul className="space-y-2">
          {[1, 2, 3].map((i) => (
            <li key={i} className="h-4 animate-pulse rounded bg-[rgb(var(--color-border))]" />
          ))}
        </ul>
      ) : events.length === 0 ? (
        <p className="text-sm text-[rgb(var(--color-muted))]">
          Bu tarihte arşiv bilgisi bulunamadı.
        </p>
      ) : (
        <ul className="space-y-3">
          {events.map((event, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="shrink-0 font-semibold text-[rgb(var(--color-brand))]">
                {event.year}
              </span>
              {event.link ? (
                <a
                  href={event.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-brand))] hover:underline"
                >
                  {event.text}
                </a>
              ) : (
                <span className="text-[rgb(var(--color-text))]">{event.text}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
