'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HomeFeed } from '@/components/home/HomeFeed'
import { MobileMagazineFeed } from '@/components/home/MobileMagazineFeed'
import { useCityCategoryFilter } from '@/store/cityCategoryContext'
import { useCityTenant } from '@/store/cityTenantContext'
import type { HomeCategorySlug, HomeFeedInitialData, NewsItem } from '@/types/newsItem'
import type { NaEvent } from '@/types/event'

const SWIPE_THRESHOLD = 55
const SWIPE_ANGLE = 0.65

interface CityHomeMagazineProps {
  homeFeedData: HomeFeedInitialData
  cityName: string
  cinemaEvents?: NaEvent[]
}

/**
 * National-style magazine homepage for city tenants.
 * Hepsi → HomeFeed (cityMode). Category chip → same magazine cards, city-scoped.
 */
export function CityHomeMagazine({
  homeFeedData,
  cityName,
  cinemaEvents = [],
}: CityHomeMagazineProps) {
  const { categories, activeCategoryId, setActiveCategoryId } = useCityCategoryFilter()
  const tenant = useCityTenant()
  const citySlug = tenant?.provinceSlug ?? ''
  const categoryRailIds = Object.keys(homeFeedData.categoryRails) as HomeCategorySlug[]

  const [items, setItems] = useState<NewsItem[]>(homeFeedData.latest)
  const [loading, setLoading] = useState(false)
  const touchRef = useRef<{ x: number; y: number } | null>(null)
  const swipeRef = useRef<'none' | 'h' | 'v'>('none')
  const [swipeToast, setSwipeToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const categoryOrder: (string | null)[] = useMemo(
    () => [null, ...categories.map((c) => c.id)],
    [categories]
  )

  const categoryLabelMap = useMemo(() => {
    const m = new Map<string | null, string>([[null, 'Hepsi']])
    categories.forEach((c) => m.set(c.id, c.name))
    return m
  }, [categories])

  useEffect(() => {
    let cancelled = false
    if (!activeCategoryId) {
      setItems(homeFeedData.latest)
      setLoading(false)
      return
    }

    async function load() {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/city/news?city=${encodeURIComponent(citySlug)}&category=${encodeURIComponent(activeCategoryId!)}&limit=30`
        )
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { items?: NewsItem[] }
          setItems(data.items ?? [])
        }
      } catch {
        /* keep last list */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [activeCategoryId, citySlug, homeFeedData.latest])

  function scrollChipIntoView(catId: string | null) {
    const chipId = catId ?? '__all'
    setTimeout(() => {
      const chip = document.querySelector(`[data-category-chip="${chipId}"]`) as HTMLElement | null
      chip?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }, 80)
  }

  function showToast(catId: string | null) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setSwipeToast(categoryLabelMap.get(catId) ?? null)
    toastTimer.current = setTimeout(() => setSwipeToast(null), 1_400)
  }

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
      const nextIdx =
        dx < 0
          ? Math.min(currentIdx + 1, categoryOrder.length - 1)
          : Math.max(currentIdx - 1, 0)

      if (nextIdx !== currentIdx) {
        const newCat = categoryOrder[nextIdx] ?? null
        setActiveCategoryId(newCat)
        scrollChipIntoView(newCat)
        showToast(newCat)
      }
    },
    [activeCategoryId, categoryOrder, setActiveCategoryId, categoryLabelMap]
  )

  if (!activeCategoryId) {
    return (
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {swipeToast ? (
          <div className="pointer-events-none fixed inset-x-0 top-1/2 z-[60] flex -translate-y-1/2 items-center justify-center">
            <div className="rounded-2xl bg-black/80 px-7 py-3.5 text-[18px] font-bold text-white shadow-xl">
              {swipeToast}
            </div>
          </div>
        ) : null}
        <HomeFeed
          data={homeFeedData}
          cityMode
          categoryRailIds={categoryRailIds}
          cinemaEvents={cinemaEvents}
          cityName={cityName}
        />
      </div>
    )
  }

  return (
    <div
      className="home-feed mx-auto w-full max-w-3xl pb-6 max-md:pb-10 max-md:pt-4"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {swipeToast ? (
        <div className="pointer-events-none fixed inset-x-0 top-1/2 z-[60] flex -translate-y-1/2 items-center justify-center">
          <div className="rounded-2xl bg-black/80 px-7 py-3.5 text-[18px] font-bold text-white shadow-xl">
            {swipeToast}
          </div>
        </div>
      ) : null}
      <section className="home-section max-md:!mb-6 max-md:!mt-2 max-md:!px-0" aria-label="Kategori haberleri">
        {loading ? (
          <div className="sd-feed px-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="sd-feed__skeleton">
                <div className="sd-feed__skeleton-time animate-pulse bg-[rgb(var(--color-border))]" />
                <div className="sd-feed__skeleton-title animate-pulse bg-[rgb(var(--color-border))]" />
                <div className="sd-feed__skeleton-media animate-pulse bg-[rgb(var(--color-border))]" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold text-[rgb(var(--color-text))]">Henüz haber yok</p>
            <p className="mt-1 text-sm text-[rgb(var(--color-text-secondary))]">
              Bu kategoride henüz haber bulunmuyor.
            </p>
          </div>
        ) : (
          <MobileMagazineFeed items={items} />
        )}
      </section>
    </div>
  )
}
