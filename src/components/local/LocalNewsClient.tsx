'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  MapPin, Search, X, ChevronDown, RefreshCw,
  Navigation, AlertCircle, Loader2, Clock,
} from 'lucide-react'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { postService } from '@/services/postService'
import { getCurrentPosition } from '@/lib/location'
import { nearestProvinceSlug, getCityCategoryName } from '@/constants/cities'
import { resolveTimelineImageUrl } from '@/lib/feedMediaUtils'
import { formatTimelineRelative } from '@/lib/timelineUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { shouldShowBreakingBadge } from '@/lib/newsBreaking'
import {
  readStoredUserLocation,
  writeStoredUserLocation,
} from '@/lib/userLocationStorage'
import { cn } from '@/lib/utils'
import type { Post } from '@/types/post'

// ── Types ──────────────────────────────────────────────────────────────
type LocationState = 'idle' | 'requesting' | 'granted' | 'denied' | 'stored'

interface LocalCity {
  slug: string
  name: string
  lat: number
  lng: number
}

// ── City search helper ─────────────────────────────────────────────────
function searchCities(q: string): LocalCity[] {
  if (!q.trim()) return TURKISH_PROVINCES.slice(0, 20).map(p => ({ slug: p.slug, name: p.name, lat: p.lat, lng: p.lng }))
  const lower = q.toLocaleLowerCase('tr-TR')
  return TURKISH_PROVINCES
    .filter(p => p.name.toLocaleLowerCase('tr-TR').includes(lower) || p.slug.includes(lower))
    .slice(0, 10)
    .map(p => ({ slug: p.slug, name: p.name, lat: p.lat, lng: p.lng }))
}

// ── News card ──────────────────────────────────────────────────────────
function LocalNewsCard({ post }: { post: Post }) {
  const { url: imageUrl, isFallback } = resolveTimelineImageUrl(post)
  const rel = formatTimelineRelative(post.publishedAt)
  const showBreaking = shouldShowBreakingBadge(post)
  const href = post.slug && post.slug !== post.id
    ? ROUTES.NEWS_DETAIL(post.slug)
    : ROUTES.POST_DETAIL(post.id)

  return (
    <Link
      href={href}
      className="group flex gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3 transition-all hover:border-[rgb(var(--color-brand))]/40 hover:shadow-sm"
    >
      {!isFallback && imageUrl && (
        <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-36">
          <Image
            src={imageUrl}
            alt=""
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            sizes="144px"
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {showBreaking && (
            <span className="inline-flex items-center gap-1 rounded bg-[rgb(var(--color-brand))] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              Son Dakika
            </span>
          )}
          <span className="text-[11px] font-medium text-[rgb(var(--color-muted))]">
            {getCategoryLabel(post.categoryId)}
          </span>
        </div>
        <h3 className="line-clamp-3 text-sm font-bold leading-snug text-[rgb(var(--color-text))] group-hover:text-[rgb(var(--color-brand))] sm:text-[0.9375rem]">
          {post.title}
        </h3>
        {rel && (
          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-[rgb(var(--color-muted))]">
            <Clock className="h-3 w-3" />
            {rel}
          </div>
        )}
      </div>
    </Link>
  )
}

// ── City selector sheet ────────────────────────────────────────────────
function CitySelectorSheet({
  onSelect,
  onClose,
}: {
  onSelect: (city: LocalCity) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchCities(query), [query])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[80dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[rgb(var(--color-surface))] shadow-2xl sm:rounded-3xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[rgb(var(--color-border))]" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[rgb(var(--color-border))] px-4 py-3">
          <MapPin className="h-5 w-5 text-[rgb(var(--color-brand))]" />
          <h2 className="flex-1 text-base font-black text-[rgb(var(--color-text))]">Şehir Seç</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-[rgb(var(--color-card))]">
            <X className="h-4 w-4 text-[rgb(var(--color-muted))]" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-[rgb(var(--color-border))] px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl bg-[rgb(var(--color-card))] px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
            <input
              ref={inputRef}
              type="search"
              placeholder="Şehir ara… (İstanbul, Ankara, İzmir…)"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')}>
                <X className="h-3.5 w-3.5 text-[rgb(var(--color-muted))]" />
              </button>
            )}
          </div>
        </div>

        {/* City list */}
        <div className="flex-1 overflow-y-auto">
          {results.map(city => (
            <button
              key={city.slug}
              type="button"
              onClick={() => onSelect(city)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[rgb(var(--color-card))]"
            >
              <MapPin className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
              <span className="text-sm font-semibold text-[rgb(var(--color-text))]">{city.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-[rgb(var(--color-card))]', className)} />
}

function NewsSkeletons() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3">
          <Skeleton className="h-20 w-28 shrink-0 sm:h-24 sm:w-36" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────
export function LocalNewsClient() {
  const [locationState, setLocationState] = useState<LocationState>('idle')
  const [city, setCity] = useState<LocalCity | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCitySheet, setShowCitySheet] = useState(false)
  const requestedRef = useRef(false)

  // ── Load stored city on mount ────────────────────────────────────
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
    // No stored city → request geolocation
    requestGeolocation()
  }, [])

  // ── Load news when city changes ──────────────────────────────────
  useEffect(() => {
    if (!city) return
    let cancelled = false
    setLoading(true)
    setError(null)

    void postService
      .getNewsTimeline(undefined, {
        feedSource: 'nahaber',
        citySlug: city.slug,
      })
      .then(result => {
        if (cancelled) return
        // If no city-specific news, fallback to yerel-haber category
        if (result.posts.length === 0) {
          return postService.getNewsTimeline(undefined, {
            feedSource: 'nahaber',
            categoryId: 'yerel-haber',
          })
        }
        return result
      })
      .then(result => {
        if (!cancelled && result) setPosts(result.posts)
      })
      .catch(() => {
        if (!cancelled) setError('Haberler yüklenemedi')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [city?.slug])

  // ── Request geolocation ──────────────────────────────────────────
  const requestGeolocation = useCallback(async () => {
    if (requestedRef.current) return
    requestedRef.current = true
    setLocationState('requesting')

    try {
      const position = await getCurrentPosition()
      const { latitude: lat, longitude: lng } = position.coords
      const slug = nearestProvinceSlug(lat, lng)
      const name = getCityCategoryName(slug)
      const province = TURKISH_PROVINCES.find(p => p.slug === slug)!

      const newCity: LocalCity = { slug, name, lat: province.lat, lng: province.lng }
      setCity(newCity)
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
      setLocationState('denied')
      // Show city selector automatically on deny
      setShowCitySheet(true)
    }
  }, [])

  // ── Change city ──────────────────────────────────────────────────
  const handleSelectCity = useCallback((selected: LocalCity) => {
    setCity(selected)
    setShowCitySheet(false)
    setLocationState('stored')
    writeStoredUserLocation({
      citySlug: selected.slug,
      cityName: selected.name,
      lat: selected.lat,
      lng: selected.lng,
      source: 'geolocation',
      updatedAt: Date.now(),
    })
    requestedRef.current = true
  }, [])

  // ── Location badge label ─────────────────────────────────────────
  const locationLabel =
    locationState === 'requesting' ? 'Konum alınıyor…'
    : locationState === 'denied' ? 'Konum izni reddedildi'
    : city ? city.name
    : 'Şehir seçilmedi'

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight text-[rgb(var(--color-text))]">
            Yerel Haberler
          </h1>
          <p className="text-xs text-[rgb(var(--color-muted))]">
            Bulunduğunuz şehre özel haberler
          </p>
        </div>

        {/* Refresh geo */}
        {locationState !== 'requesting' && (
          <button
            type="button"
            onClick={() => { requestedRef.current = false; void requestGeolocation() }}
            title="Konumu güncelle"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] transition-colors hover:border-[rgb(var(--color-brand))] hover:text-[rgb(var(--color-brand))]"
          >
            <Navigation className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── City pill ── */}
      <button
        type="button"
        onClick={() => setShowCitySheet(true)}
        className={cn(
          'flex items-center gap-2 rounded-2xl border px-4 py-3 text-left transition-all w-full',
          city
            ? 'border-[rgb(var(--color-brand))]/40 bg-[rgb(var(--color-brand))]/5'
            : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]'
        )}
      >
        {locationState === 'requesting' ? (
          <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-brand))]" />
        ) : locationState === 'denied' ? (
          <AlertCircle className="h-5 w-5 text-amber-500" />
        ) : (
          <MapPin className="h-5 w-5 text-[rgb(var(--color-brand))]" />
        )}

        <div className="min-w-0 flex-1">
          <p className={cn(
            'text-base font-black leading-tight',
            city ? 'text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-muted))]'
          )}>
            {locationState === 'requesting' ? 'Konum alınıyor…' : `📍 ${locationLabel}`}
          </p>
          {locationState === 'granted' && (
            <p className="text-[11px] text-[rgb(var(--color-muted))]">GPS ile tespit edildi</p>
          )}
          {locationState === 'stored' && (
            <p className="text-[11px] text-[rgb(var(--color-muted))]">Kaydedilmiş konum</p>
          )}
          {locationState === 'denied' && (
            <p className="text-[11px] text-amber-500">Şehir seçmek için dokunun</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-[rgb(var(--color-muted))]">
          <span>Değiştir</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </div>
      </button>

      {/* ── Permission denied prompt ── */}
      {locationState === 'denied' && !showCitySheet && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[rgb(var(--color-text))]">
                Konum izni alınamadı
              </p>
              <p className="mt-0.5 text-xs text-[rgb(var(--color-muted))]">
                Tarayıcı ayarlarından konum iznini etkinleştirin veya aşağıdan şehir seçin.
              </p>
              <button
                type="button"
                onClick={() => setShowCitySheet(true)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--color-brand))] px-3 py-1.5 text-xs font-bold text-white"
              >
                <MapPin className="h-3.5 w-3.5" />
                Şehir Seç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── News list ── */}
      {loading ? (
        <NewsSkeletons />
      ) : error ? (
        <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{error}</p>
          <button
            type="button"
            onClick={() => setCity(c => c ? { ...c } : c)}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[rgb(var(--color-brand))] px-4 py-2 text-xs font-bold text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tekrar dene
          </button>
        </div>
      ) : posts.length === 0 && city ? (
        <div className="rounded-2xl border border-dashed border-[rgb(var(--color-border))] py-16 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-[rgb(var(--color-muted))]" />
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
            {city.name} için haber bulunamadı
          </p>
          <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
            Yakında bu bölgeden haberler eklenecek.
          </p>
          <button
            type="button"
            onClick={() => setShowCitySheet(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--color-border))] px-4 py-2 text-xs font-semibold text-[rgb(var(--color-text))]"
          >
            Başka şehir seç
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <LocalNewsCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {/* ── City selector sheet ── */}
      {showCitySheet && (
        <CitySelectorSheet
          onSelect={handleSelectCity}
          onClose={() => setShowCitySheet(false)}
        />
      )}
    </div>
  )
}
