'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Check, ChevronDown, Heart, Newspaper, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants/routes'
import { FollowButton } from '@/components/social/FollowButton'
import { SocialActionRail, type FeedReactionId } from '@/components/social/SocialActionRail'
import { FeedDiscoveryRail } from '@/components/feed/smart/FeedDiscoveryRail'
import { isSmartFeedVideoEnabledClient } from '@/lib/feed/featureFlagClient'
import { isPublisherProfileSlug } from '@/lib/publisher/profileSlug'
import { isFollowablePublisherId } from '@/lib/feed/feedIdentity'
import { resolveFeedCardSkin } from '@/lib/feed/feedCardSkins'
import { publisherAccentFromId } from '@/lib/feed/publisherAccent'
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

/** Prefer real profile slug; fall back to id when it is a routable slug. */
function publisherProfileHref(publisher: {
  slug?: string | null
  id?: string | null
}): string | null {
  if (isPublisherProfileSlug(publisher.slug)) {
    return ROUTES.PUBLISHER(publisher.slug!.trim().toLowerCase())
  }
  if (isPublisherProfileSlug(publisher.id)) {
    return ROUTES.PUBLISHER(publisher.id!.trim().toLowerCase())
  }
  return null
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
  onReact?: (reaction: FeedReactionId) => void
  onToggleSave: () => void
  onCommentClick: () => void
  onReadClick: () => void
  onFeedback?: (type: 'hide_article' | 'less_publisher' | 'less_topic') => void
  cardRef?: (node: HTMLElement | null) => void
  reaction?: string | null
  showDiscoveryRail?: boolean
  discoveryCategory?: string | null
  discoveryExcludeIds?: string[]
}

/**
 * Top clearance for absolute mode nav only.
 * Publisher lives in the bottom text stack (reference Reels composition).
 */
const MODE_NAV_CLEARANCE =
  'pt-[max(5.5rem,calc(var(--mobile-sat,env(safe-area-inset-top,0px))+4.25rem))]'

const DOUBLE_TAP_MS = 280
const TAP_MOVE_PX = 14

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
  onReact,
  onToggleSave,
  onCommentClick,
  onReadClick,
  cardRef,
  reaction,
  showDiscoveryRail,
  discoveryCategory,
  discoveryExcludeIds,
}: FullscreenNewsCardProps) {
  const [imageError, setImageError] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const [heartBurst, setHeartBurst] = useState<{ id: number; x: number; y: number } | null>(null)
  const [typedHeadline, setTypedHeadline] = useState(item.headline)
  const [headlineDone, setHeadlineDone] = useState(true)
  const [showCursor, setShowCursor] = useState(false)
  const [motionOk, setMotionOk] = useState(true)

  const lastTapRef = useRef(0)
  const tapOriginRef = useRef<{ x: number; y: number } | null>(null)
  const movedRef = useRef(false)
  const likedRef = useRef(liked)
  likedRef.current = liked
  const typeTimerRef = useRef<number | null>(null)

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
  const publisherHref = item.publisher ? publisherProfileHref(item.publisher) : null
  const publisherAccent = publisherAccentFromId(item.publisher?.id ?? item.publisher?.slug)
  const skin = resolveFeedCardSkin(item.category, { breaking: item.breaking })
  void skin.layout
  const isCenter = false
  const playMediaDolly = isActive && motionOk

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setMotionOk(!mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  // Typewriter: only when card becomes active (skip if reduced motion)
  useEffect(() => {
    const clearType = () => {
      if (typeTimerRef.current != null) {
        window.clearTimeout(typeTimerRef.current)
        typeTimerRef.current = null
      }
    }

    clearType()

    if (!isActive) {
      setTypedHeadline(item.headline)
      setHeadlineDone(true)
      setShowCursor(false)
      return
    }

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced || !item.headline) {
      setTypedHeadline(item.headline)
      setHeadlineDone(true)
      setShowCursor(false)
      return
    }

    const full = item.headline
    // Cap total typewriter ~1.6s regardless of length
    const step = Math.max(12, Math.min(skin.typeMs, Math.floor(1600 / Math.max(full.length, 1))))
    setTypedHeadline('')
    setHeadlineDone(false)
    setShowCursor(true)

    let i = 0
    const tick = () => {
      i += 1
      setTypedHeadline(full.slice(0, i))
      if (i >= full.length) {
        setHeadlineDone(true)
        setShowCursor(false)
        typeTimerRef.current = null
        return
      }
      typeTimerRef.current = window.setTimeout(tick, step)
    }
    // slight delay so media expand / chrome settle
    typeTimerRef.current = window.setTimeout(tick, 140)

    return clearType
  }, [isActive, item.headline, item.articleId, skin.typeMs])

  const triggerDoubleTapLike = useCallback(
    (clientX: number, clientY: number, target: HTMLElement) => {
      const rect = target.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const id = Date.now()
      setHeartBurst({ id, x, y })
      window.setTimeout(() => {
        setHeartBurst((prev) => (prev?.id === id ? null : prev))
      }, 900)
      // Instagram-style: double-tap likes; does not unlike
      if (!likedRef.current) onToggleLike()
    },
    [onToggleLike]
  )

  const onTapZonePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    movedRef.current = false
    tapOriginRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onTapZonePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const origin = tapOriginRef.current
    if (!origin) return
    if (
      Math.abs(e.clientX - origin.x) > TAP_MOVE_PX ||
      Math.abs(e.clientY - origin.y) > TAP_MOVE_PX
    ) {
      movedRef.current = true
    }
  }, [])

  const onTapZonePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (movedRef.current) {
        lastTapRef.current = 0
        tapOriginRef.current = null
        return
      }
      const now = Date.now()
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0
        triggerDoubleTapLike(e.clientX, e.clientY, e.currentTarget)
      } else {
        lastTapRef.current = now
      }
      tapOriginRef.current = null
    },
    [triggerDoubleTapLike]
  )

  const publisherBlock = item.publisher ? (
    <>
      {item.publisher.logoUrl && !logoError ? (
        <Image
          src={item.publisher.logoUrl}
          alt={item.publisher.name}
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/25"
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
      <span className="min-w-0 truncate text-[0.95rem] font-bold text-white underline-offset-2 group-hover:underline">
        {item.publisher.name}
      </span>
      {publisherHref ? (
        <span
          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-white text-black"
          title="Doğrulanmış"
          aria-label="Doğrulanmış yayıncı"
        >
          <Check className="h-2.5 w-2.5 stroke-[3]" aria-hidden />
        </span>
      ) : null}
      {timeLabel ? (
        <span className="shrink-0 whitespace-nowrap text-xs font-medium text-white/70">
          · {timeLabel}
        </span>
      ) : null}
    </>
  ) : null

  return (
    <article
      ref={cardRef}
      className="relative flex h-[var(--feed-card-h,100dvh)] w-full snap-start snap-always flex-col overflow-hidden bg-black"
      aria-label={item.headline}
      data-article-id={item.articleId}
      data-active={isActive ? 'true' : 'false'}
      data-feed-skin={skin.id}
      data-feed-layout={skin.layout}
      data-testid="smart-feed-card"
      style={
        {
          ['--feed-skin-accent']: skin.accent,
          ['--feed-publisher-accent']: publisherAccent,
        } as CSSProperties
      }
    >
      <div className="absolute inset-0 bg-black" data-testid="smart-feed-media">
        {showVideo ? (
          <video
            key={`vid-${item.articleId}-${playMediaDolly ? 'in' : 'idle'}`}
            src={item.video!}
            className={cn(
              'h-full w-full object-cover will-change-transform',
              playMediaDolly
                ? 'animate-[smart-feed-media-dolly_2.6s_cubic-bezier(0.16,1,0.3,1)_forwards]'
                : 'scale-100'
            )}
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
              key={`img-${item.articleId}-${playMediaDolly ? 'in' : 'idle'}`}
              src={item.image!}
              alt={item.headline || ''}
              fill
              className={cn(
                'object-cover object-center will-change-transform',
                playMediaDolly
                  ? 'animate-[smart-feed-media-dolly_2.6s_cubic-bezier(0.16,1,0.3,1)_forwards]'
                  : 'scale-100'
              )}
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
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-[22%] bg-gradient-to-b from-black/50 via-black/15 to-transparent',
            isCenter && 'from-black/40'
          )}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[68%] bg-gradient-to-t from-black via-black/85 to-transparent"
          aria-hidden
        />

        {skin.frame !== 'none' ? (
          <div
            className={cn(
              'pointer-events-none absolute z-[2] rounded-md border-[1.5px]',
              skin.frame === 'magazine'
                ? 'inset-3 border-[color:var(--feed-skin-accent)]/75'
                : 'inset-2.5 border-white/35',
              isActive && 'animate-[smart-feed-frame-in_0.85s_ease-out_forwards]'
            )}
            aria-hidden
            data-testid="smart-feed-skin-frame"
          />
        ) : null}

        {skin.wipe ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-[36%] z-[3] h-[3px] origin-left scale-x-0 bg-gradient-to-r from-green-500 via-yellow-400 to-red-500',
              isActive &&
                'animate-[smart-feed-wipe_0.7s_cubic-bezier(0.16,1,0.3,1)_0.15s_forwards]'
            )}
            aria-hidden
          />
        ) : null}

        {skin.ticker ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-[34%] z-[3] h-px bg-gradient-to-r from-transparent via-[color:var(--feed-skin-accent)] to-transparent opacity-90"
            aria-hidden
          />
        ) : null}
      </div>

      {skin.liveBar ? (
        <div
          className={cn(
            'absolute inset-x-0 top-0 z-[6] flex h-0 items-center justify-center gap-2 overflow-hidden bg-[color:var(--feed-skin-accent)] text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-white',
            isActive && 'animate-[smart-feed-live-bar_0.45s_ease-out_forwards]'
          )}
          aria-hidden
          data-testid="smart-feed-live-bar"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Son Dakika
        </div>
      ) : null}

      <div
        className={cn(
          'relative z-10 flex flex-1 flex-col px-3 sm:px-4',
          /* Lift chrome off home-indicator — publisher/follow sit a few points higher */
          'pb-[max(1.65rem,calc(env(safe-area-inset-bottom,0px)+1.05rem))]',
          MODE_NAV_CLEARANCE,
          'md:mx-auto md:w-full md:max-w-lg'
        )}
      >
        {/* Double-tap zone — media only; copy always bottom (standard news) */}
        <div
          className="relative min-h-[18vh] flex-1 touch-manipulation"
          data-testid="smart-feed-double-tap-zone"
          onPointerDown={onTapZonePointerDown}
          onPointerMove={onTapZonePointerMove}
          onPointerUp={onTapZonePointerUp}
          onPointerCancel={() => {
            lastTapRef.current = 0
            tapOriginRef.current = null
          }}
        >
          {heartBurst ? (
            <span
              key={heartBurst.id}
              className="pointer-events-none absolute z-30 animate-[smart-feed-heart-burst_0.85s_ease-out_forwards]"
              style={{ left: heartBurst.x, top: heartBurst.y }}
              data-testid="smart-feed-heart-burst"
            >
              <Heart className="h-20 w-20 fill-rose-500 text-rose-500 drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]" />
            </span>
          ) : null}
        </div>

        {/* Bottom lower-third — text starts higher; publisher/follow lifted */}
        <div
          className="relative z-[2] mt-auto flex w-full min-h-0 flex-col justify-end bg-gradient-to-t from-black via-black/88 to-transparent pt-14 pr-[3.75rem]"
          data-testid="smart-feed-bottom-chrome"
        >
          <div className="min-w-0 space-y-2.5 pb-2" data-testid="smart-feed-text-zone">
            <div
              className="max-h-[42vh] space-y-2 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
              data-testid="smart-feed-copy-scroll"
              onTouchStart={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <div className="flex flex-wrap items-center gap-2">
                {cat ? (
                  <span
                    className={cn(
                      'text-[11px] font-extrabold tracking-[0.06em]',
                      skin.badge === 'ghost'
                        ? 'rounded-md bg-white/10 px-2 py-0.5 text-[color:var(--feed-skin-accent)]'
                        : 'rounded-md px-2 py-0.5 text-white',
                      skin.badge === 'solid' && 'bg-[color:var(--feed-skin-accent)]',
                      skin.id === 'spor' && 'rounded-full'
                    )}
                  >
                    {cat}
                  </span>
                ) : null}
                {item.breaking && skin.id !== 'son-dakika' ? (
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
              </div>
              <h2
                className={cn('break-words text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)]', skin.headlineClass)}
                data-testid="smart-feed-headline"
              >
                {typedHeadline}
                {showCursor ? (
                  <span
                    className="ml-0.5 inline-block h-[0.9em] w-[0.08em] animate-pulse align-[-0.08em]"
                    style={{ background: 'var(--feed-skin-accent)' }}
                    aria-hidden
                  />
                ) : null}
              </h2>
              {item.summary ? (
                <p
                  className={cn(
                    'break-words whitespace-pre-wrap transition-opacity duration-300 drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]',
                    skin.summaryClass,
                    headlineDone ? 'opacity-100' : 'opacity-0'
                  )}
                  data-testid="smart-feed-summary"
                >
                  {item.summary}
                </p>
              ) : null}
              <button
                type="button"
                onClick={onReadClick}
                data-testid="smart-feed-read-cta"
                className="mt-1 inline-flex w-full items-center justify-center rounded-full px-5 py-2.5 text-sm font-extrabold text-black transition active:scale-[0.99]"
                style={{ background: 'color-mix(in srgb, var(--feed-skin-accent) 18%, white)' }}
              >
                Haberi Oku →
              </button>
            </div>

            {item.publisher ? (
              <div
                className="mb-1 flex min-w-0 flex-nowrap items-center gap-1.5"
                data-testid="smart-feed-publisher-row"
              >
                {publisherHref ? (
                  <Link
                    href={publisherHref}
                    className="group flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-full bg-black/75 py-1 pl-1 pr-2.5 ring-1 ring-white/10"
                    style={{ boxShadow: `inset 0 0 0 1px ${publisherAccent}55` }}
                    data-testid="smart-feed-publisher-link"
                  >
                    {publisherBlock}
                  </Link>
                ) : (
                  <div
                    className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-full bg-black/75 py-1 pl-1 pr-2.5"
                    style={{ boxShadow: `inset 0 0 0 1px ${publisherAccent}55` }}
                  >
                    {publisherBlock}
                  </div>
                )}
                {isFollowablePublisherId(item.publisher.id) ? (
                  <FollowButton
                    publisherId={item.publisher.id}
                    publisherSlug={
                      isPublisherProfileSlug(item.publisher.slug)
                        ? item.publisher.slug
                        : isPublisherProfileSlug(item.publisher.id)
                          ? item.publisher.id
                          : undefined
                    }
                    className="shrink-0"
                    showCount={false}
                    variant="overlay"
                    returnUrl="/feed-v2"
                  />
                ) : null}
              </div>
            ) : null}

            {showDiscoveryRail && isActive ? (
              <FeedDiscoveryRail
                category={discoveryCategory}
                excludeIds={new Set([item.articleId, ...(discoveryExcludeIds ?? [])])}
              />
            ) : null}

            {debug ? (
              <pre className="max-h-24 overflow-auto rounded bg-black/60 p-2 text-[10px] text-green-300">
                {JSON.stringify(
                  {
                    skin: skin.id,
                    layout: skin.layout,
                    reason: item.reason,
                    category: item.category,
                    publisherSlug: item.publisher?.slug,
                    publisherId: item.publisher?.id,
                  },
                  null,
                  0
                )}
              </pre>
            ) : null}
          </div>
        </div>

        {/* Viewport-anchored social column — independent of copy length */}
        <div
          className="pointer-events-auto absolute right-2 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-3"
          data-testid="smart-feed-social-dock"
        >
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
            reaction={reaction}
            onToggleLike={onToggleLike}
            onReact={onReact}
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
    </article>
  )
}
