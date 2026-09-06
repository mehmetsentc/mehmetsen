'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getClientAuthToken } from '@/lib/firebase/auth'
import { resolveFeedCardSkin } from '@/lib/feed/feedCardSkins'
import { postTelemetryQuiet } from '@/lib/feed/feedTelemetryQuiet'

export interface DiscoveryRailItem {
  articleId: string
  slug: string
  headline: string
  image: string | null
  category: string | null
  publishedAt: string
  publisherName?: string | null
}

interface FeedDiscoveryRailProps {
  category?: string | null
  excludeIds?: Set<string>
  /** Legacy hook after open (telemetry). */
  onOpen?: (articleId: string) => void
  /**
   * When provided (Reader-enabled session), tiles open via Feed Reader authority
   * instead of navigating to canonical /haber.
   */
  onOpenArticle?: (item: DiscoveryRailItem) => void
}

/**
 * Horizontal "Öne Çıkanlar" module — sandwiched as a full snap panel after N cards.
 * Does NOT emit qualified article impressions for rail cards (only module_viewed / opened).
 */
export function FeedDiscoveryRail({
  category,
  excludeIds,
  onOpen,
  onOpenArticle,
}: FeedDiscoveryRailProps) {
  const [items, setItems] = useState<DiscoveryRailItem[]>([])
  const viewedRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const excludeRef = useRef(excludeIds)
  excludeRef.current = excludeIds

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const headers: Record<string, string> = {}
        const token = await getClientAuthToken()
        if (token) headers.Authorization = `Bearer ${token}`
        const qs = category ? `?category=${encodeURIComponent(category)}` : ''
        const res = await fetch(`/api/feed/v2/rails${qs}`, { headers, credentials: 'include' })
        if (!res.ok) return
        const data = (await res.json()) as {
          featured?: DiscoveryRailItem[]
          popular?: DiscoveryRailItem[]
        }
        const merged = [...(data.featured ?? []), ...(data.popular ?? [])]
        const seen = new Set<string>()
        const filtered: DiscoveryRailItem[] = []
        const exclude = excludeRef.current
        for (const row of merged) {
          if (!row?.articleId || seen.has(row.articleId)) continue
          if (exclude?.has(row.articleId)) continue
          seen.add(row.articleId)
          filtered.push(row)
          if (filtered.length >= 8) break
        }
        if (!cancelled) setItems(filtered)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [category])

  useEffect(() => {
    const el = rootRef.current
    if (!el || viewedRef.current || !items.length) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5 && !viewedRef.current) {
            viewedRef.current = true
            void postTelemetryQuiet({
              events: [
                {
                  eventType: 'discovery_module_viewed',
                  metadata: { count: items.length, category: category ?? null },
                },
              ],
            })
          }
        }
      },
      { threshold: [0.5] }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [items, category])

  if (!items.length) return null

  return (
    <section
      ref={rootRef}
      className="w-full shrink-0"
      data-testid="smart-feed-discovery-rail"
      aria-label="Öne çıkanlar"
      onTouchStart={(e) => e.stopPropagation()}
    >
      <h3 className="mb-2 px-0.5 text-[11px] font-extrabold tracking-wide text-white/85">
        Öne Çıkanlar
      </h3>
      <div
        className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none touch-pan-x"
        data-testid="smart-feed-discovery-scroll"
      >
        {items.map((item) => {
          const skin = resolveFeedCardSkin(item.category)
          const className = cn(
            'relative h-36 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-neutral-900',
            'active:scale-[0.98] transition text-left'
          )
          const style = { ['--feed-skin-accent' as string]: skin.accent }
          const body = (
            <>
              {item.image ? (
                <Image
                  src={item.image}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="112px"
                  // Match FullscreenNewsCard: remote publisher CDNs often block
                  // /_next/image proxy — unoptimized avoids broken thumbnails.
                  unoptimized={
                    item.image.startsWith('http://') || item.image.startsWith('https://')
                  }
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-950" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 space-y-0.5 p-1.5">
                <p className="line-clamp-3 text-[10px] font-bold leading-snug text-white">
                  {item.headline}
                </p>
              </div>
            </>
          )

          const trackOpen = () => {
            onOpen?.(item.articleId)
            void postTelemetryQuiet({
              events: [
                {
                  eventType: 'discovery_card_opened',
                  articleId: item.articleId,
                  metadata: { category: item.category },
                },
              ],
            })
          }

          if (onOpenArticle) {
            return (
              <button
                key={item.articleId}
                type="button"
                className={className}
                style={style}
                data-testid="smart-feed-discovery-tile"
                data-discovery-open="reader"
                onClick={() => {
                  trackOpen()
                  onOpenArticle(item)
                }}
              >
                {body}
              </button>
            )
          }

          return (
            <Link
              key={item.articleId}
              href={`/haber/${item.slug || item.articleId}`}
              className={className}
              style={style}
              data-testid="smart-feed-discovery-tile"
              data-discovery-open="canonical"
              onClick={trackOpen}
            >
              {body}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
