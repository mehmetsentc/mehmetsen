'use client'

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { FeedSliderItem } from '@/types/feedSlider'
import { ROUTES } from '@/constants/routes'
import { SLIDER_HEIGHT_CLASS, SLIDER_OUTER_STYLE } from './sliderConstants'
import { SliderImage } from './SliderImage'

interface NewsSliderProps {
  categoryId?: string
  initialItems?: FeedSliderItem[]
  /** Server-rendered hero — shown until client carousel is ready (LCP). */
  children?: ReactNode
}

const AUTOPLAY_MS = 5000

function mapDoc(d: { id: string; data: () => Record<string, unknown> }): FeedSliderItem {
  const data = d.data()
  const raw =
    (data.coverImageUrl as string | null) ??
    (data.thumbnail as string | null) ??
    (data.thumbnailUrl as string | null) ??
    (data.image as string | null) ??
    (data.imageUrl as string | null) ??
    null
  return {
    id: d.id,
    title: String(data.title ?? ''),
    slug: String(data.slug ?? d.id),
    imageUrl: raw && raw.length > 5 ? raw : null,
    categoryId: String(data.categoryId ?? ''),
    publishedAt: Number(data.publishedAt ?? 0),
    sourceUrl: (data.sourceUrl as string | null) ?? null,
  }
}

async function fetchOgImage(sourceUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/og-image?url=${encodeURIComponent(sourceUrl)}`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { imageUrl?: string | null }
    return json.imageUrl ?? null
  } catch {
    return null
  }
}

async function fetchSliderItems(categoryId?: string): Promise<FeedSliderItem[]> {
  const [
    { collection, query, where, orderBy, limit, getDocs },
    { db, Collections },
  ] = await Promise.all([
    import('firebase/firestore'),
    import('@/lib/firebase/firestore'),
  ])

  let docs: FeedSliderItem[] = []

  if (categoryId) {
    try {
      const q = query(
        collection(db, Collections.NEWS),
        where('status', '==', 'published'),
        where('categoryId', '==', categoryId),
        orderBy('publishedAt', 'desc'),
        limit(5)
      )
      const snap = await getDocs(q)
      docs = snap.docs.map(mapDoc)
    } catch {
      const q = query(
        collection(db, Collections.NEWS),
        where('status', '==', 'published'),
        orderBy('publishedAt', 'desc'),
        limit(30)
      )
      const snap = await getDocs(q)
      docs = snap.docs
        .map(mapDoc)
        .filter((item) => item.categoryId === categoryId)
        .slice(0, 5)
    }
  } else {
    const q = query(
      collection(db, Collections.NEWS),
      where('status', '==', 'published'),
      orderBy('publishedAt', 'desc'),
      limit(5)
    )
    const snap = await getDocs(q)
    docs = snap.docs.map(mapDoc)
  }

  return docs.filter((item) => item.categoryId !== 'son-dakika')
}

export function NewsSlider({ categoryId, initialItems, children }: NewsSliderProps) {
  const [interactive, setInteractive] = useState(false)
  const [items, setItems] = useState<FeedSliderItem[]>(initialItems ?? [])
  const [loading, setLoading] = useState(!initialItems?.length)
  const [current, setCurrent] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartX = useRef<number | null>(null)
  const fetchedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setInteractive(true)
  }, [])

  useEffect(() => {
    if (initialItems?.length) return

    let cancelled = false

    async function load() {
      try {
        const docs = await fetchSliderItems(categoryId)
        if (!cancelled) setItems(docs)
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [categoryId, initialItems])

  useEffect(() => {
    if (items.length === 0) return

    const timer = setTimeout(() => {
      const toFetch = [current, (current + 1) % items.length]

      for (const idx of toFetch) {
        const item = items[idx]
        if (!item || item.imageUrl || !item.sourceUrl) continue
        if (fetchedRef.current.has(item.id)) continue
        fetchedRef.current.add(item.id)

        fetchOgImage(item.sourceUrl).then((url) => {
          if (!url) return
          setItems((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, imageUrl: url } : it))
          )
        })
      }
    }, 4000)

    return () => clearTimeout(timer)
  }, [items, current])

  const goTo = useCallback((idx: number) => {
    setCurrent(() => (idx + items.length) % items.length)
  }, [items.length])

  const next = useCallback(() => goTo(current + 1), [current, goTo])
  const prev = useCallback(() => goTo(current - 1), [current, goTo])

  useEffect(() => {
    if (items.length < 2) return
    timerRef.current = setInterval(next, AUTOPLAY_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [items.length, next])

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(next, AUTOPLAY_MS)
  }

  const handlePrev = () => {
    prev()
    resetTimer()
  }
  const handleNext = () => {
    next()
    resetTimer()
  }
  const handleDot = (i: number) => {
    goTo(i)
    resetTimer()
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current
    if (Math.abs(dx) > 40) {
      dx < 0 ? handleNext() : handlePrev()
    }
    touchStartX.current = null
  }

  if (!interactive && children) {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div
        className={`animate-pulse bg-[rgb(var(--color-surface))] ${SLIDER_HEIGHT_CLASS}`}
        style={SLIDER_OUTER_STYLE}
        aria-hidden
      />
    )
  }

  if (items.length === 0) return null

  return (
    <div style={SLIDER_OUTER_STYLE}>
      <div
        className={`relative select-none overflow-hidden ${SLIDER_HEIGHT_CLASS}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {items.map((it, i) => (
          <Link
            key={it.id}
            href={ROUTES.NEWS_DETAIL(it.slug)}
            className={`absolute inset-0 transition-opacity duration-500 ${
              i === current ? 'opacity-100 z-10' : 'opacity-0 z-0'
            }`}
            tabIndex={i === current ? 0 : -1}
            aria-hidden={i !== current}
          >
            {it.imageUrl ? (
              <SliderImage
                src={it.imageUrl}
                alt={it.title}
                priority={i === 0}
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900">
                <div
                  className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)',
                    backgroundSize: '20px 20px',
                  }}
                />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/10" />
            <div className="absolute bottom-0 left-0 right-0 px-5 pb-6 pt-16">
              {it.categoryId && (
                <span className="mb-3 inline-block rounded-sm bg-[rgb(var(--color-brand))] px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-white">
                  {it.categoryId.replace('-', ' ')}
                </span>
              )}
              <h2 className="line-clamp-3 text-[22px] font-black leading-snug text-white drop-shadow-lg">
                {it.title}
              </h2>
            </div>
          </Link>
        ))}

        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
              aria-label="Önceki"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
              aria-label="Sonraki"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-2.5">
          {items.slice(0, Math.min(items.length, 15)).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleDot(i)}
              aria-label={`Slayt ${i + 1}`}
              className={`rounded-full transition-all duration-300 ${
                i === current
                  ? 'h-2 w-5 bg-[rgb(var(--color-brand))]'
                  : 'h-2 w-2 bg-[rgb(var(--color-border))]'
              }`}
            />
          ))}
          {items.length > 15 && (
            <span className="text-[10px] text-[rgb(var(--color-muted))]">+{items.length - 15}</span>
          )}
        </div>
      )}
    </div>
  )
}
