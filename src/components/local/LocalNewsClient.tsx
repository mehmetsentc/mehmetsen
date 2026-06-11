'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  MapPin, Search, X, ChevronDown,
  Navigation, AlertCircle, Loader2, Play,
} from 'lucide-react'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { postService } from '@/services/postService'
import { getCurrentPosition } from '@/lib/location'
import { nearestProvinceSlug, getCityCategoryName } from '@/constants/cities'
import { resolveTimelineImageUrl, FEED_FALLBACK_LOGO, getCategoryFallbackGradient } from '@/lib/feedMediaUtils'
import { formatTimelineTime, formatTimelineRelative } from '@/lib/timelineUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { shouldShowBreakingBadge } from '@/lib/newsBreaking'
import { hasVideoContent } from '@/lib/postUtils'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import {
  readStoredUserLocation,
  writeStoredUserLocation,
} from '@/lib/userLocationStorage'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { cn } from '@/lib/utils'
import type { Post, TimelinePost } from '@/types/post'
import type { QueryDocumentSnapshot } from 'firebase/firestore'

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

// Feed-style büyük kart (TimelineItem ile aynı tasarım)
function LocalFeedCard({ post }: { post: Post | TimelinePost }) {
  const { url: imageUrl, isFallback } = resolveTimelineImageUrl(post as TimelinePost)
  const fallbackGradient = getCategoryFallbackGradient(post.categoryId)
  const timeLabel = formatTimelineTime(post.publishedAt)
  const rel = formatTimelineRelative(post.publishedAt)
  const showBreaking = shouldShowBreakingBadge(post as TimelinePost)
  const categoryLabel = getCategoryLabel(post.categoryId)
  const isVideo = hasVideoContent(post as TimelinePost)
  const href = (post as TimelinePost).slug && (post as TimelinePost).slug !== post.id
    ? ROUTES.NEWS_DETAIL((post as TimelinePost).slug!)
    : ROUTES.POST_DETAIL(post.id)

  return (
    <article>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <time className="text-xs font-bold text-[rgb(var(--color-brand))] tabular-nums" title={rel || timeLabel}>
          {timeLabel}
        </time>
        {showBreaking && (
          <span className="inline-flex items-center gap-1 rounded bg-[rgb(var(--color-brand))] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Son Dakika
          </span>
        )}
      </div>

      <Link href={href} className="group block overflow-hidden rounded-2xl shadow-md">
        <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: '4/3' }}>
          {isFallback || !imageUrl ? (
            <div className="absolute inset-0 flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${fallbackGradient} 0%, #111827 100%)` }}>
              <Image src={FEED_FALLBACK_LOGO} alt="" width={80} height={80}
                className="h-14 w-auto opacity-80 drop-shadow-lg" />
            </div>
          ) : (
            <SafeNewsImage src={imageUrl} alt="" fill loading="lazy"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              sizes="(max-width: 640px) calc(100vw - 32px), 680px" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />
          {categoryLabel && (
            <span className="absolute left-3 top-3 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
              {categoryLabel}
            </span>
          )}
          {isVideo && (
            <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-[rgb(var(--color-brand))]/90 shadow">
              <Play className="h-4 w-4 fill-white text-white" />
            </span>
          )}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h2 className="line-clamp-3 text-[1.05rem] font-black leading-tight tracking-tight text-white drop-shadow-lg sm:text-lg">
              {post.title}
            </h2>
          </div>
        </div>
      </Link>
    </article>
  )
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

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl bg-[rgb(var(--color-card))] shadow-md" style={{ aspectRatio: '4/3' }}>
      <div className="h-full w-full animate-pulse bg-[rgb(var(--color-surface))]" />
    </div>
  )
}

export function LocalNewsClient() {
  const [locationState, setLocationState] = useState<LocationState>('idle')
  const [city, setCity]               = useState<LocalCity | null>(null)
  const [posts, setPosts]             = useState<Post[]>([])
  const [lastDoc, setLastDoc]         = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore]         = useState(false)
  const [loading, setLoading]         = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [showCitySheet, setShowCitySheet] = useState(false)
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
      // Önce şehre özel haberler
      let result = await postService.getNewsTimeline(undefined, { citySlug })
      if (citySlugRef.current !== citySlug) return

      // Şehre özel haber yoksa yerel-haber kategorisine düş
      if (result.posts.length === 0) {
        result = await postService.getNewsTimeline(undefined, { categoryId: 'yerel-haber' })
        if (citySlugRef.current !== citySlug) return
      }

      // Hâlâ boşsa son haberleri göster (en kötü ihtimal)
      if (result.posts.length === 0) {
        result = await postService.getNewsTimeline(undefined, {})
        if (citySlugRef.current !== citySlug) return
      }

      setPosts(result.posts)
      setLastDoc(result.lastDoc ?? null)
      setHasMore(result.hasMore)
    } catch (err) {
      console.error('[LocalNewsClient] fetch failed:', err)
      // Hata olsa bile genel haberleri yükle
      try {
        const fallback = await postService.getNewsTimeline(undefined, {})
        setPosts(fallback.posts)
        setLastDoc(fallback.lastDoc ?? null)
        setHasMore(fallback.hasMore)
      } catch {
        setError('Haberler yüklenemedi')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!city || !lastDoc || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const result = await postService.getNewsTimeline(lastDoc, { citySlug: city.slug })
      setPosts(prev => [...prev, ...result.posts])
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
      setShowCitySheet(true)
    }
  }, [])

  useEffect(() => {
    const stored = readStoredUserLocation()
    if (stored?.citySlug && stored.source !== 'fallback') {
      const province = TURKISH_PROVINCES.find(p => p.slug === stored.citySlug)
      if (province) {
        setCity({ slug: province.slug, name: province.name, lat: province.lat, lng: province.lng })
        setLocationState('stored')
        return
      }
    }
    void requestGeolocation()
  }, [requestGeolocation])

  useEffect(() => {
    if (city) void fetchFirst(city.slug)
  }, [city?.slug, fetchFirst])

  const handleSelectCity = useCallback((selected: LocalCity) => {
    setCity(selected)
    setShowCitySheet(false)
    setLocationState('stored')
    writeStoredUserLocation({ citySlug: selected.slug, cityName: selected.name, lat: selected.lat, lng: selected.lng, source: 'geolocation', updatedAt: Date.now() })
    requestedRef.current = true
  }, [])

  return (
    <div className={cn('space-y-4 pb-8')}>
      {/* City pill */}
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
              : locationState === 'denied' ? 'Şehir seçmek için dokunun' : ''}
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
          className="flex items-center gap-2 text-xs text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-brand))]">
          <Navigation className="h-3.5 w-3.5" />
          GPS ile konumu güncelle
        </button>
      )}

      {/* Feed */}
      {loading ? (
        <div className="space-y-5">{[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : error ? (
        <div className="rounded-2xl border border-[rgb(var(--color-border))] p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{error}</p>
          <button type="button" onClick={() => city && fetchFirst(city.slug)}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[rgb(var(--color-brand))] px-4 py-2 text-xs font-bold text-white">
            Tekrar dene
          </button>
        </div>
      ) : posts.length === 0 && city ? (
        <div className="rounded-2xl border border-dashed border-[rgb(var(--color-border))] py-16 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-[rgb(var(--color-muted))]" />
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{city.name} için haber bulunamadı</p>
          <button type="button" onClick={() => setShowCitySheet(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--color-border))] px-4 py-2 text-xs font-semibold text-[rgb(var(--color-text))]">
            Başka şehir seç
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-5">
            {posts.map(post => <LocalFeedCard key={post.id} post={post} />)}
          </div>
          <div ref={sentinelRef} className="h-4" />
          {loadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
            </div>
          )}
          {!hasMore && posts.length > 0 && (
            <p className="text-center text-xs text-[rgb(var(--color-muted))]">Tüm haberler gösterildi</p>
          )}
        </>
      )}

      {showCitySheet && (
        <CitySelectorSheet onSelect={handleSelectCity} onClose={() => setShowCitySheet(false)} />
      )}
    </div>
  )
}
