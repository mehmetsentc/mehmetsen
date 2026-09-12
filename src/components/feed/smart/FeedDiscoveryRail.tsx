'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getClientAuthToken } from '@/lib/firebase/auth'
import { resolveFeedCardSkin } from '@/lib/feed/feedCardSkins'
import { postTelemetryQuiet } from '@/lib/feed/feedTelemetryQuiet'
import { formatFeedHighlightsHeading } from '@/lib/feed/feedHighlightsHeading'
import { formatReaderCategoryLabel } from '@/lib/feed/reader/presentationCopy'
import { ChevronRight } from 'lucide-react'

export interface DiscoveryRailItem {
  articleId: string
  slug: string
  headline: string
  image: string | null
  category: string | null
  publishedAt: string
  publisherName?: string | null
}

/** Compact Reader-meta time — never throws on bad dates. */
function formatReaderRecMetaTime(publishedAt: string | null | undefined): string | null {
  if (!publishedAt) return null
  const t = Date.parse(publishedAt)
  if (!Number.isFinite(t)) return null
  try {
    return new Date(t).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return null
  }
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
   * When provided, shows "Tümünü Gör" and reuses existing category navigation.
   * Do not invent a dead route — omit when absent.
   */
  onSeeAll?: () => void
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
  onSeeAll,
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

  const heading = isReader ? 'Bu konuda daha fazlası' : formatFeedHighlightsHeading(category)
  const aria = isReader ? 'Bu konuda daha fazlası' : heading

  return (
    <section
      ref={rootRef}
      className={cn('w-full shrink-0', isReader && 'min-w-0')}
      data-testid={isReader ? 'feed-reader-discovery-rail' : 'smart-feed-discovery-rail'}
      data-discovery-variant={variant}
      data-feed-highlights-layout={isReader ? undefined : 'ref-2p2'}
      // Feed rail owns horizontal pan; Reader section must NOT blanket-block RIGHT return.
      {...(isReader ? {} : { 'data-no-reader-gesture': '1' })}
      aria-label={aria}
      onTouchStart={isReader ? undefined : (e) => e.stopPropagation()}
    >
      {isReader ? (
        <h3
          className="mb-5 text-[12px] font-semibold uppercase tracking-[0.1em] text-[color:var(--reader-page-muted)]"
          data-testid="feed-reader-recommendations-heading"
        >
          {heading}
        </h3>
      ) : (
        <div
          className="mb-2 flex items-center justify-between gap-2 px-0.5"
          data-testid="smart-feed-discovery-heading-row"
        >
          <h3
            className="min-w-0 flex-1 truncate text-[12px] font-extrabold tracking-wide text-white/90"
            data-testid="smart-feed-discovery-heading"
          >
            {heading}
          </h3>
          {onSeeAll ? (
            <button
              type="button"
              data-testid="smart-feed-discovery-see-all"
              data-no-reader-gesture="1"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSeeAll()
              }}
              className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-white/55 transition active:scale-[0.98]"
            >
              Tümünü Gör
              <ChevronRight className="h-3.5 w-3.5 opacity-80" aria-hidden />
            </button>
          ) : null}
        </div>
      )}

      {isReader ? (
        <ul
          className="flex flex-col gap-6"
          data-testid="feed-reader-discovery-list"
          data-reader-rec-layout="editorial-stack"
        >
          {items.map((item) => {
            const skin = resolveFeedCardSkin(item.category)
            const className = cn(
              // Full-bleed editorial card — not a cramped Feed-rail strip.
              'flex w-full min-h-[11rem] shrink-0 flex-col overflow-hidden rounded-[12px]',
              'border border-[color:var(--reader-page-edge)] bg-[color:var(--reader-page-elevated)]',
              'text-left active:scale-[0.995] transition'
            )
            const style = { ['--feed-skin-accent' as string]: skin.accent }
            const when = formatReaderRecMetaTime(item.publishedAt)
            const meta = [item.publisherName, item.category, when].filter(Boolean).join(' · ') || 'Haber'
            const body = (
              <>
                <div
                  className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-neutral-900"
                  data-testid="feed-reader-discovery-media"
                >
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 42rem"
                      unoptimized={
                        item.image.startsWith('http://') || item.image.startsWith('https://')
                      }
                    />
                  ) : (
                    <div
                      className="absolute inset-0 bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-950"
                      data-testid="feed-reader-discovery-media-fallback"
                      aria-hidden
                    />
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-2 px-4 pb-4 pt-3.5">
                  <p
                    className="line-clamp-3 text-[1.0625rem] font-semibold leading-[1.35] tracking-[-0.01em] text-[color:var(--reader-page-text)]"
                    data-testid="feed-reader-discovery-headline"
                  >
                    {item.headline}
                  </p>
                  <p
                    className="truncate text-[12.5px] leading-[1.35] text-[color:var(--reader-page-muted)]"
                    data-testid="feed-reader-discovery-meta"
                  >
                    {meta}
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
                <li key={item.articleId} className="w-full min-w-0">
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
              <li key={item.articleId} className="w-full min-w-0">
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
          className="flex gap-2.5 overflow-x-auto pb-0.5 scrollbar-none touch-pan-x snap-x snap-mandatory"
          data-testid="smart-feed-discovery-scroll"
          data-feed-highlights-visible-target="2.2"
        >
          {items.map((item) => {
            const skin = resolveFeedCardSkin(item.category)
            const catLabel = formatReaderCategoryLabel(item.category)
            // ~2.2 cards in the social-safe content width (pr-[3.5rem] on chrome).
            const className = cn(
              'relative flex w-[calc((100%-1.25rem)/2.2)] shrink-0 snap-start flex-col overflow-hidden',
              'rounded-xl border border-white/12 bg-black/55 text-left shadow-[0_8px_24px_rgba(0,0,0,0.35)]',
              'backdrop-blur-[2px] active:scale-[0.98] transition'
            )
            const style = { ['--feed-skin-accent' as string]: skin.accent }
            const body = (
              <>
                <div
                  className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-neutral-900"
                  data-testid="smart-feed-discovery-media"
                >
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="160px"
                      unoptimized={
                        item.image.startsWith('http://') || item.image.startsWith('https://')
                      }
                    />
                  ) : (
                    <div
                      className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-950"
                      data-testid="smart-feed-discovery-media-fallback"
                      aria-hidden
                    />
                  )}
                </div>
                <div className="flex min-h-[3.75rem] flex-col gap-1 px-2 pb-2 pt-1.5">
                  {catLabel ? (
                    <span
                      className="truncate text-[9px] font-extrabold tracking-[0.06em] text-[color:var(--feed-skin-accent,#e11d2e)]"
                      data-testid="smart-feed-discovery-cat"
                    >
                      {catLabel}
                    </span>
                  ) : null}
                  <p
                    className="line-clamp-2 text-[11px] font-bold leading-snug text-white"
                    data-testid="smart-feed-discovery-headline"
                  >
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
                    metadata: { category: item.category, surface: 'feed' },
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
