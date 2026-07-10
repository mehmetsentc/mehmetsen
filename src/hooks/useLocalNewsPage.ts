'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { postService } from '@/services/postService'
import { getCurrentPosition } from '@/lib/location'
import { nearestProvinceSlug, getCityCategoryName } from '@/constants/cities'
import {
  readStoredUserLocation,
  writeStoredUserLocation,
} from '@/lib/userLocationStorage'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { useUserLocation } from '@/hooks/useUserLocation'
import { usePageState } from '@/hooks/usePageState'
import { PAGE_STATE_KEYS } from '@/lib/stateKeys'
import {
  FEED_LIVE_DEFER_MS,
  FEED_LIVE_POLL_MS,
  notifyFeedUpdated,
} from '@/lib/feedLiveToast'
import type { TimelinePost } from '@/types/post'
import type { QueryDocumentSnapshot } from 'firebase/firestore'

export type LocalNewsActiveTab = 'haberler' | 'eczaneler'
export type LocalNewsLocationState = 'idle' | 'requesting' | 'granted' | 'denied' | 'stored'

export interface LocalCity {
  slug: string
  name: string
  lat: number
  lng: number
}

export const LOCAL_NEWS_PAGE_SIZE = 20

export const LOCAL_NEWS_CITIES: LocalCity[] = TURKISH_PROVINCES.map((p) => ({
  slug: p.slug,
  name: p.name,
  lat: p.lat,
  lng: p.lng,
}))

export function useLocalNewsPage() {
  const userLocation = useUserLocation()
  const [locationState, setLocationState] = useState<LocalNewsLocationState>('idle')
  const [activeTab, setActiveTab] = useState<LocalNewsActiveTab>('haberler')
  const [city, setCity] = useState<LocalCity | null>(null)
  const [query, setQuery] = useState('')
  const [posts, setPosts] = useState<TimelinePost[]>([])
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showingGeneralFallback, setShowingGeneralFallback] = useState(false)
  const [storedCitySlug, setStoredCitySlug] = usePageState<string | null>(
    PAGE_STATE_KEYS.localCitySlug,
    null
  )

  const requestedRef = useRef(false)
  const citySlugRef = useRef<string | null>(null)
  const geoAbortRef = useRef(false)
  const chipsScrollRef = useRef<HTMLDivElement>(null)
  const selectedChipRef = useRef<HTMLButtonElement>(null)
  const liveReadyRef = useRef(false)
  const showingFallbackRef = useRef(false)
  const initialLoadDoneRef = useRef(false)

  const filteredCities = query.trim()
    ? LOCAL_NEWS_CITIES.filter(
        (c) =>
          c.name.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')) ||
          c.slug.includes(query.toLocaleLowerCase('tr-TR'))
      )
    : LOCAL_NEWS_CITIES

  useEffect(() => {
    if (selectedChipRef.current && chipsScrollRef.current) {
      selectedChipRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [city?.slug])

  const applyCity = useCallback((province: (typeof TURKISH_PROVINCES)[number], state: LocalNewsLocationState) => {
    setCity({
      slug: province.slug,
      name: province.name,
      lat: province.lat,
      lng: province.lng,
    })
    setLocationState(state)
    requestedRef.current = true
  }, [])

  const fetchFirst = useCallback(async (citySlug: string) => {
    citySlugRef.current = citySlug
    setLoading(true)
    setError(null)
    setPosts([])
    setLastDoc(null)
    setHasMore(false)
    setShowingGeneralFallback(false)
    showingFallbackRef.current = false
    liveReadyRef.current = false
    initialLoadDoneRef.current = false

    try {
      let result =
        citySlug === '__all__'
          ? await postService.getNewsTimeline(undefined, {
              categoryId: 'yerel-haber',
              limit: LOCAL_NEWS_PAGE_SIZE,
            })
          : await postService.getNewsTimeline(undefined, {
              citySlug,
              limit: LOCAL_NEWS_PAGE_SIZE,
            })

      if (citySlugRef.current !== citySlug) return

      if (citySlug !== '__all__' && result.posts.length === 0) {
        setShowingGeneralFallback(true)
        showingFallbackRef.current = true
        result = await postService.getNewsTimeline(undefined, {
          categoryId: 'yerel-haber',
          limit: LOCAL_NEWS_PAGE_SIZE,
        })
        if (citySlugRef.current !== citySlug) return
      }

      setPosts(result.posts as TimelinePost[])
      setLastDoc(result.lastDoc ?? null)
      setHasMore(result.hasMore)
      initialLoadDoneRef.current = true
    } catch (err) {
      if (citySlugRef.current !== citySlug) return
      console.error('[useLocalNewsPage] fetch failed:', err)
      setError('Haberler yüklenemedi')
    } finally {
      if (citySlugRef.current === citySlug) setLoading(false)
    }
  }, [])

  const prependLivePosts = useCallback((incoming: TimelinePost[], notify: boolean) => {
    if (!initialLoadDoneRef.current || incoming.length === 0) return

    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id))
      const fresh = incoming.filter((p) => !seen.has(p.id))
      if (fresh.length === 0) return prev
      if (notify) notifyFeedUpdated(fresh.length)
      return [...fresh, ...prev]
    })
  }, [])

  const loadMore = useCallback(async () => {
    if (!lastDoc || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const params = showingGeneralFallback || !city
        ? { categoryId: 'yerel-haber' as const, limit: LOCAL_NEWS_PAGE_SIZE }
        : { citySlug: city.slug, limit: LOCAL_NEWS_PAGE_SIZE }
      const result = await postService.getNewsTimeline(lastDoc, params)
      setPosts((prev) => [...prev, ...(result.posts as TimelinePost[])])
      setLastDoc(result.lastDoc ?? null)
      setHasMore(result.hasMore)
    } catch {
      /* sessiz */
    } finally {
      setLoadingMore(false)
    }
  }, [city, lastDoc, loadingMore, hasMore, showingGeneralFallback])

  const { sentinelRef } = useInfiniteScroll({ onLoadMore: loadMore, hasMore, loading: loadingMore })

  const requestGeolocation = useCallback(async () => {
    if (requestedRef.current) return
    requestedRef.current = true
    geoAbortRef.current = false
    setLocationState('requesting')
    try {
      const pos = await getCurrentPosition()
      if (geoAbortRef.current) return
      const { latitude: lat, longitude: lng } = pos.coords
      const slug = nearestProvinceSlug(lat, lng)
      const name = getCityCategoryName(slug)
      const province = TURKISH_PROVINCES.find((p) => p.slug === slug)!
      setCity({ slug, name, lat: province.lat, lng: province.lng })
      setLocationState('granted')
      writeStoredUserLocation({
        citySlug: slug,
        cityName: name,
        lat,
        lng,
        source: 'geolocation',
        updatedAt: Date.now(),
      })
    } catch {
      if (geoAbortRef.current) return
      setLocationState('denied')
      void fetchFirst('__all__')
    }
  }, [fetchFirst])

  useEffect(() => {
    const slug = storedCitySlug ?? readStoredUserLocation()?.citySlug
    if (slug && slug !== '__all__') {
      const province = TURKISH_PROVINCES.find((p) => p.slug === slug)
      if (province) {
        applyCity(province, 'stored')
        return
      }
    }

    if (userLocation.ready && userLocation.source !== 'fallback' && userLocation.citySlug) {
      const province = TURKISH_PROVINCES.find((p) => p.slug === userLocation.citySlug)
      if (province) {
        applyCity(province, userLocation.source === 'geolocation' ? 'granted' : 'stored')
        return
      }
    }

    if (!requestedRef.current) {
      void requestGeolocation()
    }
  }, [
    applyCity,
    requestGeolocation,
    storedCitySlug,
    userLocation.citySlug,
    userLocation.ready,
    userLocation.source,
  ])

  useEffect(() => {
    if (city) void fetchFirst(city.slug)
  }, [city?.slug, fetchFirst])

  useEffect(() => {
    if (!initialLoadDoneRef.current || loading || !city) return

    let pollTimer: ReturnType<typeof setInterval> | null = null
    let deferTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const runPoll = () => {
      const params =
        showingFallbackRef.current
          ? { categoryId: 'yerel-haber' as const }
          : { citySlug: city.slug }

      void postService
        .getNewsTimeline(undefined, params)
        .then((result) => {
          if (cancelled) return
          if (result.posts.length === 0) {
            liveReadyRef.current = true
            return
          }
          const notify = liveReadyRef.current
          liveReadyRef.current = true
          prependLivePosts(result.posts as TimelinePost[], notify)
        })
        .catch((err) => console.warn('[useLocalNewsPage] poll failed:', err))
    }

    const startPolling = () => {
      if (pollTimer || cancelled) return
      pollTimer = setInterval(runPoll, FEED_LIVE_POLL_MS)
    }

    const handleVisibility = () => {
      if (document.hidden) {
        if (pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }
      } else if (!cancelled) {
        runPoll()
        startPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    deferTimer = setTimeout(startPolling, FEED_LIVE_DEFER_MS)

    return () => {
      cancelled = true
      liveReadyRef.current = false
      document.removeEventListener('visibilitychange', handleVisibility)
      if (deferTimer) clearTimeout(deferTimer)
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [city?.slug, loading, prependLivePosts, city])

  const handleSelectCity = useCallback(
    (selected: LocalCity) => {
      geoAbortRef.current = true
      setCity(selected)
      setStoredCitySlug(selected.slug)
      setLocationState('stored')
      setQuery('')
      writeStoredUserLocation({
        citySlug: selected.slug,
        cityName: selected.name,
        lat: selected.lat,
        lng: selected.lng,
        source: 'geolocation',
        updatedAt: Date.now(),
      })
      requestedRef.current = true
    },
    [setStoredCitySlug]
  )

  const retryFetch = useCallback(() => {
    if (city) void fetchFirst(city.slug)
  }, [city, fetchFirst])

  const resetGeolocation = useCallback(() => {
    requestedRef.current = false
    void requestGeolocation()
  }, [requestGeolocation])

  return {
    locationState,
    activeTab,
    setActiveTab,
    city,
    query,
    setQuery,
    posts,
    loading,
    loadingMore,
    error,
    showingGeneralFallback,
    filteredCities,
    chipsScrollRef,
    selectedChipRef,
    sentinelRef,
    handleSelectCity,
    retryFetch,
    resetGeolocation,
  }
}
