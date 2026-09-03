'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Zap, Layers, Newspaper } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants/routes'
import { FollowButton } from '@/components/social/FollowButton'
import { SocialActionRail } from '@/components/social/SocialActionRail'
import { FeedCardMenu } from '@/components/feed/smart/FeedCardMenu'
import { isSmartFeedVideoEnabledClient } from '@/lib/feed/featureFlagClient'
import type { FeedItemDto } from '@/types/smartFeed'

function formatRelativeTime(dateStr?: string | null): string | null {
  if (!dateStr) return null
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Az önce'
    if (diffMins < 60) return `${diffMins}dk önce`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}s önce`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}g önce`
  } catch {
    return null
  }
}

function categoryLabel(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const map: Record<string, string> = {
    gundem: 'GÜNDEM',
    'son-dakika': 'SON DAKİKA',
    ekonomi: 'EKONOMİ',
    spor: 'SPOR',
    dunya: 'DÜNYA',
    teknoloji: 'TEKNOLOJİ',
    kultur: 'KÜLTÜR',
    saglik: 'SAĞLIK',
    yerel: 'YEREL',
    gastronomi: 'GASTRONOMİ',
    magazin: 'MAGAZİN',
    siyaset: 'SİYASET',
  }
  const key = raw.trim().toLowerCase()
  return map[key] ?? raw.replace(/-/g, ' ').toUpperCase()
}

interface FullscreenNewsCardProps {
  item: FeedItemDto
  isActive: boolean
  debug?: boolean
  liked: boolean
  saved: boolean
  likeCount?: number
  commentCount?: number
  saveCount?: number
  likeLoading?: boolean
  saveLoading?: boolean
  onToggleLike: () => void
  onToggleSave: () => void
  onCommentClick: () => void
  onReadClick: () => void
  onFeedback?: (type: 'hide_article' | 'less_publisher' | 'less_topic') => void
  cardRef?: (node: HTMLElement | null) => void
}

/**
 * Reserved space under absolute mode nav (safe-area + chips + gap).
 * Mode nav lives in SmartFeedClient; publisher row must sit below it.
 */
const MODE_NAV_CLEARANCE =
  'pt-[max(6.75rem,calc(var(--mobile-sat,env(safe-area-inset-top,0px))+5.5rem))]'

export function FullscreenNewsCard({
  item,
  isActive,
  debug,
  liked,
  saved,
  likeCount,
  commentCount,
  saveCount,
  likeLoading,
  saveLoading,
  onToggleLike,
  onToggleSave,
  onCommentClick,
  onReadClick,
  onFeedback,
  cardRef,
}: FullscreenNewsCardProps) {
  const [imageError, setImageError] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const [imageAspect, setImageAspect] = useState<'portrait' | 'landscape' | 'square' | null>(null)

  const videoEnabled = isSmartFeedVideoEnabledClient()
  const showVideo = Boolean(videoEnabled && item.video && isActive)
  const hasValidImage = Boolean(item.image && !imageError)
  const cat = categoryLabel(item.category)
  const timeLabel = formatRelativeTime(item.publishedAt)
  const resolvedLikeCount = typeof likeCount === 'number' ? likeCount : item.socialCounts.likes ?? 0
  const resolvedCommentCount =
    typeof commentCount === 'number' ? commentCount : item.socialCounts.comments ?? 0
  const resolvedSaveCount = typeof saveCount === 'number' ? saveCount : item.socialCounts.saves ?? 0

  return (
    <article
      ref={cardRef}
      className="relative flex h-[100dvh] w-full snap-start snap-always flex-col overflow-hidden bg-black"
      aria-label={item.headline}
      data-article-id={item.articleId}
      data-active={isActive ? 'true' : 'false'}
      data-media-aspect={showVideo ? 'video' : imageAspect ?? 'unknown'}
      data-testid="smart-feed-card"
    >
      {/* Continuous full-bleed media canvas — no solid dead mid-band */}
      <div className="absolute inset-0 bg-black" data-testid="smart-feed-media">
        {showVideo ? (
          <video
            key={item.video!}
            src={item.video!}
            className="h-full w-full object-cover"
            autoPlay
            playsInline
            muted
            loop
            aria-hidden
          />
        ) : hasValidImage ? (
          <>
            {/* Layer A: blurred cover fills entire card (same image, continuous) */}
            <Image
              src={item.image!}
              alt=""
              fill
              className="scale-125 object-cover opacity-70 blur-2xl brightness-[0.55]"
              sizes="100vw"
              aria-hidden
              unoptimized={
                typeof item.image === 'string' &&
                (item.image.startsWith('http://') || item.image.startsWith('https://'))
              }
            />
            {/* Layer B: sharp image — landscape stays natural; portrait/square cover */}
            <div
              className={cn(
                'absolute inset-x-0 top-0',
                imageAspect === 'landscape' ? 'h-[58%]' : 'bottom-0'
              )}
            >
              <Image
                src={item.image!}
                alt={item.headline || ''}
                fill
                className={cn(
                  'transition-opacity duration-300',
                  imageAspect === 'landscape'
                    ? 'object-contain object-top'
                    : imageAspect === 'square'
                      ? 'object-cover object-center'
                      : 'object-cover object-center'
                )}
                sizes="100vw"
                priority={isActive}
                onError={() => setImageError(true)}
                onLoad={(e) => {
                  const img = e.currentTarget
                  const w = img.naturalWidth
                  const h = img.naturalHeight
                  if (!w || !h) return
                  const ratio = w / h
                  if (ratio > 1.15) setImageAspect('landscape')
                  else if (ratio < 0.85) setImageAspect('portrait')
                  else setImageAspect('square')
                }}
                unoptimized={
                  typeof item.image === 'string' &&
                  (item.image.startsWith('http://') || item.image.startsWith('https://'))
                }
              />
            </div>
          </>
        ) : (
          <div className="relative flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-neutral-900 via-black to-neutral-950 select-none">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px]" />
            <div className="flex flex-col items-center gap-2 opacity-25">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm">
                <Newspaper className="h-8 w-8 text-white" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-white">
                {item.publisher?.name || 'NaHaber'}
              </span>
            </div>
          </div>
        )}

        {/* Gradients over media — no flat mid-band */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[30%] bg-gradient-to-b from-black/60 via-black/20 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[52%] bg-gradient-to-t from-black via-black/80 to-transparent"
          aria-hidden
        />
      </div>

      <div
        className={cn(
          'relative z-10 flex flex-1 flex-col px-3 sm:px-4',
          'pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]',
          MODE_NAV_CLEARANCE,
          'md:mx-auto md:w-full md:max-w-lg'
        )}
      >
        {/* Publisher row — own band below mode nav; never absolute-over-tabs */}
        <div
          className="flex shrink-0 items-center justify-between gap-2"
          data-testid="smart-feed-publisher-row"
        >
          {item.publisher ? (
            <>
              {item.publisher.slug && !item.publisher.slug.startsWith('src_') ? (
                <Link
                  href={ROUTES.PUBLISHER(item.publisher.slug)}
                  className="flex min-w-0 items-center gap-2 rounded-full bg-black/45 py-1.5 pl-1.5 pr-3 backdrop-blur-md transition hover:bg-black/60"
                >
                  {item.publisher.logoUrl && !logoError ? (
                    <Image
                      src={item.publisher.logoUrl}
                      alt={item.publisher.name}
                      width={28}
                      height={28}
                      className="h-7 w-7 shrink-0 rounded-full object-cover"
                      onError={() => setLogoError(true)}
                      unoptimized={
                        item.publisher.logoUrl.startsWith('http://') ||
                        item.publisher.logoUrl.startsWith('https://')
                      }
                    />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold uppercase text-white">
                      {item.publisher.name ? item.publisher.name.slice(0, 1) : 'N'}
                    </span>
                  )}
                  <span className="min-w-0 truncate text-sm font-semibold text-white">
                    {item.publisher.name}
                  </span>
                  {timeLabel ? (
                    <>
                      <span className="select-none text-white/35">·</span>
                      <span className="shrink-0 text-xs text-white/70">{timeLabel}</span>
                    </>
                  ) : null}
                </Link>
              ) : (
                <div className="flex min-w-0 items-center gap-2 rounded-full bg-black/45 py-1.5 pl-1.5 pr-3 backdrop-blur-md">
                  {item.publisher.logoUrl && !logoError ? (
                    <Image
                      src={item.publisher.logoUrl}
                      alt={item.publisher.name}
                      width={28}
                      height={28}
                      className="h-7 w-7 shrink-0 rounded-full object-cover"
                      onError={() => setLogoError(true)}
                      unoptimized={
                        item.publisher.logoUrl.startsWith('http://') ||
                        item.publisher.logoUrl.startsWith('https://')
                      }
                    />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold uppercase text-white">
                      {item.publisher.name ? item.publisher.name.slice(0, 1) : 'N'}
                    </span>
                  )}
                  <span className="min-w-0 truncate text-sm font-semibold text-white">
                    {item.publisher.name}
                  </span>
                  {timeLabel ? (
                    <>
                      <span className="select-none text-white/35">·</span>
                      <span className="shrink-0 text-xs text-white/70">{timeLabel}</span>
                    </>
                  ) : null}
                </div>
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                <FollowButton
                  publisherId={item.publisher.id}
                  publisherSlug={item.publisher.slug}
                  className="shrink-0"
                  showCount={false}
                  variant="overlay"
                  returnUrl="/feed-v2"
                />
                <FeedCardMenu item={item} onFeedback={onFeedback} />
              </div>
            </>
          ) : (
            <div className="ml-auto">
              <FeedCardMenu item={item} onFeedback={onFeedback} />
            </div>
          )}
        </div>

        {/* Flexible media breathing room — no solid fill; media canvas shows through */}
        <div className="min-h-[12vh] flex-1" aria-hidden data-testid="smart-feed-media-breathing" />

        {/* Lower text + reserved right rail */}
        <div className="relative flex max-h-[42vh] items-end gap-3">
          <div className="min-w-0 flex-1 space-y-2 pr-1" data-testid="smart-feed-text-zone">
            <div className="flex flex-wrap items-center gap-2">
              {cat ? (
                <span className="text-[11px] font-bold tracking-wide text-[rgb(var(--color-brand))]">
                  {cat}
                </span>
              ) : null}
              {item.breaking ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
                  <Zap className="h-3 w-3" aria-hidden />
                  Son Dakika
                </span>
              ) : null}
              {item.materialUpdate ? (
                <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-black">
                  YENİ GELİŞME
                </span>
              ) : null}
              {item.clusterSourceCount >= 2 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                  <Layers className="h-3 w-3" aria-hidden />
                  {item.clusterSourceCount} kaynak
                </span>
              ) : null}
            </div>

            <h2
              className="line-clamp-2 text-[1.2rem] font-bold leading-snug text-white sm:text-[1.35rem] md:text-3xl"
              data-testid="smart-feed-headline"
            >
              {item.headline}
            </h2>

            {item.summary ? (
              <p
                className="line-clamp-3 break-words text-[0.9rem] leading-relaxed text-white/75 md:line-clamp-4 md:text-[0.95rem]"
                data-testid="smart-feed-summary"
              >
                {item.summary}
              </p>
            ) : null}

            <button
              type="button"
              onClick={onReadClick}
              data-testid="smart-feed-read-cta"
              className="mt-1 inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition hover:bg-white/95 active:scale-[0.99]"
            >
              Haberi Oku
            </button>

            {debug ? (
              <pre className="max-h-24 overflow-auto rounded bg-black/60 p-2 text-[10px] text-green-300">
                {JSON.stringify(
                  {
                    reason: item.reason,
                    scoreBreakdown: item.scoreBreakdown,
                    clusterId: item.clusterId,
                    articleId: item.articleId,
                  },
                  null,
                  0
                )}
              </pre>
            ) : null}
          </div>

          <SocialActionRail
            articleId={item.articleId}
            slug={item.slug}
            title={item.headline}
            summary={item.summary ?? undefined}
            liked={liked}
            saved={saved}
            likeCount={resolvedLikeCount}
            commentCount={resolvedCommentCount}
            saveCount={resolvedSaveCount}
            onToggleLike={onToggleLike}
            onToggleSave={onToggleSave}
            onCommentClick={onCommentClick}
            likeLoading={likeLoading}
            saveLoading={saveLoading}
            orientation="vertical"
            className="relative z-20 mb-1 shrink-0 text-white"
            data-testid="smart-feed-social-rail"
          />
        </div>
      </div>
    </article>
  )
}
