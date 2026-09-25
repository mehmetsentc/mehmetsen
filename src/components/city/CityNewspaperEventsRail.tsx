import Link from 'next/link'
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
                  // Paribu posters are served from /api/events/image. next/image
                  // rejects that URL (INVALID_IMAGE_OPTIMIZE_REQUEST) and the card stays blank.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
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
