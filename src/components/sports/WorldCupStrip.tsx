'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Trophy, Loader2 } from 'lucide-react'
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { Collections } from '@/lib/firebase/collections'
import { ROUTES } from '@/constants/routes'

interface StripNews {
  id: string
  title: string
  slug: string
  imageUrl?: string
  publishedAt: number
  sourceName?: string
}

// Dünya Kupası ve benzeri anahtar kelimeler
const WC_KEYWORDS = ['dünya kupası', 'world cup', 'fifa', 'millî takım', 'milli takim', 'türkiye - ', '- türkiye']

function isWorldCup(title: string): boolean {
  const lower = title.toLowerCase()
  return WC_KEYWORDS.some((kw) => lower.includes(kw))
}

const CACHE_KEY = 'nahaber-wcstrip-cache'
const CACHE_TTL_MS = 10 * 60 * 1000

interface StripCache {
  items: StripNews[]
  fetchedAt: number
}

function readCache(): StripCache | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StripCache
    if (!Array.isArray(parsed.items) || typeof parsed.fetchedAt !== 'number') return null
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(items: StripNews[]): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ items, fetchedAt: Date.now() }))
  } catch {
    // ignore
  }
}

export function WorldCupStrip() {
  const [news, setNews] = useState<StripNews[]>(() => readCache()?.items ?? [])
  const [loading, setLoading] = useState(() => !readCache())

  useEffect(() => {
    if (readCache()) return

    let cancelled = false

    async function load() {
      try {
        const snap = await getDocs(
          query(
            collection(db, Collections.NEWS),
            where('category', '==', 'spor'),
            orderBy('publishedAt', 'desc'),
            limit(40),
          )
        )

        const all = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            title: (data.title as string) ?? '',
            slug: (data.slug as string) ?? d.id,
            imageUrl: (data.featuredImage as string | undefined) ?? (data.imageUrl as string | undefined),
            publishedAt: typeof data.publishedAt === 'number' ? data.publishedAt : Date.parse(data.publishedAt as string) || 0,
            sourceName: (data.sourceName as string | undefined),
          } as StripNews
        })

        const filtered = all.filter((n) => isWorldCup(n.title))
        const result = (filtered.length >= 3 ? filtered : all).slice(0, 15)

        if (!cancelled) {
          setNews(result)
          writeCache(result)
        }
      } catch {
        // sessizce geç
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  const hasWC = news.some((n) => isWorldCup(n.title))
  const label = hasWC ? '🏆 Dünya Kupası' : '⚽ Öne Çıkan Spor'

  if (!loading && news.length === 0) return null

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center gap-2 px-1">
        <Trophy className="h-4 w-4 text-emerald-500" />
        <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">{label}</h2>
        <span className="ml-auto text-[10px] font-medium text-[rgb(var(--color-muted))]">
          kaydır →
        </span>
      </div>

      {loading && (
        <div className="flex h-[130px] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
        </div>
      )}

      {!loading && (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
          {news.map((item) => (
            <Link
              key={item.id}
              href={ROUTES.NEWS_DETAIL(item.slug)}
              className="group relative flex min-w-[160px] max-w-[160px] flex-col overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm transition-all active:scale-[0.98]"
            >
              {/* Image */}
              <div className="relative h-[90px] w-full bg-[rgb(var(--color-surface))]">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    unoptimized
                    sizes="160px"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Trophy className="h-8 w-8 text-emerald-500/40" />
                  </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              </div>

              {/* Title */}
              <div className="flex flex-1 flex-col p-2">
                <p className="line-clamp-3 text-[11px] font-semibold leading-tight text-[rgb(var(--color-text))]">
                  {item.title}
                </p>
                {item.sourceName && (
                  <p className="mt-auto pt-1 text-[10px] text-[rgb(var(--color-muted))]">
                    {item.sourceName}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
