import Link from 'next/link'
import { formatEventDayBadge, resolveEventImageUrl } from '@/lib/eventUtils'
import type { NaEvent } from '@/types/event'
import { EventPoster } from '@/components/city/EventPoster'
import { EdSectionHead } from '@/components/home/desktop/EditorialFrontPage'

/** Same show listed by several venues/feeds → one card (title + day). */
function dedupeEvents(events: NaEvent[]): NaEvent[] {
  const seen = new Set<string>()
  const out: NaEvent[] = []
  for (const event of events) {
    const key = `${event.title.trim().toLocaleLowerCase('tr-TR')}|${String(event.startsAt ?? '').slice(0, 10)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(event)
  }
  return out
}

export function CityNewspaperEventsRail({
  cityName,
  events,
}: {
  cityName: string
  events: NaEvent[]
}) {
  const unique = dedupeEvents(events)
  if (unique.length === 0) return null

  return (
    <section className="ed-section ed-section--events" aria-label={`${cityName} etkinlikleri`}>
      <EdSectionHead title="Etkinlikler" href="/etkinlik" more="Tüm etkinlikler" />
      <div className="desktop-portal-rail-x">
        {unique.map((event) => {
          const cover = resolveEventImageUrl(event.coverImageUrl)
          const { day, month } = formatEventDayBadge(event.startsAt)
          return (
            <article key={event.id} className="desktop-portal-tile">
              <Link prefetch={false} href={`/etkinlik/${event.id}`} className="desktop-portal-cat__media">
                {cover ? <EventPoster src={cover} /> : null}
                {day ? (
                  <span className="desktop-portal-event__date">
                    <strong>{day}</strong>
                    <em>{month}</em>
                  </span>
                ) : null}
              </Link>
              <Link prefetch={false} href={`/etkinlik/${event.id}`} className="desktop-portal-cat__title">
                {event.title}
              </Link>
            </article>
          )
        })}
      </div>
    </section>
  )
}
