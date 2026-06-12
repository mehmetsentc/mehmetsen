'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MapPin, Search, X, ChevronDown,
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

function searchCities(q: string): LocalCity[] {
  const provinces = q.trim()
    ? TURKISH_PROVINCES.filter(p =>
        p.name.toLocaleLowerCase('tr-TR').includes(q.toLocaleLowerCase('tr-TR')) ||
        p.slug.includes(q.toLocaleLowerCase('tr-TR'))
      ).slice(0, 12)
    : TURKISH_PROVINCES.slice(0, 20)
  return provinces.map(p => ({ slug: p.slug, name: p.name, lat: p.lat, lng: p.lng }))
}

function CitySelectorSheet({ onSelect, onClose }: { onSelect: (c: LocalCity) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchCities(query), [query])
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[80dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[rgb(var(--color-surface))] shadow-2xl sm:rounded-3xl">
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[rgb(var(--color-border))]" />
        </div>
        <div className="flex items-center gap-3 border-b border-[rgb(var(--color-border))] px-4 py-3">
          <MapPin className="h-5 w-5 text-[rgb(var(--color-brand))]" />
          <h2 className="flex-1 text-base font-black text-[rgb(var(--color-text))]">Şehir Seç</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-[rgb(var(--color-card))]">
            <X className="h-4 w-4 text-[rgb(var(--color-muted))]" />
          </button>
        </div>
        <div className="border-b border-[rgb(var(--color-border))] px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl bg-[rgb(var(--color-card))] px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
            <input ref={inputRef} type="search" placeholder="Şehir ara… (İstanbul, İzmir…)"
              value={query} onChange={e => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none" />
            {query && (
              <button type="button" onClick={() => setQuery('')}>
                <X className="h-3.5 w-3.5 text-[rgb(var(--color-muted))]" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {results.map(city => (
            <button key={city.slug} type="button" onClick={() => onSelect(city)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[rgb(var(--color-card))]">
              <MapPin className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
              <span className="text-sm font-semibold text-[rgb(var(--color-text))]">{city.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function LocalNewsClient() {
  const [locationState, setLocationState] = useState<LocationState>('idle')
  const [city, setCity]               = useState<LocalCity | null>(null)
  const [posts, setPosts]             = useState<TimelinePost[]>([])
  const [lastDoc, setLastDoc]         = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore]         = useState(false)
  const [loading, setLoading]         = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [showCitySheet, setShowCitySheet] = usePageState(PAGE_STATE_KEYS.localCitySheetOpen, false)
  const [storedCitySlug, setStoredCitySlug] = usePageState<string | null>(
    PAGE_STATE_KEYS.localCitySlug,
    null
  )
  const requestedRef = useRef(false)
  const citySlugRef  = useRef<string | null>(null)

  const fetchFirst = useCallback(async (citySlug: string) => {
    setLoading(true)
    setError(null)
    setPosts([])
    setLastDoc(null)
    setHasMore(false)
    citySlugRef.current = citySlug

    try {
      let result

      if (citySlug === '__all__') {
        // Konum alınamadı — tüm yerel haberleri göster, şehir filtresi yok
        result = await postService.getNewsTimeline(undefined, { categoryId: 'yerel-haber' })
      } else {
        // Şehir belli — SADECE o şehrin haberleri, fallback yok
        result = await postService.getNewsTimeline(undefined, { citySlug })
      }

      if (citySlugRef.current !== citySlug) return

      setPosts(result.posts as TimelinePost[])
      setLastDoc(result.lastDoc ?? null)
      setHasMore(result.hasMore)
    } catch (err) {
      console.error('[LocalNewsClient] fetch failed:', err)
      setError('Haberler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!lastDoc || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const params = city
        ? { citySlug: city.slug }
        : { categoryId: 'yerel-haber' }
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
    setLocationState('requesting')
    try {
      const pos = await getCurrentPosition()
      const { latitude: lat, longitude: lng } = pos.coords
      const slug     = nearestProvinceSlug(lat, lng)
      const name     = getCityCategoryName(slug)
      const province = TURKISH_PROVINCES.find(p => p.slug === slug)!
      setCity({ slug, name, lat: province.lat, lng: province.lng })
      setLocationState('granted')
      writeStoredUserLocation({ citySlug: slug, cityName: name, lat, lng, source: 'geolocation', updatedAt: Date.now() })
    } catch {
      setLocationState('denied')
      // Konum izni reddedildi — şehir seçim sheet'ini aç
      setShowCitySheet(true)
      // Yine de tüm yerel haberleri yükle
      void fetchFirst('__all__')
    }
  }, [fetchFirst])

  useEffect(() => {
    const slug = storedCitySlug ?? readStoredUserLocation()?.citySlug
    if (slug && slug !== '__all__') {
      const province = TURKISH_PROVINCES.find((p) => p.slug === slug)
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
    setCity(selected)
    setStoredCitySlug(selected.slug)
    setShowCitySheet(false)
    setLocationState('stored')
    writeStoredUserLocation({ citySlug: selected.slug, cityName: selected.name, lat: selected.lat, lng: selected.lng, source: 'geolocation', updatedAt: Date.now() })
    requestedRef.current = true
  }, [setShowCitySheet, setStoredCitySlug])

  return (
    <div className={cn('w-full pb-8')}>
      {/* Konum pill */}
      <div className="mb-4 px-3 sm:px-4">
        <button type="button" onClick={() => setShowCitySheet(true)}
          className={cn(
            'flex w-full items-center gap-2 rounded-2xl border px-4 py-3 text-left transition-all',
            city ? 'border-[rgb(var(--color-brand))]/40 bg-[rgb(var(--color-brand))]/5'
                 : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]'
          )}>
          {locationState === 'requesting'
            ? <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-brand))]" />
            : locationState === 'denied'
              ? <AlertCircle className="h-5 w-5 text-amber-500" />
              : <MapPin className="h-5 w-5 text-[rgb(var(--color-brand))]" />}
          <div className="min-w-0 flex-1">
            <p className={cn('text-base font-black leading-tight',
              city ? 'text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-muted))]')}>
              {locationState === 'requesting' ? 'Konum alınıyor…' : city ? `📍 ${city.name}` : 'Şehir seçilmedi'}
            </p>
            <p className="text-[11px] text-[rgb(var(--color-muted))]">
              {locationState === 'granted' ? 'GPS ile tespit edildi'
                : locationState === 'stored' ? 'Kaydedilmiş konum'
                : locationState === 'denied' ? 'Tüm yerel haberler gösteriliyor · Şehir seç'
                : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs text-[rgb(var(--color-muted))]">
            <span>Değiştir</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
        </button>

        {locationState !== 'requesting' && city && (
          <button type="button"
            onClick={() => { requestedRef.current = false; void requestGeolocation() }}
            className="mt-2 flex items-center gap-2 text-xs text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-brand))]">
            <Navigation className="h-3.5 w-3.5" />
            GPS ile konumu güncelle
          </button>
        )}
      </div>

      {/* Feed — ana feed ile aynı TimelineItem */}
      {loading ? (
        <div className="space-y-0">
          {[...Array(4)].map((_, i) => <TimelineItemSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="mx-3 rounded-2xl border border-[rgb(var(--color-border))] p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{error}</p>
          <button type="button" onClick={() => city && fetchFirst(city.slug)}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[rgb(var(--color-brand))] px-4 py-2 text-xs font-bold text-white">
            Tekrar dene
          </button>
        </div>
      ) : posts.length === 0 && !loading ? (
        <div className="mx-3 rounded-2xl border border-dashed border-[rgb(var(--color-border))] py-16 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-[rgb(var(--color-muted))]" />
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
            {city ? `${city.name} için haber bulunamadı` : 'Haber bulunamadı'}
          </p>
          <button type="button" onClick={() => setShowCitySheet(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--color-border))] px-4 py-2 text-xs font-semibold text-[rgb(var(--color-text))]">
            Başka şehir seç
          </button>
        </div>
      ) : (
        <div className="timeline-list">
          {posts.map((post, i) => (
            <TimelineItem key={post.id} post={post} isLast={i === posts.length - 1} />
          ))}
          {loadingMore && <TimelineItemSkeleton key="sk-more" />}
        </div>
      )}

      <div ref={sentinelRef} className="h-4" aria-hidden />

      {showCitySheet && (
        <CitySelectorSheet onSelect={handleSelectCity} onClose={() => setShowCitySheet(false)} />
      )}
    </div>
  )
}
