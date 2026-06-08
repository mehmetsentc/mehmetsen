'use client'

import Link from 'next/link'
import { Clapperboard, Users } from 'lucide-react'
import type { TimelinePost } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { getPrimaryVideo, hasVideoContent } from '@/lib/postUtils'
import {
  formatTimelineTime,
  formatTimelineRelative,
  getPostTypeLabel,
  getPostTypeStyle,
} from '@/lib/timelineUtils'
import { TimelineItemActions } from './TimelineItemActions'
import { FeedMediaCard } from './FeedMediaCard'
import { PostMeta } from '@/components/post/PostMeta'
import { isLocalFeedItem } from '@/lib/feedRanking'
import { buildFeedTeaser } from '@/lib/newsContentCleanup'
import { getCategoryLabel } from '@/lib/newsMapper'
import { resolveTimelineImageUrl } from '@/lib/feedMediaUtils'
import { shouldShowBreakingBadge } from '@/lib/newsBreaking'
import { getCityCategoryName } from '@/constants/cities'
import { useUserLocation } from '@/hooks/useUserLocation'

interface TimelineItemProps {
  post: TimelinePost
  showConnector?: boolean
  featured?: boolean
}

export function TimelineItem({ post, showConnector = true, featured = false }: TimelineItemProps) {
  const { citySlug: userCitySlug } = useUserLocation()
  const isLocal = isLocalFeedItem(post, userCitySlug)
  const postType = post.postType ?? 'news'
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

  return (
    <article className={featured ? 'timeline-item timeline-item-featured group' : 'timeline-item group'}>
      <div className="timeline-rail" aria-hidden={!showConnector}>
        <span className="timeline-dot" />
        {showConnector && <span className="timeline-line" />}
      </div>

      <div className="timeline-body min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {isLocal && !showBreaking && (
            <span className="inline-flex items-center rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {post.citySlug ? getCityCategoryName(post.citySlug) : 'Yakınınızda'}
            </span>
          )}
          {(showBreaking || featured) && (
            <span className="inline-flex items-center rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {showBreaking ? 'Son Dakika' : 'Son haber'}
            </span>
          )}
          {post.editorType === 'trend' && !showBreaking && (
            <span className="inline-flex items-center rounded bg-purple-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Trending
            </span>
          )}
          <time
            dateTime={post.publishedAt ?? post.createdAt}
            className="timeline-time tabular-nums"
            title={relative || timeLabel}
          >
            {timeLabel}
          </time>
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${getPostTypeStyle(postType)}`}
          >
            {getPostTypeLabel(postType)}
          </span>
          {post.isFromFollowing && (
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900">
              <Users className="h-3 w-3" />
              Takip
            </span>
          )}
          {isVideo && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
              <Clapperboard className="h-3 w-3" />
              Teve
            </span>
          )}
        </div>

        <FeedMediaCard
          href={detailHref}
          title={post.title}
          isVideo={isVideo}
          imageUrl={imageUrl}
          videoUrl={videoUrl}
          categoryLabel={post.categoryId ? getCategoryLabel(post.categoryId) : null}
          categoryId={post.categoryId}
          cityName={cityName}
          isFallbackImage={isFallbackImage}
        />

        {feedTeaser && (
          <p className="timeline-summary mt-2 px-0.5">
            {feedTeaser}
            {' '}
            <Link href={detailHref} className="timeline-read-more">
              Devamını oku
            </Link>
          </p>
        )}

        <PostMeta post={post} className="mt-3" />

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
