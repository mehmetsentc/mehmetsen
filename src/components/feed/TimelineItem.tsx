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

  return (
    <article className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] py-3">
      {/* Dot + time + badges */}
      <div className="mb-1.5 flex flex-wrap items-center gap-2 px-4">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[rgb(var(--color-brand))]" />
        <time
          dateTime={post.publishedAt ?? post.createdAt}
          className="text-sm font-bold text-[rgb(var(--color-brand))] tabular-nums"
          title={relative || timeLabel}
        >
          {timeLabel}
        </time>
        {(showBreaking || featured) && (
          <span className="inline-flex items-center rounded bg-[rgb(var(--color-brand))] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
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

      {/* Title */}
      <Link href={detailHref} className="group block px-4 pb-2">
        <h2 className="text-[1.0625rem] font-black leading-snug tracking-tight text-[rgb(var(--color-text))] group-hover:text-[rgb(var(--color-brand))] sm:text-lg">
          {post.title}
        </h2>
      </Link>

      {/* Image */}
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
              <span className="pointer-events-none absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[rgb(var(--color-brand))]">
                <Play className="h-5 w-5 fill-white text-white" />
              </span>
            )}
          </div>
        </Link>
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
