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

  const videoEnabled = isSmartFeedVideoEnabledClient()
  const showVideo = Boolean(videoEnabled && item.video && isActive)
  const hasValidImage = Boolean(item.image && !imageError)

  return (
    <article
      ref={cardRef}
      className="relative flex h-[100dvh] w-full snap-start snap-always flex-col overflow-hidden bg-black"
      aria-label={item.headline}
      data-article-id={item.articleId}
      data-active={isActive ? 'true' : 'false'}
    >
      {/* Background Media & Fallback */}
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
          <Image
            src={item.image!}
            alt={item.headline || ''}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 512px"
            priority={isActive}
            onError={() => setImageError(true)}
            unoptimized={typeof item.image === 'string' && (item.image.startsWith('http://') || item.image.startsWith('https://'))}
          />
        ) : (
          <div className="relative h-full w-full bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 flex flex-col items-center justify-center select-none">
            {/* Subtle dot matrix pattern */}
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px]" />
            <div className="flex flex-col items-center gap-2 opacity-25">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10">
                <Newspaper className="h-8 w-8 text-white" />
              </div>
              <span className="text-xs font-semibold tracking-wider text-white uppercase">
                {item.publisher?.name || 'NaHaber'}
              </span>
            </div>
          </div>
        )}
        {/* Gradient Scrim for Contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/30" aria-hidden />
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-between p-4 pt-16 pb-6 md:mx-auto md:max-w-lg md:w-full">
        {/* Publisher header */}
        {item.publisher ? (
          <div className="flex items-center justify-between gap-2">
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
                  className="rounded-full object-cover shrink-0"
                  onError={() => setLogoError(true)}
                  unoptimized={item.publisher.logoUrl.startsWith('http://') || item.publisher.logoUrl.startsWith('https://')}
                />
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white uppercase">
                  {item.publisher.name ? item.publisher.name.slice(0, 1) : 'N'}
                </span>
              )}
              <span className="truncate text-xs font-semibold text-white">{item.publisher.name}</span>
              {item.publishedAt ? (
                <>
                  <span className="text-white/40 text-xs select-none">·</span>
                  <span className="shrink-0 text-xs text-white/70">{formatRelativeTime(item.publishedAt)}</span>
                </>
              ) : null}
            </Link>
            <div className="flex items-center gap-1 shrink-0">
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

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
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

          <h2 className="line-clamp-3 text-2xl font-bold leading-tight text-white md:text-3xl">{item.headline}</h2>
          {item.summary ? (
            <p className="line-clamp-2 text-sm leading-relaxed text-white/85 md:text-base">{item.summary}</p>
          ) : null}

          <button
            type="button"
            onClick={onReadClick}
            className="mt-2 w-full rounded-full bg-white py-3 text-center text-sm font-bold text-black transition hover:bg-white/90 active:scale-[0.99]"
          >
            Haberi Oku
          </button>

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
            className="text-white"
          />

          {debug ? (
            <pre className="max-h-24 overflow-auto rounded bg-black/60 p-2 text-[10px] text-green-300">
              {JSON.stringify(
                { reason: item.reason, scoreBreakdown: item.scoreBreakdown, clusterId: item.clusterId, articleId: item.articleId },
                null,
                0
              )}
            </pre>
          ) : null}
        </div>
      </div>
    </article>
  )
}
