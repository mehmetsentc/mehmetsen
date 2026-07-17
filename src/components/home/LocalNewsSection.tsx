'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { CalendarDays, MapPin, PartyPopper } from 'lucide-react'
import { useUserLocation } from '@/hooks/useUserLocation'
import { getLocalEvents, getLocalNews } from '@/lib/news'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { resolveEventImageUrl, formatEventDayBadge } from '@/lib/eventUtils'
import { ROUTES } from '@/constants/routes'
import type { NewsItem } from '@/types/newsItem'
import type { NaEvent } from '@/types/event'

// ── Küçük etkinlik kartı (yatay kaydırma şeridi için) ─────────────────────────
function EventMiniCard({ event, fallbackCity }: { event: NaEvent; fallbackCity?: string | null }) {
  const [imgFailed, setImgFailed] = useState(false)
  const imgUrl = resolveEventImageUrl(event.coverImageUrl)
  const showImg = !!imgUrl && !imgFailed
  const { day, month } = formatEventDayBadge(event.startsAt)

  return (
    <Link
      href={ROUTES.EVENTS}
      className="w-[160px] shrink-0 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]"
    >
      {/* Görsel alanı */}
      <div className="relative h-[100px] w-full overflow-hidden bg-[rgb(var(--color-surface-elevated))]">
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgUrl}
            alt={event.title}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-500/10 to-purple-500/10">
            <PartyPopper className="h-7 w-7 text-[rgb(var(--color-muted))]" />
          </div>
        )}

        {/* Tarih badge */}
        {day && (
          <div className="absolute left-2 top-2 flex flex-col items-center rounded-lg bg-[rgb(var(--color-surface))]/90 px-1.5 py-1 shadow-sm backdrop-blur">
            <span className="text-xs font-black leading-none text-[rgb(var(--color-text))]">{day}</span>
            <span className="text-[9px] font-semibold uppercase text-[rgb(var(--color-muted))]">{month}</span>
          </div>
        )}
      </div>

      {/* Başlık + şehir */}
      <div className="px-2.5 py-2">
        <p className="line-clamp-2 text-xs font-bold leading-snug text-[rgb(var(--color-text))]">
          {event.title}
        </p>
        <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))] truncate">
          {event.city || fallbackCity}
        </p>
      </div>
    </Link>
  )
}

const LOCAL_CACHE_TTL_MS = 10 * 60 * 1000

interface LocalCache {
  citySlug: string
  news: NewsItem[]
  events: NaEvent[]
  fetchedAt: number
}

function readLocalCache(citySlug: string): LocalCache | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem('nahaber-local-cache')
    if (!raw) return null
    const parsed = JSON.parse(raw) as LocalCache
    if (parsed.citySlug !== citySlug) return null
    if (Date.now() - parsed.fetchedAt > LOCAL_CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeLocalCache(entry: LocalCache): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem('nahaber-local-cache', JSON.stringify(entry))
  } catch {
    // ignore
  }
}

export function LocalNewsSection() {
  const { citySlug, cityName, ready } = useUserLocation()
  const [news, setNews] = useState<NewsItem[]>([])
  const [events, setEvents] = useState<NaEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ready || !citySlug) return

    const cached = readLocalCache(citySlug)
    if (cached) {
      setNews(cached.news)
      setEvents(cached.events)
      return
    }

    let cancelled = false
    setLoading(true)

    void Promise.all([getLocalNews(citySlug, 6), getLocalEvents(citySlug, 4)])
      .then(([localNews, localEvents]) => {
        if (cancelled) return
        setNews(localNews)
        setEvents(localEvents)
        writeLocalCache({ citySlug, news: localNews, events: localEvents, fetchedAt: Date.now() })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [citySlug, ready])

  if (!ready || loading) return null
  if (news.length === 0 && events.length === 0) return null

  return (
    <div className="space-y-6">
      {news.length > 0 ? (
        <section className="home-section" aria-label="Yakınındaki haberler">
          <div className="home-rail-title">
            <span className="home-rail-accent" aria-hidden />
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[rgb(var(--color-brand))]" />
              <h2 className="text-lg font-black text-[rgb(var(--color-text))]">
                Yakınındaki Haberler
                {cityName ? <span className="ml-1 text-sm font-semibold text-[rgb(var(--color-muted))]">· {cityName}</span> : null}
              </h2>
            </div>
          </div>
          <div className="space-y-3">
            {news.map((item) => {
              const image = item.imageUrl || FEED_FALLBACK_LOGO
              return (
                <Link
                  key={item.id}
                  href={newsItemDetailHref(item)}
                  className="flex gap-3 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-2"
                >
                  <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                    <Image src={image} alt={item.title} fill sizes="112px" className="object-cover" />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center">
                    <p className="line-clamp-3 text-sm font-bold leading-snug text-[rgb(var(--color-text))]">
                      {item.title}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      ) : null}

      {events.length > 0 ? (
        <section className="home-section" aria-label="Yakınındaki etkinlikler">
          <div className="home-rail-title">
            <span className="home-rail-accent" aria-hidden />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[rgb(var(--color-brand))]" />
                <h2 className="text-lg font-black text-[rgb(var(--color-text))]">Yakınındaki Etkinlikler</h2>
              </div>
              <Link href={ROUTES.EVENTS} className="text-xs font-bold text-[rgb(var(--color-brand))]">
                Tümü
              </Link>
            </div>
          </div>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide" data-no-category-swipe>
            {events.map((event) => (
              <EventMiniCard key={event.id} event={event} fallbackCity={cityName} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
