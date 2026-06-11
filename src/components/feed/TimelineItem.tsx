'use client'

import Link from 'next/link'
import { Play } from 'lucide-react'
import type { TimelinePost } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { getPrimaryVideo, hasVideoContent } from '@/lib/postUtils'
import { formatTimelineTime, formatTimelineRelative } from '@/lib/timelineUtils'
import { TimelineItemActions } from './TimelineItemActions'
import { isLocalFeedItem } from '@/lib/feedRanking'
import { getCategoryLabel } from '@/lib/newsMapper'
import { resolveTimelineImageUrl } from '@/lib/feedMediaUtils'
import { shouldShowBreakingBadge } from '@/lib/newsBreaking'
import { getCityCategoryName } from '@/constants/cities'
import { useUserLocation } from '@/hooks/useUserLocation'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import Image from 'next/image'
import { FEED_FALLBACK_LOGO, getCategoryFallbackGradient } from '@/lib/feedMediaUtils'

interface TimelineItemProps {
  post: TimelinePost
  showConnector?: boolean
  featured?: boolean
  isLast?: boolean
}

export function TimelineItem({ post, featured = false, isLast = false }: TimelineItemProps) {
  const { citySlug: userCitySlug } = useUserLocation()
  const isLocal = isLocalFeedItem(post, userCitySlug)
  const timeLabel = formatTimelineTime(post.publishedAt)
  const relative = formatTimelineRelative(post.publishedAt)
  const isVideo = hasVideoContent(post)
  const detailHref = isVideo
    ? ROUTES.REELS_VIDEO(post.id)
    : post.slug && post.slug !== post.id
      ? ROUTES.NEWS_DETAIL(post.slug)
      : ROUTES.POST_DETAIL(post.id)

  const videoMedia = getPrimaryVideo(post)
  const { url: imageUrl, isFallback: isFallbackImage } = resolveTimelineImageUrl(post)
  const fallbackGradient = getCategoryFallbackGradient(post.categoryId)

  const showBreaking = shouldShowBreakingBadge(post)
  const categoryLabel = getCategoryLabel(post.categoryId)

  return (
    <article className="relative flex gap-3 px-3 py-0 sm:px-4">
      {/* ── Left rail: dot + line ── */}
      <div className="relative flex w-5 shrink-0 flex-col items-center">
        {/* Dot */}
        <div
          className={`relative z-10 mt-3.5 h-3 w-3 shrink-0 rounded-full ring-2 ring-[rgb(var(--color-surface))] ${
            showBreaking ? 'timeline-dot-breaking' : 'bg-[rgb(var(--color-brand))]'
          }`}
        />
        {/* Line extending down */}
        {!isLast && (
          <div className="timeline-connector mt-1 w-px flex-1" />
        )}
      </div>

      {/* ── Right content ── */}
      <div className="min-w-0 flex-1 pb-4">
        {/* Time + badges row */}
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 pt-2.5">
          <time
            dateTime={post.publishedAt ?? post.createdAt}
            className="text-xs font-bold text-[rgb(var(--color-brand))] tabular-nums"
            title={relative || timeLabel}
          >
            {timeLabel}
          </time>
          {showBreaking && (
            <span className="inline-flex items-center gap-1 rounded bg-[rgb(var(--color-brand))] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              Son Dakika
            </span>
          )}
          {post.editorType === 'trend' && !showBreaking && (
            <span className="inline-flex items-center rounded bg-purple-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Trending
            </span>
          )}
          {isLocal && !showBreaking && (
            <span className="inline-flex items-center rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {post.citySlug ? getCityCategoryName(post.citySlug) : 'Yakınınızda'}
            </span>
          )}
        </div>

        {/* Card: image with overlay */}
        <Link href={detailHref} className="group block overflow-hidden rounded-2xl shadow-md">
          <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: '4/3' }}>
            {/* Image or fallback */}
            {isFallbackImage || !imageUrl ? (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${fallbackGradient} 0%, #111827 100%)` }}
              >
                <Image
                  src={FEED_FALLBACK_LOGO}
                  alt=""
                  width={80}
                  height={80}
                  className="h-14 w-auto opacity-80 drop-shadow-lg"
                />
              </div>
            ) : (
              <SafeNewsImage
                src={imageUrl}
                alt=""
                fill
                loading="lazy"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                sizes="(max-width: 640px) calc(100vw - 56px), 680px"
              />
            )}

            {/* Gradient overlay — stronger for readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />

            {/* Category badge — top left */}
            {categoryLabel && (
              <span className="absolute left-3 top-3 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                {categoryLabel}
              </span>
            )}

            {/* Video badge */}
            {isVideo && (
              <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-[rgb(var(--color-brand))]/90 shadow">
                <Play className="h-4 w-4 fill-white text-white" />
              </span>
            )}

            {/* Headline */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h2 className="line-clamp-3 text-[1.05rem] font-black leading-tight tracking-tight text-white drop-shadow-lg sm:text-lg">
                {post.title}
              </h2>
            </div>
          </div>
        </Link>

        {/* Actions */}
        <TimelineItemActions
          postId={post.id}
          title={post.title}
          authorUsername={post.authorUsername}
          likesCount={post.likesCount}
          commentsCount={post.commentsCount}
          viewsCount={post.viewsCount}
          isVideo={isVideo}
        />
      </div>
    </article>
  )
}
