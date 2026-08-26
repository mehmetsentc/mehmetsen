'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Zap, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants/routes'
import { FollowButton } from '@/components/social/FollowButton'
import { SocialActionRail } from '@/components/social/SocialActionRail'
import { FeedCardMenu } from '@/components/feed/smart/FeedCardMenu'
import { isSmartFeedVideoEnabledClient } from '@/lib/feed/featureFlagClient'
import type { FeedItemDto } from '@/types/smartFeed'

interface FullscreenNewsCardProps {
  item: FeedItemDto
  isActive: boolean
  debug?: boolean
  liked: boolean
  saved: boolean
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
  likeLoading,
  saveLoading,
  onToggleLike,
  onToggleSave,
  onCommentClick,
  onReadClick,
  onFeedback,
  cardRef,
}: FullscreenNewsCardProps) {
  const videoEnabled = isSmartFeedVideoEnabledClient()
  const showVideo = videoEnabled && item.video && isActive

  return (
    <article
      ref={cardRef}
      className="relative flex h-[100dvh] w-full snap-start snap-always flex-col overflow-hidden bg-black"
      aria-label={item.headline}
      data-article-id={item.articleId}
      data-active={isActive ? 'true' : 'false'}
    >
      <div className="absolute inset-0">
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
        ) : item.image ? (
          <Image
            src={item.image}
            alt=""
            fill
            className="object-cover"
            sizes="100vw"
            priority={isActive}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-gray-900 to-gray-800" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/20" aria-hidden />
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-between p-4 pb-6 md:mx-auto md:max-w-lg md:w-full">
        {/* Publisher header */}
        {item.publisher ? (
          <div className="flex items-center justify-between gap-3">
            <Link
              href={ROUTES.PUBLISHER(item.publisher.slug)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm"
            >
              {item.publisher.logoUrl ? (
                <Image
                  src={item.publisher.logoUrl}
                  alt=""
                  width={28}
                  height={28}
                  className="rounded-full object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {item.publisher.name.slice(0, 1)}
                </span>
              )}
              <span className="truncate text-sm font-semibold text-white">{item.publisher.name}</span>
            </Link>
            <FollowButton
              publisherId={item.publisher.id}
              publisherSlug={item.publisher.slug}
              className="shrink-0"
              showCount={false}
            />
            <FeedCardMenu item={item} onFeedback={onFeedback} />
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

          <h2 className="text-2xl font-bold leading-tight text-white md:text-3xl">{item.headline}</h2>
          {item.summary ? (
            <p className="line-clamp-3 text-sm leading-relaxed text-white/85 md:text-base">{item.summary}</p>
          ) : null}

          <button
            type="button"
            onClick={onReadClick}
            className="mt-2 w-full rounded-full bg-white py-3 text-center text-sm font-bold text-black transition hover:bg-white/90"
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
            likeCount={item.socialCounts.likes}
            commentCount={item.socialCounts.comments}
            onToggleLike={onToggleLike}
            onToggleSave={onToggleSave}
            onCommentClick={onCommentClick}
            likeLoading={likeLoading}
            saveLoading={saveLoading}
            className="text-white [&_button]:text-white [&_span]:text-white/80"
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
