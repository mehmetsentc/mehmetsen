'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MapPin, Search, X,
  Navigation, AlertCircle, Loader2,
} from 'lucide-react'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { postService } from '@/services/postService'
import { getCurrentPosition } from '@/lib/location'
import { nearestProvinceSlug, getCityCategoryName } from '@/constants/cities'
import {
  readStoredUserLocation,
  writeStoredUserLocation,
} from '@/lib/userLocationStorage'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { cn } from '@/lib/utils'
import { TimelineItem } from '@/components/feed/TimelineItem'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import type { TimelinePost } from '@/types/post'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { usePageState } from '@/hooks/usePageState'
import { PAGE_STATE_KEYS } from '@/lib/stateKeys'

type LocationState = 'idle' | 'requesting' | 'granted' | 'denied' | 'stored'

interface LocalCity {
  slug: string
  name: string
  lat: number
  lng: number
}

const ALL_CITIES: LocalCity[] = TURKISH_PROVINCES.map(p => ({
  slug: p.slug,
  name: p.name,
  lat: p.lat,
  lng: p.lng,
}))

export function LocalNewsClient() {
  const [locationState, setLocationState] = useState<LocationState>('idle')
  const [city, setCity]               = useState<LocalCity | null>(null)
  const [query, setQuery]             = useState('')
  const [posts, setPosts]             = useState<TimelinePost[]>([])
  const [lastDoc, setLastDoc]         = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore]         = useState(false)
  const [loading, setLoading]         = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [storedCitySlug, setStoredCitySlug] = usePageState<string | null>(
    PAGE_STATE_KEYS.localCitySlug,
    null
  )

  const requestedRef   = useRef(false)
  const citySlugRef    = useRef<string | null>(null)
  const geoAbortRef    = useRef(false)
  const chipsScrollRef = useRef<HTMLDivElement>(null)
  const selectedChipRef = useRef<HTMLButtonElement>(null)

  // Filtered city list based on search query
  const filteredCities = query.trim()
    ? ALL_CITIES.filter(c =>
        c.name.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')) ||
        c.slug.includes(query.toLocaleLowerCase('tr-TR'))
      )
    : ALL_CITIES

  // Scroll selected chip into view
  useEffect(() => {
    if (selectedChipRef.current && chipsScrollRef.current) {
      selectedChipRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [city?.slug])

  const fetchFirst = useCallback(async (citySlug: string) => {
    citySlugRef.current = citySlug
    setLoading(true)
    setError(null)
    setPosts([])
    setLastDoc(null)
    setHasMore(false)

    try {
      const result = citySlug === '__all__'
        ? await postService.getNewsTimeline(undefined, { categoryId: 'yerel-haber' })
        : await postService.getNewsTimeline(undefined, { citySlug })

      if (citySlugRef.current !== citySlug) return
      setPosts(result.posts as TimelinePost[])
      setLastDoc(result.lastDoc ?? null)
      setHasMore(result.hasMore)
    } catch (err) {
      if (citySlugRef.current !== citySlug) return
      console.error('[LocalNewsClient] fetch failed:', err)
      setError('Haberler yüklenemedi')
    } finally {
      if (citySlugRef.current === citySlug) setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!lastDoc || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const params = city ? { citySlug: city.slug } : { categoryId: 'yerel-haber' }
      const result = await postService.getNewsTimeline(lastDoc, params)
      setPosts(prev => [...prev, ...result.posts as TimelinePost[]])
      setLastDoc(result.lastDoc ?? null)
      setHasMore(result.hasMore)
    } catch { /* sessiz */ } finally {
      setLoadingMore(false)
    }
  }, [city, lastDoc, loadingMore, hasMore])

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
      const slug     = nearestProvinceSlug(lat, lng)
      const name     = getCityCategoryName(slug)
      const province = TURKISH_PROVINCES.find(p => p.slug === slug)!
      setCity({ slug, name, lat: province.lat, lng: province.lng })
      setLocationState('granted')
      writeStoredUserLocation({ citySlug: slug, cityName: name, lat, lng, source: 'geolocation', updatedAt: Date.now() })
    } catch {
      if (geoAbortRef.current) return
      setLocationState('denied')
      void fetchFirst('__all__')
    }
  }, [fetchFirst])

  useEffect(() => {
    const slug = storedCitySlug ?? readStoredUserLocation()?.citySlug
    if (slug && slug !== '__all__') {
      const province = TURKISH_PROVINCES.find(p => p.slug === slug)
      if (province) {
        setCity({ slug: province.slug, name: province.name, lat: province.lat, lng: province.lng })
        setLocationState('stored')
        requestedRef.current = true
        return
      }
    }
    void requestGeolocation()
  }, [requestGeolocation, storedCitySlug])

  useEffect(() => {
    if (city) void fetchFirst(city.slug)
  }, [city?.slug, fetchFirst])

  const handleSelectCity = useCallback((selected: LocalCity) => {
    geoAbortRef.current = true
    setCity(selected)
    setStoredCitySlug(selected.slug)
    setLocationState('stored')
    setQuery('')
    writeStoredUserLocation({
      citySlug: selected.slug, cityName: selected.name,
      lat: selected.lat, lng: selected.lng,
      source: 'geolocation', updatedAt: Date.now(),
    })
    requestedRef.current = true
  }, [setStoredCitySlug])

  return (
    <div className="w-full pb-8">

      {/* ── Şehir seçici: arama + kaydırmalı chip'ler ── */}
      <div className="sticky top-0 z-20 bg-[rgb(var(--color-surface))]/95 backdrop-blur-sm border-b border-[rgb(var(--color-border))] pb-2">

        {/* Arama + GPS satırı */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-[rgb(var(--color-card))] border border-[rgb(var(--color-border))] px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
            <input
              type="search"
              placeholder="Şehir ara… (İstanbul, Bursa…)"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="shrink-0">
                <X className="h-3.5 w-3.5 text-[rgb(var(--color-muted))]" />
              </button>
            )}
          </div>

          {/* GPS butonu */}
          <button
            type="button"
            onClick={() => { requestedRef.current = false; void requestGeolocation() }}
            title="GPS ile tespit et"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-brand))] transition-colors"
          >
            {locationState === 'requesting'
              ? <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--color-brand))]" />
              : <Navigation className="h-4 w-4" />}
          </button>
        </div>

        {/* 81 il chip'leri — yatay kaydırma */}
        <div
          ref={chipsScrollRef}
          className="flex gap-2 overflow-x-auto px-3 pb-1 scrollbar-hide snap-x"
        >
          {filteredCities.map(c => {
            const isSelected = city?.slug === c.slug
            return (
              <button
                key={c.slug}
                ref={isSelected ? selectedChipRef : null}
                type="button"
                onClick={() => handleSelectCity(c)}
                className={cn(
                  'shrink-0 snap-start rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
                  isSelected
                    ? 'bg-[rgb(var(--color-primary))] text-white shadow-sm'
                    : 'bg-[rgb(var(--color-card))] border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:border-[rgb(var(--color-primary))]/40'
                )}
              >
                {c.name}
              </button>
            )
          })}

          {filteredCities.length === 0 && (
            <p className="py-1.5 text-xs text-[rgb(var(--color-muted))]">Şehir bulunamadı</p>
          )}
        </div>

        {/* Seçili şehir etiketi */}
        {city && (
          <div className="flex items-center gap-1.5 px-3 pt-1 pb-0.5">
            <MapPin className="h-3 w-3 text-[rgb(var(--color-brand))]" />
            <span className="text-xs font-semibold text-[rgb(var(--color-brand))]">{city.name}</span>
            <span className="text-xs text-[rgb(var(--color-muted))]">
              {locationState === 'granted' ? '· GPS' : locationState === 'stored' ? '· Kaydedilmiş' : ''}
            </span>
          </div>
        )}
      </div>

      {/* ── Haber akışı ── */}
      <div className="mt-1">
        {loading ? (
          <div className="space-y-0">
            {[...Array(4)].map((_, i) => <TimelineItemSkeleton key={i} />)}
          </div>
        ) : error ? (
          <div className="mx-3 mt-4 rounded-2xl border border-[rgb(var(--color-border))] p-8 text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
            <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{error}</p>
            <button
              type="button"
              onClick={() => city && fetchFirst(city.slug)}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-[rgb(var(--color-brand))] px-4 py-2 text-xs font-bold text-white"
            >
              Tekrar dene
            </button>
          </div>
        ) : posts.length === 0 && !loading ? (
          <div className="mx-3 mt-4 rounded-2xl border border-dashed border-[rgb(var(--color-border))] py-12 px-6 text-center">
            <MapPin className="mx-auto mb-3 h-8 w-8 text-[rgb(var(--color-muted))]" />
            <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
              {city ? `${city.name} haberleri henüz eklenmedi` : 'Haber bulunamadı'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
              Yakında tüm şehirler eklenecek. Başka bir şehir seçebilirsiniz.
            </p>
          </div>
        ) : (
          <div className="timeline-list">
            {posts.map((post, i) => (
              <TimelineItem key={post.id} post={post} isLast={i === posts.length - 1} />
            ))}
            {loadingMore && <TimelineItemSkeleton key="sk-more" />}
          </div>
        )}
      </div>

      <div ref={sentinelRef} className="h-4" aria-hidden />
    </div>
  )
}
