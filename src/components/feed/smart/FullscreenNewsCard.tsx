'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Check, ChevronDown, Layers, Newspaper, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants/routes'
import { FollowButton } from '@/components/social/FollowButton'
import { SocialActionRail } from '@/components/social/SocialActionRail'
import { isSmartFeedVideoEnabledClient } from '@/lib/feed/featureFlagClient'
import { isPublisherProfileSlug } from '@/lib/publisher/profileSlug'
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
  /** 1-based card index for Reels-style progress */
  cardIndex?: number
  /** Total loaded cards (progress denominator) */
  cardTotal?: number
  onToggleLike: () => void
  onToggleSave: () => void
  onCommentClick: () => void
  onReadClick: () => void
  onFeedback?: (type: 'hide_article' | 'less_publisher' | 'less_topic') => void
  cardRef?: (node: HTMLElement | null) => void
}

/**
 * Top clearance for absolute mode nav only.
 * Publisher lives in the bottom text stack (reference Reels composition).
 */
const MODE_NAV_CLEARANCE =
  'pt-[max(5.5rem,calc(var(--mobile-sat,env(safe-area-inset-top,0px))+4.25rem))]'

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
  cardIndex,
  cardTotal,
  onToggleLike,
  onToggleSave,
  onCommentClick,
  onReadClick,
  cardRef,
}: FullscreenNewsCardProps) {
  const [imageError, setImageError] = useState(false)
  const [logoError, setLogoError] = useState(false)

  const videoEnabled = isSmartFeedVideoEnabledClient()
  const showVideo = Boolean(videoEnabled && item.video && isActive)
  const hasValidImage = Boolean(item.image && !imageError)
  const cat = categoryLabel(item.category)
  const timeLabel = formatRelativeTime(item.publishedAt)
  const resolvedLikeCount = typeof likeCount === 'number' ? likeCount : item.socialCounts.likes ?? 0
  const resolvedCommentCount =
    typeof commentCount === 'number' ? commentCount : item.socialCounts.comments ?? 0
  const resolvedSaveCount = typeof saveCount === 'number' ? saveCount : item.socialCounts.saves ?? 0
  const progressLabel =
    typeof cardIndex === 'number' && typeof cardTotal === 'number' && cardTotal > 0
      ? `${cardIndex} / ${cardTotal}`
      : null

  return (
    <article
      ref={cardRef}
      className="relative flex h-[100dvh] w-full snap-start snap-always flex-col overflow-hidden bg-black"
      aria-label={item.headline}
      data-article-id={item.articleId}
      data-active={isActive ? 'true' : 'false'}
      data-testid="smart-feed-card"
    >
      {/* Full-bleed media canvas — continuous Reels composition */}
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
            <Image
              src={item.image!}
              alt=""
              fill
              className="scale-110 object-cover opacity-60 blur-2xl brightness-[0.5]"
              sizes="100vw"
              aria-hidden
              unoptimized={
                typeof item.image === 'string' &&
                (item.image.startsWith('http://') || item.image.startsWith('https://'))
              }
            />
            <Image
              src={item.image!}
              alt={item.headline || ''}
              fill
              className="object-cover object-center"
              sizes="100vw"
              priority={isActive}
              onError={() => setImageError(true)}
              unoptimized={
                typeof item.image === 'string' &&
                (item.image.startsWith('http://') || item.image.startsWith('https://'))
              }
            />
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

        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[22%] bg-gradient-to-b from-black/50 via-black/15 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black via-black/75 to-transparent"
          aria-hidden
        />
      </div>

      <div
        className={cn(
          'relative z-10 flex flex-1 flex-col px-3 sm:px-4',
          'pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))]',
          MODE_NAV_CLEARANCE,
          'md:mx-auto md:w-full md:max-w-lg'
        )}
      >
        {/* Open media mid-band — no publisher chrome here */}
        <div className="min-h-[18vh] flex-1" aria-hidden data-testid="smart-feed-media-breathing" />

        {/* Bottom stack: copy + publisher + CTA | social rail + progress */}
        <div className="relative flex items-end gap-3">
          <div className="min-w-0 flex-1 space-y-2.5 pr-1" data-testid="smart-feed-text-zone">
            <div className="flex flex-wrap items-center gap-2">
              {cat ? (
                <span className="text-[11px] font-extrabold tracking-[0.06em] text-[rgb(var(--color-brand))]">
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

            <div
              className="max-h-[46vh] space-y-2 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
              data-testid="smart-feed-copy-scroll"
              onTouchStart={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <h2
                className="break-words text-[1.22rem] font-extrabold leading-[1.25] tracking-[-0.02em] text-white sm:text-[1.35rem]"
                data-testid="smart-feed-headline"
              >
                {item.headline}
              </h2>

              {item.summary ? (
                <p
                  className="break-words text-[0.88rem] leading-snug text-white/78"
                  data-testid="smart-feed-summary"
                >
                  {item.summary}
                </p>
              ) : null}
            </div>

            {/* Publisher row — bottom of copy stack (reference composition) */}
            {item.publisher ? (
              <div
                className="flex min-w-0 flex-wrap items-center gap-2"
                data-testid="smart-feed-publisher-row"
              >
                {isPublisherProfileSlug(item.publisher.slug) ? (
                  <Link
                    href={ROUTES.PUBLISHER(item.publisher.slug)}
                    className="flex min-w-0 max-w-full items-center gap-2"
                  >
                    {item.publisher.logoUrl && !logoError ? (
                      <Image
                        src={item.publisher.logoUrl}
                        alt={item.publisher.name}
                        width={28}
                        height={28}
                        className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/20"
                        onError={() => setLogoError(true)}
                        unoptimized={
                          item.publisher.logoUrl.startsWith('http://') ||
                          item.publisher.logoUrl.startsWith('https://')
                        }
                      />
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] text-xs font-bold uppercase text-white">
                        {item.publisher.name ? item.publisher.name.slice(0, 1) : 'N'}
                      </span>
                    )}
                    <span className="min-w-0 truncate text-sm font-semibold text-white">
                      {item.publisher.name}
                    </span>
                    <span
                      className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-white text-black"
                      title="Doğrulanmış"
                      aria-label="Doğrulanmış yayıncı"
                    >
                      <Check className="h-2.5 w-2.5 stroke-[3]" aria-hidden />
                    </span>
                    {timeLabel ? (
                      <span className="shrink-0 text-xs text-white/65">· {timeLabel}</span>
                    ) : null}
                  </Link>
                ) : (
                  <div className="flex min-w-0 items-center gap-2">
                    {item.publisher.logoUrl && !logoError ? (
                      <Image
                        src={item.publisher.logoUrl}
                        alt={item.publisher.name}
                        width={28}
                        height={28}
                        className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/20"
                        onError={() => setLogoError(true)}
                        unoptimized={
                          item.publisher.logoUrl.startsWith('http://') ||
                          item.publisher.logoUrl.startsWith('https://')
                        }
                      />
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] text-xs font-bold uppercase text-white">
                        {item.publisher.name ? item.publisher.name.slice(0, 1) : 'N'}
                      </span>
                    )}
                    <span className="min-w-0 truncate text-sm font-semibold text-white">
                      {item.publisher.name}
                    </span>
                    {timeLabel ? (
                      <span className="shrink-0 text-xs text-white/65">· {timeLabel}</span>
                    ) : null}
                  </div>
                )}
                {item.publisher.id && item.publisher.id !== 'source' ? (
                  <FollowButton
                    publisherId={item.publisher.id}
                    publisherSlug={
                      isPublisherProfileSlug(item.publisher.slug) ? item.publisher.slug : undefined
                    }
                    className="shrink-0"
                    showCount={false}
                    variant="overlay"
                    returnUrl="/feed-v2"
                  />
                ) : null}
              </div>
            ) : null}

            <button
              type="button"
              onClick={onReadClick}
              data-testid="smart-feed-read-cta"
              className="mt-0.5 inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-black transition hover:bg-white/95 active:scale-[0.99]"
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

          <div className="relative z-20 mb-0.5 flex shrink-0 flex-col items-center gap-3">
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
              className="text-white"
              data-testid="smart-feed-social-rail"
            />
            {progressLabel ? (
              <div
                className="flex items-center gap-0.5 text-xs font-semibold text-white/90 drop-shadow"
                data-testid="smart-feed-card-progress"
                aria-label={`Kart ${progressLabel}`}
              >
                <span>{progressLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}
