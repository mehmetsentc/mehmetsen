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

  const showBreaking = shouldShowBreakingBadge(post)
  const categoryLabel = getCategoryLabel(post.categoryId)
  const fallbackGradient = getCategoryFallbackGradient(post.categoryId)

  const hasImage = Boolean(imageUrl)

  return (
    <article className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
      {/* Dot + time row */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--color-brand))]" />
        <time
          dateTime={post.publishedAt ?? post.createdAt}
          className="text-xs font-semibold text-[rgb(var(--color-brand))] tabular-nums"
          title={relative || timeLabel}
        >
          {timeLabel}
        </time>
        {showBreaking && (
          <span className="inline-flex items-center rounded bg-[rgb(var(--color-brand))] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Son Dakika
          </span>
        )}
      </div>

      {/* Card with image overlay */}
      <Link href={detailHref} className="group block">
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/9' }}>
          {/* Background image or fallback */}
          {isFallbackImage || !imageUrl ? (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${fallbackGradient} 0%, #111827 100%)` }}
            >
              <Image
                src={FEED_FALLBACK_LOGO}
                alt=""
                width={100}
                height={100}
                className="h-14 w-auto opacity-80 drop-shadow-lg"
              />
            </div>
          ) : (
            <SafeNewsImage
              src={imageUrl}
              alt=""
              fill
              loading="lazy"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="(max-width: 768px) 100vw, 720px"
            />
          )}

          {/* Dark gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          {/* Category badge — top left */}
          {categoryLabel && (
            <span className="absolute left-3 top-3 inline-flex items-center rounded bg-black/60 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
              {categoryLabel}
            </span>
          )}

          {/* Video play icon */}
          {isVideo && (
            <span className="pointer-events-none absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-[rgb(var(--color-brand))]/90 backdrop-blur-sm">
              <Play className="h-4 w-4 fill-white text-white" />
            </span>
          )}

          {/* Headline overlay — bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <h2 className="line-clamp-3 text-[1rem] font-black leading-snug tracking-tight text-white drop-shadow-sm sm:text-[1.0625rem]">
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
    </article>
  )
}
