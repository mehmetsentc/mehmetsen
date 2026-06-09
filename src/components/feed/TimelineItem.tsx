'use client'

import Link from 'next/link'
import { Clapperboard, Play } from 'lucide-react'
import type { TimelinePost } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { getPrimaryVideo, hasVideoContent } from '@/lib/postUtils'
import {
  formatTimelineTime,
  formatTimelineRelative,
} from '@/lib/timelineUtils'
import { TimelineItemActions } from './TimelineItemActions'
import { isLocalFeedItem } from '@/lib/feedRanking'
import { buildFeedTeaser } from '@/lib/newsContentCleanup'
import { getCategoryLabel } from '@/lib/newsMapper'
import { resolveTimelineImageUrl } from '@/lib/feedMediaUtils'
import { shouldShowBreakingBadge } from '@/lib/newsBreaking'
import { getCityCategoryName } from '@/constants/cities'
import { useUserLocation } from '@/hooks/useUserLocation'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'

interface TimelineItemProps {
  post: TimelinePost
  showConnector?: boolean
  featured?: boolean
}

export function TimelineItem({ post, featured = false }: TimelineItemProps) {
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
  const videoUrl = videoMedia?.url ?? null

  const cityName =
    post.city?.trim() ||
    (post.citySlug?.trim() ? getCityCategoryName(post.citySlug.trim()) : null)

  const showBreaking = shouldShowBreakingBadge(post)
  const feedTeaser =
    post.feedTeaser ?? buildFeedTeaser(post.title, post.summary, post.content)

  const categoryLabel = post.categoryId ? getCategoryLabel(post.categoryId) : null

  return (
    <article className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] py-4">
      {/* Row 1: dot + time + badges */}
      <div className="mb-2 flex flex-wrap items-center gap-2 px-4">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />
        <time
          dateTime={post.publishedAt ?? post.createdAt}
          className="text-sm font-bold text-orange-500 tabular-nums"
          title={relative || timeLabel}
        >
          {timeLabel}
        </time>

        {(showBreaking || featured) && (
          <span className="inline-flex items-center rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
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
        {categoryLabel && !showBreaking && (
          <span className="text-[11px] font-semibold text-[rgb(var(--color-muted))]">
            {categoryLabel}
          </span>
        )}
        {isVideo && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-purple-600">
            <Clapperboard className="h-3 w-3" />
            Teve
          </span>
        )}
      </div>

      {/* Row 2: title */}
      <Link href={detailHref} className="group block px-4 pb-3">
        <h2 className="text-[1.0625rem] font-black leading-snug tracking-tight text-[rgb(var(--color-text))] group-hover:text-orange-500 sm:text-lg">
          {post.title}
        </h2>
      </Link>

      {/* Row 3: media */}
      {!isFallbackImage && imageUrl && (
        <Link href={detailHref} className="block">
          <div className="relative aspect-[16/9] w-full overflow-hidden">
            <SafeNewsImage
              src={imageUrl}
              alt=""
              fill
              loading="lazy"
              className="object-cover transition-transform duration-300 hover:scale-[1.02]"
              sizes="(max-width: 768px) 100vw, 720px"
            />
            {isVideo && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
                  <Play className="h-7 w-7 fill-white text-white" />
                </span>
              </span>
            )}
            {cityName && (
              <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white shadow-md backdrop-blur-sm">
                {cityName}
              </span>
            )}
          </div>
        </Link>
      )}

      {/* Video without thumbnail */}
      {isVideo && videoUrl && isFallbackImage && (
        <Link href={detailHref} className="block">
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-black">
            <video
              src={videoUrl}
              muted
              playsInline
              preload="none"
              className="h-full w-full object-cover"
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
                <Play className="h-7 w-7 fill-white text-white" />
              </span>
            </span>
          </div>
        </Link>
      )}

      {/* Teaser */}
      {feedTeaser && (
        <p className="line-clamp-2 px-4 pt-2 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
          {feedTeaser}{' '}
          <Link href={detailHref} className="font-medium text-orange-500 hover:underline">
            Devamını oku
          </Link>
        </p>
      )}

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
    </article>
  )
}
