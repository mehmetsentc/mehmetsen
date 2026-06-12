'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'

interface SliderItem {
  id: string
  title: string
  slug: string
  imageUrl: string | null
  categoryId: string
  publishedAt: number
}

interface NewsSliderProps {
  categoryId?: string
}

const AUTOPLAY_MS = 5000

export function NewsSlider({ categoryId }: NewsSliderProps) {
  const [items, setItems] = useState<SliderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        let docs: SliderItem[] = []

        // Primary: status + categoryId + publishedAt (composite index required)
        if (categoryId) {
          try {
            const q = query(
              collection(db, Collections.NEWS),
              where('status', '==', 'published'),
              where('categoryId', '==', categoryId),
              orderBy('publishedAt', 'desc'),
              limit(20)
            )
            const snap = await getDocs(q)
            docs = snap.docs.map((d) => {
              const data = d.data() as Record<string, unknown>
              return {
                id: d.id,
                title: String(data.title ?? ''),
                slug: String(data.slug ?? d.id),
                imageUrl: (data.coverImageUrl as string | null) ?? null,
                categoryId: String(data.categoryId ?? ''),
                publishedAt: Number(data.publishedAt ?? 0),
              }
            })
          } catch {
            // Fallback: query by status only, filter by category in memory
            const q = query(
              collection(db, Collections.NEWS),
              where('status', '==', 'published'),
              orderBy('publishedAt', 'desc'),
              limit(60)
            )
            const snap = await getDocs(q)
            docs = snap.docs
              .map((d) => {
                const data = d.data() as Record<string, unknown>
                return {
                  id: d.id,
                  title: String(data.title ?? ''),
                  slug: String(data.slug ?? d.id),
                  imageUrl: (data.coverImageUrl as string | null) ?? null,
                  categoryId: String(data.categoryId ?? ''),
                  publishedAt: Number(data.publishedAt ?? 0),
                }
              })
              .filter((item) => item.categoryId === categoryId)
              .slice(0, 20)
          }
        } else {
          // No category: top 20 latest published
          const q = query(
            collection(db, Collections.NEWS),
            where('status', '==', 'published'),
            orderBy('publishedAt', 'desc'),
            limit(20)
          )
          const snap = await getDocs(q)
          docs = snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>
            return {
              id: d.id,
              title: String(data.title ?? ''),
              slug: String(data.slug ?? d.id),
              imageUrl: (data.coverImageUrl as string | null) ?? null,
              categoryId: String(data.categoryId ?? ''),
              publishedAt: Number(data.publishedAt ?? 0),
            }
          })
        }

        // son-dakika sayfası yok — o categorydeki haberleri slider'dan çıkar
        const filtered = docs.filter((item) => item.categoryId !== 'son-dakika')
        if (!cancelled) setItems(filtered)
      } catch {
        // silently fail — slider just won't render
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [categoryId])

  const goTo = useCallback((idx: number) => {
    setCurrent((c) => {
      const next = (idx + items.length) % items.length
      return next
    })
  }, [items.length])

  const next = useCallback(() => goTo(current + 1), [current, goTo])
  const prev = useCallback(() => goTo(current - 1), [current, goTo])

  // Autoplay
  useEffect(() => {
    if (items.length < 2) return
    timerRef.current = setInterval(next, AUTOPLAY_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [items.length, next])

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(next, AUTOPLAY_MS)
  }

  const handlePrev = () => { prev(); resetTimer() }
  const handleNext = () => { next(); resetTimer() }
  const handleDot = (i: number) => { goTo(i); resetTimer() }

  // Touch support
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current
    if (Math.abs(dx) > 40) { dx < 0 ? handleNext() : handlePrev() }
    touchStartX.current = null
  }

  if (loading) {
    return (
      <div
        className="animate-pulse bg-[rgb(var(--color-surface))]"
        style={{
          margin: '0 calc(-1 * var(--layout-gutter))',
          width: 'calc(100% + 2 * var(--layout-gutter))',
          height: '18rem',
        }}
      />
    )
  }

  if (items.length === 0) return null

  const item = items[current]!

  return (
    <div
      className="mb-0"
      style={{
        margin: '0 calc(-1 * var(--layout-gutter))',
        width: 'calc(100% + 2 * var(--layout-gutter))',
      }}
    >
      <div
        className="relative select-none overflow-hidden"
        style={{ height: '18rem' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Slides */}
        {items.map((it, i) => (
          <Link
            key={it.id}
            href={`/news/${it.slug}`}
            className={`absolute inset-0 transition-opacity duration-500 ${i === current ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
            tabIndex={i === current ? 0 : -1}
            aria-hidden={i !== current}
          >
            {it.imageUrl ? (
              <Image
                src={it.imageUrl}
                alt={it.title}
                fill
                className="object-cover"
                sizes="100vw"
                priority={i === 0}
                unoptimized
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-[rgb(var(--color-brand))] to-red-900" />
            )}
            {/* Strong gradient overlay for readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
            {/* Title area */}
            <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-10">
              {it.categoryId && (
                <span className="mb-2 inline-block rounded-sm bg-[rgb(var(--color-brand))] px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">
                  {it.categoryId}
                </span>
              )}
              <h2 className="line-clamp-3 text-[17px] font-black leading-tight text-white drop-shadow-sm">
                {it.title}
              </h2>
            </div>
          </Link>
        ))}

        {/* Arrows */}
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white backdrop-blur-sm"
              aria-label="Önceki"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white backdrop-blur-sm"
              aria-label="Sonraki"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Dot indicators */}
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
