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
import { buildFeedTeaser } from '@/lib/newsContentCleanup'
import { FEED_FALLBACK_LOGO, getCategoryFallbackGradient } from '@/lib/feedMediaUtils'
import Image from 'next/image'

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
  const categoryLabel = post.categoryId ? getCategoryLabel(post.categoryId) : null
  const fallbackGradient = getCategoryFallbackGradient(post.categoryId)

  const badgeLabel = showBreaking
    ? 'Son Dakika'
    : post.editorType === 'trend'
      ? 'Trending'
      : isLocal
        ? (post.citySlug ? getCityCategoryName(post.citySlug) : 'Yakınınızda')
        : categoryLabel

  const badgeBg = showBreaking
    ? 'bg-red-600'
    : post.editorType === 'trend'
      ? 'bg-purple-600'
      : isLocal
        ? 'bg-emerald-600'
        : 'bg-black/60 backdrop-blur-sm'

  return (
    <article className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
      <Link href={detailHref} className="group block">
        {/* Full-width image with gradient overlay */}
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-black">
          {isVideo && videoUrl && !isFallbackImage ? (
            <video
              src={videoUrl}
              poster={imageUrl ?? undefined}
              muted
              playsInline
              preload="none"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : isFallbackImage ? (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${fallbackGradient} 0%, #111827 100%)` }}
            >
              <Image src={FEED_FALLBACK_LOGO} alt="" width={100} height={100} className="h-14 w-auto opacity-80" />
            </div>
          ) : (
            <SafeNewsImage
              src={imageUrl ?? ''}
              alt=""
              fill
              loading="lazy"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="(max-width: 768px) 100vw, 720px"
            />
          )}

          {/* Video play button */}
          {isVideo && (
            <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
                <Play className="h-7 w-7 fill-white text-white" />
              </span>
            </span>
          )}

          {/* Gradient overlay — stronger at bottom for text legibility */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0.08) 100%)',
            }}
          />

          {/* Top row: category badge + time */}
          <div className="absolute left-3 right-3 top-3 z-10 flex items-start justify-between">
            {badgeLabel && (
              <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white ${badgeBg}`}>
                {badgeLabel}
              </span>
            )}
            <time
              dateTime={post.publishedAt ?? post.createdAt}
              className="ml-auto rounded bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white/90 backdrop-blur-sm tabular-nums"
              title={relative || timeLabel}
            >
              {timeLabel}
            </time>
          </div>

          {/* City badge */}
          {cityName && !isLocal && (
            <span className="absolute right-3 top-9 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              {cityName}
            </span>
          )}

          {/* Bottom: bold headline over gradient */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-4">
            <h2
              className="line-clamp-3 text-[1.0625rem] font-black leading-[1.2] tracking-tight text-white sm:text-xl"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.5)' }}
            >
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
