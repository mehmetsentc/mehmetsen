import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { formatEventDayBadge, resolveEventImageUrl } from '@/lib/eventUtils'
import type { NaEvent } from '@/types/event'

export function CityNewspaperEventsRail({
  cityName,
  events,
}: {
  cityName: string
  events: NaEvent[]
}) {
  if (events.length === 0) return null

  return (
    <section className="desktop-portal-band" aria-label={`${cityName} etkinlikleri`}>
      <div className="desktop-portal-bottom__head">
        <h2 className="desktop-portal-kicker">Etkinlikler</h2>
        <Link href="/etkinlik" prefetch={false} className="desktop-portal-more">
          Tümü
        </Link>
      </div>
      <div className="desktop-portal-rail-x">
        {events.map((event) => {
          const cover = resolveEventImageUrl(event.coverImageUrl)
          const { day, month } = formatEventDayBadge(event.startsAt)
          return (
            <article key={event.id} className="desktop-portal-tile">
              <Link href={`/etkinlik/${event.id}`} className="desktop-portal-cat__media">
                {cover ? (
                  <SafeNewsImage src={cover} alt="" fill sizes="220px" className="object-cover" />
                ) : null}
                {day ? (
                  <span className="desktop-portal-event__date">
                    <strong>{day}</strong>
                    <em>{month}</em>
                  </span>
                ) : null}
              </Link>
              <Link href={`/etkinlik/${event.id}`} className="desktop-portal-cat__title">
                {event.title}
              </Link>
            </article>
          )
        })}
      </div>
    </section>
  )
}
