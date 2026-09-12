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
  /**
   * `feed` — horizontal Feed card rail (Öne Çıkanlar).
   * `reader` — vertical Reader end-of-article recommendations (natural scroll flow).
   */
  variant?: 'feed' | 'reader'
}

/**
 * Horizontal "Öne Çıkanlar" module — sandwiched as a full snap panel after N cards.
 * Reader variant renders a vertical recommendation list in article scroll flow.
 * Does NOT emit qualified article impressions for rail cards (only module_viewed / opened).
 */
export function FeedDiscoveryRail({
  category,
  excludeIds,
  onOpen,
  onOpenArticle,
  variant = 'feed',
}: FeedDiscoveryRailProps) {
  const [items, setItems] = useState<DiscoveryRailItem[]>([])
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ok' | 'empty' | 'error'>('idle')
  const viewedRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const excludeRef = useRef(excludeIds)
  excludeRef.current = excludeIds
  const isReader = variant === 'reader'

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')
    ;(async () => {
      try {
        const headers: Record<string, string> = {}
        const token = await getClientAuthToken()
        if (token) headers.Authorization = `Bearer ${token}`
        const qs = category ? `?category=${encodeURIComponent(category)}` : ''
        const res = await fetch(`/api/feed/v2/rails${qs}`, { headers, credentials: 'include' })
        if (!res.ok) {
          if (!cancelled) setLoadState('error')
          return
        }
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
        }
        // Prefer same-category / contextual rows first (API already filters when category set).
        const cat = category?.trim().toLowerCase() || null
        if (cat) {
          filtered.sort((a, b) => {
            const aMatch = (a.category ?? '').toLowerCase() === cat ? 0 : 1
            const bMatch = (b.category ?? '').toLowerCase() === cat ? 0 : 1
            return aMatch - bMatch
          })
        }
        if (!cancelled) {
          const next = filtered.slice(0, isReader ? 6 : 8)
          setItems(next)
          setLoadState(next.length === 0 ? 'empty' : 'ok')
        }
      } catch {
        if (!cancelled) setLoadState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [category, isReader])

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
                  metadata: {
                    count: items.length,
                    category: category ?? null,
                    surface: isReader ? 'reader' : 'feed',
                  },
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
  }, [items, category, isReader])

  // Empty / error: no broken box (Reader + Feed).
  if (loadState === 'empty' || loadState === 'error' || !items.length) return null

  const heading = isReader ? 'Bu konuda daha fazlası' : 'Öne Çıkanlar'
  const aria = isReader ? 'Bu konuda daha fazlası' : 'Öne çıkanlar'

  return (
    <section
      ref={rootRef}
      className={cn('w-full shrink-0', isReader && 'min-w-0')}
      data-testid={isReader ? 'feed-reader-discovery-rail' : 'smart-feed-discovery-rail'}
      data-discovery-variant={variant}
      // Feed rail owns horizontal pan; Reader section must NOT blanket-block RIGHT return.
      {...(isReader ? {} : { 'data-no-reader-gesture': '1' })}
      aria-label={aria}
      onTouchStart={isReader ? undefined : (e) => e.stopPropagation()}
    >
      <h3
        className={cn(
          isReader
            ? 'mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[color:var(--reader-page-muted)]'
            : 'mb-2 px-0.5 text-[11px] font-extrabold tracking-wide text-white/85'
        )}
        data-testid={isReader ? 'feed-reader-recommendations-heading' : undefined}
      >
        {heading}
      </h3>

      {isReader ? (
        <ul
          className="flex flex-col gap-3"
          data-testid="feed-reader-discovery-list"
        >
          {items.map((item) => {
            const skin = resolveFeedCardSkin(item.category)
            const className = cn(
              'flex w-full min-h-[5.5rem] shrink-0 gap-3 overflow-hidden rounded-xl border border-white/10',
              'bg-[color:var(--reader-page-elevated)] text-left active:scale-[0.99] transition'
            )
            const style = { ['--feed-skin-accent' as string]: skin.accent }
            const body = (
              <>
                <div className="relative h-[5.5rem] w-[5.5rem] shrink-0 overflow-hidden bg-neutral-900">
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="88px"
                      unoptimized={
                        item.image.startsWith('http://') || item.image.startsWith('https://')
                      }
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-950" />
                  )}
                </div>
                <div className="min-w-0 flex-1 py-2.5 pr-3">
                  <p className="line-clamp-3 text-[15px] font-semibold leading-snug text-[color:var(--reader-page-text)]">
                    {item.headline}
                  </p>
                  <p className="mt-1 truncate text-[12px] text-[color:var(--reader-page-muted)]">
                    {[item.publisherName, item.category].filter(Boolean).join(' · ') || 'Haber'}
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
                    metadata: { category: item.category, surface: 'reader' },
                  },
                ],
              })
            }

            if (onOpenArticle) {
              return (
                <li key={item.articleId}>
                  <button
                    type="button"
                    className={className}
                    style={style}
                    data-testid="feed-reader-discovery-tile"
                    data-discovery-open="reader"
                    data-no-reader-gesture="1"
                    onClick={() => {
                      trackOpen()
                      onOpenArticle(item)
                    }}
                  >
                    {body}
                  </button>
                </li>
              )
            }

            return (
              <li key={item.articleId}>
                <Link
                  href={`/haber/${item.slug || item.articleId}`}
                  className={className}
                  style={style}
                  data-testid="feed-reader-discovery-tile"
                  data-discovery-open="canonical"
                  data-no-reader-gesture="1"
                  onClick={trackOpen}
                >
                  {body}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
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
      )}
    </section>
  )
}
