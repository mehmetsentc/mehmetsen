'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { dedupeEvents } from '@/lib/eventDedupe'
import { fetchAggregatedEvents } from '@/lib/eventAggregateClient'
import { sortEventsByLocation, type UserCoords } from '@/lib/eventLocation'
import { isFirestoreInternalError } from '@/lib/firestoreQueue'
import {
  eventService,
  filterEventsForQuery,
  sortEventsByTimeRange,
  type EventTimeRange,
  type EventsDataSource,
} from '@/services/eventService'
import type { EventCategory, NaEvent } from '@/types/event'

function toEventsError(error: unknown): string {
  if (isFirestoreInternalError(error)) {
    return 'Bağlantı hatası oluştu. Lütfen tekrar deneyin.'
  }
  return error instanceof Error ? error.message : 'Etkinlikler yüklenemedi'
}

interface UseEventsArgs {
  /** City to filter by. While `null`/`undefined` the hook waits (loading). */
  citySlug?: string | null
  category?: EventCategory | null
  /** Upcoming (default) or past ("Geçmiş") events. */
  timeRange?: EventTimeRange
  /** The user's home city slug (profile location) — used for sorting. */
  userCitySlug?: string | null
  /** Precise user coords; when present + `nearby`, sort by distance. */
  userCoords?: UserCoords | null
  /**
   * "Yakınımdaki etkinlikler" mode: ignore the city chip, pull events from all
   * cities, and sort by distance to `userCoords`.
   */
  nearby?: boolean
}

export function useEvents({
  citySlug,
  category,
  timeRange = 'upcoming',
  userCitySlug,
  userCoords,
  nearby = false,
}: UseEventsArgs) {
  const [events, setEvents] = useState<NaEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [dataSource, setDataSource] = useState<EventsDataSource | null>(null)

  const effectiveCity = nearby ? null : (citySlug ?? null)
  // Always ready — null citySlug means "tüm şehirler" (fetch all events)
  const ready = true

  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null)
  const effectiveCityRef = useRef(effectiveCity)
  const categoryRef = useRef(category)
  const timeRangeRef = useRef(timeRange)
  const nearbyRef = useRef(nearby)
  const retryOnceRef = useRef(false)

  effectiveCityRef.current = effectiveCity
  categoryRef.current = category
  timeRangeRef.current = timeRange
  nearbyRef.current = nearby

  const fetchEvents = useCallback(async (reset: boolean, signal?: AbortSignal) => {
    const city = effectiveCityRef.current
    const cat = categoryRef.current ?? undefined
    const range = timeRangeRef.current
    const isNearby = nearbyRef.current

    if (reset) {
      setLoading(true)
      setError(null)
      setDataSource(null)
      lastDocRef.current = null
    } else {
      setLoadingMore(true)
    }

    try {
      const cursor = reset ? undefined : (lastDocRef.current ?? undefined)

      const result = await eventService.getEvents({
        citySlug: city ?? undefined,
        category: cat,
        timeRange: range,
        cursor,
      })

      const nextEvents = result.events
      const nextHasMore = result.hasMore
      const nextLastDoc = result.lastDoc
      const nextSource: EventsDataSource | null =
        result.events.length > 0 ? result.source : null

      if (signal?.aborted) return

      setEvents((prev) => {
        if (reset) return nextEvents
        const seen = new Set(prev.map((e) => e.id))
        const fresh = nextEvents.filter((e) => !seen.has(e.id))
        return fresh.length > 0 ? [...prev, ...fresh] : prev
      })

      const cursorAdvanced =
        reset || (nextLastDoc != null && nextLastDoc.id !== cursor?.id)

      if (cursorAdvanced) {
        lastDocRef.current = nextLastDoc
        setHasMore(nextHasMore)
      } else {
        setHasMore(false)
      }

      setDataSource(nextSource)
      retryOnceRef.current = false

      if (reset && nextEvents.length === 0) {
        try {
          const aggregate = await fetchAggregatedEvents(
            { citySlug: isNearby ? null : city, category: cat ?? null },
            signal
          )
          if (signal?.aborted) return
          if (aggregate.events.length) {
            const filtered = sortEventsByTimeRange(
              dedupeEvents(
                filterEventsForQuery(aggregate.events, {
                  citySlug: isNearby ? undefined : (city ?? undefined),
                  category: cat,
                  timeRange: range,
                })
              ),
              range
            )
            if (filtered.length > 0) {
              setEvents(filtered)
              setHasMore(false)
              lastDocRef.current = null
              setDataSource('live')
            }
          }
        } catch {
          // aggregated opsiyonel — sessiz hata
        }
      }
    } catch (err) {
      if (signal?.aborted) return

      if (isFirestoreInternalError(err) && !retryOnceRef.current) {
        retryOnceRef.current = true
        await new Promise((resolve) => setTimeout(resolve, 300))
        return fetchEvents(reset, signal)
      }
      setError(toEventsError(err))
      setHasMore(false)
      setDataSource(null)
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [])

  const fetchEventsRef = useRef(fetchEvents)
  fetchEventsRef.current = fetchEvents

  useEffect(() => {
    if (!ready) return

    const controller = new AbortController()
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      void fetchEventsRef.current(true, controller.signal)
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [ready, effectiveCity, category, timeRange, nearby])

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading && dataSource !== 'live') {
      void fetchEventsRef.current(false)
    }
  }, [loadingMore, hasMore, loading, dataSource])

  const retry = useCallback(() => {
    retryOnceRef.current = false
    void fetchEventsRef.current(true)
  }, [])

  const sortedEvents = useMemo(() => {
    if (nearby || timeRange === 'past') {
      return sortEventsByLocation(events, {
        userCitySlug: nearby ? userCitySlug : (effectiveCity ?? userCitySlug),
        userCoords: nearby ? userCoords : null,
      })
    }
    return events
  }, [events, nearby, timeRange, effectiveCity, userCitySlug, userCoords])

  return {
    events: sortedEvents,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    retry,
    dataSource,
  }
}
