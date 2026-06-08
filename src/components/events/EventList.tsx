'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CalendarDays, RefreshCw } from 'lucide-react'
import { getCityCategoryName } from '@/constants/cities'
import { getCurrentPosition, slugifyCity } from '@/lib/location'
import type { UserCoords } from '@/lib/eventLocation'
import { useAuth } from '@/hooks/useAuth'
import { useEvents } from '@/hooks/useEvents'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import type { EventTimeRange } from '@/services/eventService'
import type { EventCategory } from '@/types/event'
import { EventCard, EventCardSkeleton } from './EventCard'
import { EventFilters } from './EventFilters'

const DEFAULT_CITY_SLUG = 'istanbul'

export function EventList() {
  const { user, loading: authLoading } = useAuth()

  const userCityName = user?.location?.trim() || null
  const userCitySlug = userCityName ? slugifyCity(userCityName) : null

  const [selectedCitySlug, setSelectedCitySlug] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<EventTimeRange>('upcoming')
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null)
  const userPickedCityRef = useRef(false)

  // "Yakınımdaki etkinlikler" — opt-in browser geolocation for distance sorting.
  const [nearby, setNearby] = useState(false)
  const [userCoords, setUserCoords] = useState<UserCoords | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  // Default the city filter to the visitor's own city once auth resolves.
  // Falls back to İstanbul when location is unknown.
  useEffect(() => {
    if (authLoading || userPickedCityRef.current || selectedCitySlug) return
    setSelectedCitySlug(userCitySlug ?? DEFAULT_CITY_SLUG)
  }, [authLoading, userCitySlug, selectedCitySlug])

  const { events, loading, loadingMore, error, hasMore, loadMore, retry, dataSource } =
    useEvents({
      citySlug: selectedCitySlug,
      category: selectedCategory,
      timeRange,
      userCitySlug,
      userCoords,
      nearby,
    })

  const handleToggleNearby = async () => {
    if (nearby) {
      setNearby(false)
      setGeoError(null)
      return
    }
    setGeoLoading(true)
    setGeoError(null)
    try {
      const position = await getCurrentPosition()
      setUserCoords({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      })
      setNearby(true)
    } catch {
      setGeoError('Konum alınamadı. Lütfen konum iznini kontrol edin.')
    } finally {
      setGeoLoading(false)
    }
  }

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    loading: loadingMore,
  })

  const cityLabel = selectedCitySlug ? getCityCategoryName(selectedCitySlug) : null

  const handleCityChange = (slug: string) => {
    userPickedCityRef.current = true
    setNearby(false)
    setGeoError(null)
    setSelectedCitySlug(slug)
  }

  const handleCityClear = () => {
    userPickedCityRef.current = false
    setSelectedCitySlug(userCitySlug ?? DEFAULT_CITY_SLUG)
  }

  const initializing = authLoading || !selectedCitySlug
  const showSkeletons = initializing || loading
  const showEmpty = !showSkeletons && !error && events.length === 0
  const showItems = !showSkeletons && events.length > 0

  return (
    <div className="w-full">
      <header className="timeline-header mb-0 py-3">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-[rgb(var(--color-text))]">
                Etkinlikler
              </h1>
              {dataSource === 'live' && !showSkeletons && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  Canlı
                </span>
              )}
              {dataSource === 'firestore' && !showSkeletons && events.length > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  Önbellek
                </span>
              )}
            </div>
            <p className="page-subtitle text-xs">
              {nearby
                ? 'Konumuna göre yakındaki etkinlikler'
                : cityLabel
                  ? timeRange === 'past'
                    ? `${cityLabel} · Geçmiş etkinlikler`
                    : `${cityLabel} · Yaklaşan etkinlikler`
                  : timeRange === 'past'
                    ? 'Geçmiş etkinlikler'
                    : 'Şehrindeki yaklaşan etkinlikler'}
            </p>
          </div>

        </div>

        <EventFilters
          selectedCitySlug={selectedCitySlug}
          onCityChange={handleCityChange}
          onCityClear={handleCityClear}
          nearby={nearby}
          geoLoading={geoLoading}
          onToggleNearby={handleToggleNearby}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />

        {geoError && (
          <p className="mt-2 text-xs text-red-500">{geoError}</p>
        )}
      </header>

      {error && !showSkeletons && (
        <div className="mb-4 surface-card p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
          <p className="text-sm text-[rgb(var(--color-muted))]">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Tekrar dene
          </button>
        </div>
      )}

      {showEmpty && (
        <div className="surface-card border-dashed py-16 text-center">
          <div className="empty-state-icon mx-auto">
            <CalendarDays className="h-7 w-7 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="mt-3 text-lg font-semibold text-[rgb(var(--color-text))]">
            {timeRange === 'past'
              ? cityLabel
                ? `${cityLabel} için geçmiş etkinlik bulunamadı`
                : 'Seçilen şehirde geçmiş etkinlik bulunamadı'
              : cityLabel
                ? `${cityLabel} için yaklaşan etkinlik bulunamadı`
                : 'Seçilen şehirde yaklaşan etkinlik bulunamadı'}
          </p>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            {timeRange === 'upcoming'
              ? 'Bu şehir ve filtreler için etkinlik bulunamadı. Farklı bir şehir veya kategori deneyebilirsiniz.'
              : 'Farklı bir şehir veya kategori seçerek geçmiş etkinliklere göz atın.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-2">
        {showSkeletons && [...Array(4)].map((_, i) => <EventCardSkeleton key={`sk-${i}`} />)}

        {showItems && events.map((event) => <EventCard key={event.id} event={event} />)}

        {loadingMore && <EventCardSkeleton key="sk-more" />}
      </div>

      <div ref={sentinelRef} className="h-1" aria-hidden />
    </div>
  )
}
