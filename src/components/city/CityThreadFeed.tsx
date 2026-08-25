'use client'

/**
 * CityThreadFeed — Twitter/Threads tarzı şehir haberleri akışı.
 *
 * Özellikler:
 *   • Kategori seçimine göre dinamik haber yükleme
 *   • Sola/sağa kaydırarak kategoriler arası geçiş
 *   • Sonsuz scroll (load more)
 *   • Her kart CityThreadCard — başlık, özet-expand, görsel, aksiyonlar
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCityCategoryFilter } from '@/store/cityCategoryContext'
import { useCityTenant } from '@/store/cityTenantContext'
import { CityThreadCard } from './CityThreadCard'
import type { NewsItem } from '@/types/newsItem'

// ─── Swipe sabitler ───────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 55   // px min yatay hareket
const SWIPE_ANGLE = 0.65     // tan(~33°) — yatay bias

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="border-b border-[rgb(var(--color-border))] px-4 py-4">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="h-9 w-9 animate-pulse rounded-full bg-[rgb(var(--color-border))]" />
        <div className="space-y-1.5">
          <div className="h-3 w-24 animate-pulse rounded bg-[rgb(var(--color-border))]" />
          <div className="h-2.5 w-14 animate-pulse rounded bg-[rgb(var(--color-border))]" />
        </div>
      </div>
      <div className="mb-2 h-4 w-full animate-pulse rounded bg-[rgb(var(--color-border))]" />
      <div className="mb-2 h-4 w-4/5 animate-pulse rounded bg-[rgb(var(--color-border))]" />
      <div className="aspect-[16/9] w-full animate-pulse rounded-xl bg-[rgb(var(--color-border))]" />
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface CityThreadFeedProps {
  initialItems: NewsItem[]
}

// ─── Bileşen ─────────────────────────────────────────────────────────────────
export function CityThreadFeed({ initialItems }: CityThreadFeedProps) {
  const { categories, activeCategoryId, setActiveCategoryId } = useCityCategoryFilter()
  const tenant = useCityTenant()
  const citySlug = tenant?.provinceSlug ?? ''

  const [items, setItems] = useState<NewsItem[]>(initialItems)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialItems.length >= 20)
  const [loadingMore, setLoadingMore] = useState(false)
  const touchRef = useRef<{ x: number; y: number } | null>(null)
  const swipeRef = useRef<'none' | 'h' | 'v'>('none')

  // Tüm kategori sırası: null (hepsi), categories[0], categories[1], ...
  const categoryOrder: (string | null)[] = [null, ...categories.map((c) => c.id)]

  // ─── Kategori değişince yeni haberler yükle ──────────────────────────────
  useEffect(() => {
    let cancelled = false
    setHasMore(true)

    if (!activeCategoryId) {
      setItems(initialItems)
      return
    }

    async function load() {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/city/news?city=${encodeURIComponent(citySlug)}&category=${encodeURIComponent(activeCategoryId!)}&limit=30`,
        )
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { items?: NewsItem[] }
          setItems(data.items ?? [])
          setHasMore((data.items?.length ?? 0) >= 30)
        }
      } catch {
        // sessiz hata
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [activeCategoryId, citySlug, initialItems])

  // ─── Daha fazla yükle ────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const last = items[items.length - 1]
      const afterParam = last?.publishedAt
        ? `&after=${encodeURIComponent(last.publishedAt)}`
        : ''
      const catParam = activeCategoryId
        ? `&category=${encodeURIComponent(activeCategoryId)}`
        : ''
      const res = await fetch(
        `/api/city/news?city=${encodeURIComponent(citySlug)}&limit=20${catParam}${afterParam}`,
      )
      if (res.ok) {
        const data = (await res.json()) as { items?: NewsItem[] }
        const next = data.items ?? []
        setItems((prev) => {
          const ids = new Set(prev.map((i) => i.id))
          return [...prev, ...next.filter((n) => !ids.has(n.id))]
        })
        setHasMore(next.length >= 20)
      }
    } catch {
      // sessiz hata
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, items, activeCategoryId, citySlug])

  // ─── Sonsuz scroll ───────────────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) void loadMore() },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  // ─── Yatay swipe ile kategori geçişi ─────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchRef.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY }
    swipeRef.current = 'none'
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current || swipeRef.current !== 'none') return
    const dx = e.touches[0]!.clientX - touchRef.current.x
    const dy = e.touches[0]!.clientY - touchRef.current.y
    if (Math.abs(dx) < 8) return
    swipeRef.current = Math.abs(dy / dx) < SWIPE_ANGLE ? 'h' : 'v'
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchRef.current || swipeRef.current !== 'h') return
      const dx = e.changedTouches[0]!.clientX - touchRef.current.x
      touchRef.current = null
      swipeRef.current = 'none'
      if (Math.abs(dx) < SWIPE_THRESHOLD) return

      const currentIdx = categoryOrder.indexOf(activeCategoryId)
      const nextIdx = dx < 0
        ? Math.min(currentIdx + 1, categoryOrder.length - 1)  // sola → sonraki
        : Math.max(currentIdx - 1, 0)                          // sağa → önceki

      if (nextIdx !== currentIdx) {
        const newCat = categoryOrder[nextIdx] ?? null
        setActiveCategoryId(newCat)
        // Aktif chip'i görünür yap
        setTimeout(() => {
          const chipId = newCat ?? '__all'
          document.querySelector(`[data-category-chip="${chipId}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
        }, 60)
      }
    },
    [activeCategoryId, categoryOrder, setActiveCategoryId],
  )

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-[60vh]"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Kategori geçiş indikatörü (swipe sırasında göster) */}

      {loading ? (
        <>
          {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
        </>
      ) : items.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-base font-semibold text-[rgb(var(--color-text))]">
            Henüz haber yok
          </p>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            Bu kategoride haber bulunamadı.
          </p>
        </div>
      ) : (
        <>
          {items.map((item, i) => (
            <CityThreadCard
              key={item.id}
              item={item}
              feedItems={items}
              feedIndex={i}
              priority={i === 0}
            />
          ))}

          {/* Sonsuz scroll tetikleyici */}
          <div ref={sentinelRef} className="h-4" />

          {loadingMore && (
            <div className="py-4 text-center">
              {[...Array(2)].map((_, i) => <CardSkeleton key={i} />)}
            </div>
          )}

          {!hasMore && items.length > 0 && (
            <p className="py-8 text-center text-sm text-[rgb(var(--color-muted))]">
              Tüm haberler yüklendi.
            </p>
          )}
        </>
      )}
    </div>
  )
}
