'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CalendarDays, RefreshCw } from 'lucide-react'
import { getCityCategoryName } from '@/constants/cities'
import { getCurrentPosition, slugifyCity } from '@/lib/location'
import { nearestProvinceSlug } from '@/constants/cities'
import { useAuth } from '@/hooks/useAuth'
import { useEvents } from '@/hooks/useEvents'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import type { EventCategory } from '@/types/event'
import { EventCard, EventCardSkeleton } from './EventCard'
import { EventFilters } from './EventFilters'

export function EventList() {
  const { user, loading: authLoading } = useAuth()

  const userCityName = user?.location?.trim() || null
  const userCitySlug = userCityName ? slugifyCity(userCityName) : null

  const [selectedCitySlug, setSelectedCitySlug] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const userPickedCityRef = useRef(false)
  const geoTriedRef = useRef(false)

  // Auto-detect location once on mount (silent — no button needed)
  useEffect(() => {
    if (geoTriedRef.current || userPickedCityRef.current) return
    geoTriedRef.current = true

    // If user profile has a city, use it immediately
    if (userCitySlug) {
      setSelectedCitySlug(userCitySlug)
      return
    }

    // Try browser geolocation silently
    if (!navigator?.geolocation) return

    setGeoLoading(true)
    getCurrentPosition()
      .then((pos) => {
        const slug = nearestProvinceSlug(pos.coords.latitude, pos.coords.longitude)
        if (slug && !userPickedCityRef.current) {
          setSelectedCitySlug(slug)
        }
      })
      .catch(() => {
        // Permission denied or unavailable — show all events (null citySlug)
      })
      .finally(() => setGeoLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCitySlug])

  const { events, loading, loadingMore, error, hasMore, loadMore, retry, dataSource } =
    useEvents({
      citySlug: selectedCitySlug,
      category: selectedCategory,
      timeRange: 'upcoming',
      userCitySlug,
      userCoords: null,
      nearby: false,
    })

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    loading: loadingMore,
  })

  const cityLabel = selectedCitySlug ? getCityCategoryName(selectedCitySlug) : null

  const handleCityChange = (slug: string) => {
    userPickedCityRef.current = true
    setSelectedCitySlug(slug)
  }

  const handleCityClear = () => {
    userPickedCityRef.current = false
    setSelectedCitySlug(userCitySlug ?? null)
  }

  // geoLoading is intentionally excluded — we show all events immediately,
  // then silently re-filter when geolocation resolves.
  const showSkeletons = authLoading || loading
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
            </div>
            <p className="page-subtitle text-xs">
              {cityLabel
                ? `${cityLabel} · Yaklaşan etkinlikler`
                : 'Tüm Türkiye · Yaklaşan etkinlikler'}
            </p>
          </div>
        </div>

        <EventFilters
          selectedCitySlug={selectedCitySlug}
          onCityChange={handleCityChange}
          onCityClear={handleCityClear}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          geoLoading={geoLoading}
        />
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
            {cityLabel
              ? `${cityLabel} için yaklaşan etkinlik bulunamadı`
              : 'Yaklaşan etkinlik bulunamadı'}
          </p>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            Farklı bir şehir veya kategori deneyebilirsiniz.
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
