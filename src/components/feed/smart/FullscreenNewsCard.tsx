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
  likeLoading?: boolean
  saveLoading?: boolean
  onToggleLike: () => void
  onToggleSave: () => void
  onCommentClick: () => void
  onReadClick: () => void
  onFeedback?: (type: 'hide_article' | 'less_publisher' | 'less_topic') => void
  cardRef?: (node: HTMLElement | null) => void
}

export function FullscreenNewsCard({
  item,
  isActive,
  debug,
  liked,
  saved,
  likeCount,
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
  const useContain = imageAspect === 'landscape'

  return (
    <article
      ref={cardRef}
      className="relative flex h-[100dvh] w-full snap-start snap-always flex-col overflow-hidden bg-black"
      aria-label={item.headline}
      data-article-id={item.articleId}
      data-active={isActive ? 'true' : 'false'}
      data-media-aspect={showVideo ? 'video' : imageAspect ?? 'unknown'}
    >
      {/* Background Media */}
      <div className="absolute inset-0 bg-neutral-950">
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
            {/* Blurred fill for landscape / letterbox */}
            <Image
              src={item.image!}
              alt=""
              fill
              className="scale-110 object-cover opacity-50 blur-2xl"
              sizes="(max-width: 768px) 100vw, 512px"
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
              className={cn(
                'transition-opacity duration-300',
                useContain ? 'object-contain' : 'object-cover'
              )}
              sizes="(max-width: 768px) 100vw, 512px"
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
          </>
        ) : (
          <div className="relative flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 select-none">
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
        {/* Bottom-weighted gradient — keep media dominant */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/30"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black/95 via-black/55 to-transparent"
          aria-hidden
        />
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-between px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] pt-[5.75rem] md:mx-auto md:w-full md:max-w-lg">
        {/* Publisher header */}
        {item.publisher ? (
          <div className="flex items-center justify-between gap-2">
            {item.publisher.slug && !item.publisher.slug.startsWith('src_') ? (
              <Link
                href={ROUTES.PUBLISHER(item.publisher.slug)}
                className="flex min-w-0 items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm transition hover:bg-black/60"
              >
                {item.publisher.logoUrl && !logoError ? (
                  <Image
                    src={item.publisher.logoUrl}
                    alt={item.publisher.name}
                    width={24}
                    height={24}
                    className="shrink-0 rounded-full object-cover"
                    onError={() => setLogoError(true)}
                    unoptimized={
                      item.publisher.logoUrl.startsWith('http://') ||
                      item.publisher.logoUrl.startsWith('https://')
                    }
                  />
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold uppercase text-white">
                    {item.publisher.name ? item.publisher.name.slice(0, 1) : 'N'}
                  </span>
                )}
                <span className="truncate text-xs font-semibold text-white">{item.publisher.name}</span>
                {item.publishedAt ? (
                  <>
                    <span className="select-none text-xs text-white/40">·</span>
                    <span className="shrink-0 text-xs text-white/70">{formatRelativeTime(item.publishedAt)}</span>
                  </>
                ) : null}
              </Link>
            ) : (
              <div className="flex min-w-0 items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm">
                {item.publisher.logoUrl && !logoError ? (
                  <Image
                    src={item.publisher.logoUrl}
                    alt={item.publisher.name}
                    width={24}
                    height={24}
                    className="shrink-0 rounded-full object-cover"
                    onError={() => setLogoError(true)}
                    unoptimized={
                      item.publisher.logoUrl.startsWith('http://') ||
                      item.publisher.logoUrl.startsWith('https://')
                    }
                  />
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold uppercase text-white">
                    {item.publisher.name ? item.publisher.name.slice(0, 1) : 'N'}
                  </span>
                )}
                <span className="truncate text-xs font-semibold text-white">{item.publisher.name}</span>
                {item.publishedAt ? (
                  <>
                    <span className="select-none text-xs text-white/40">·</span>
                    <span className="shrink-0 text-xs text-white/70">{formatRelativeTime(item.publishedAt)}</span>
                  </>
                ) : null}
              </div>
            )}
            <div className="flex shrink-0 items-center gap-1">
              <FollowButton
                publisherId={item.publisher.id}
                publisherSlug={item.publisher.slug}
                className="shrink-0"
                showCount={false}
              />
              <FeedCardMenu item={item} onFeedback={onFeedback} />
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <FeedCardMenu item={item} onFeedback={onFeedback} />
          </div>
        )}

        {/* Lower text zone + reserved right rail — never consume full viewport */}
        <div className="relative mt-auto flex max-h-[46vh] items-end gap-3">
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

            <h2 className="text-[1.25rem] font-bold leading-snug text-white sm:text-[1.35rem] md:text-3xl">
              {item.headline}
            </h2>

            {item.summary ? (
              <p
                className="break-words text-[0.9rem] leading-relaxed text-white/80 md:text-[0.95rem]"
                data-testid="smart-feed-summary"
              >
                {item.summary}
              </p>
            ) : null}

            <button
              type="button"
              onClick={onReadClick}
              data-testid="smart-feed-read-cta"
              className="mt-1 inline-flex items-center justify-center rounded-full bg-white/95 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-white active:scale-[0.99]"
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
            likeCount={typeof likeCount === 'number' ? likeCount : item.socialCounts.likes}
            commentCount={item.socialCounts.comments}
            onToggleLike={onToggleLike}
            onToggleSave={onToggleSave}
            onCommentClick={onCommentClick}
            likeLoading={likeLoading}
            saveLoading={saveLoading}
            orientation="vertical"
            className="mb-1 shrink-0 text-white"
            data-testid="smart-feed-social-rail"
          />
        </div>
      </div>
    </article>
  )
}
