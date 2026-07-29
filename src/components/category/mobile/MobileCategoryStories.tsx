'use client'

import Link from 'next/link'
import { Play } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { hasVideoContent } from '@/lib/postUtils'
import { shouldShowBreakingBadge } from '@/lib/newsBreaking'
import { formatNewsRelative } from '@/components/home/desktop/formatNewsDate'
import {
  categoryPostHref,
  categoryPostImage,
  categoryPostSummary,
} from '@/components/home/desktop/categoryPostUtils'
import { cn } from '@/lib/utils'
import type { TimelinePost } from '@/types/post'
import type { MobileStoryVariant } from '@/lib/mobileCategoryComposition'

function postIso(post: TimelinePost): string {
  const raw = post.publishedAt ?? post.createdAt
  return typeof raw === 'number' ? new Date(raw).toISOString() : String(raw)
}

function Badge({ post, onDark = false }: { post: TimelinePost; onDark?: boolean }) {
  if (shouldShowBreakingBadge(post)) {
    return (
      <span className="mc-badge mc-badge--breaking">
        Son Dakika
      </span>
    )
  }
  const label = getCategoryLabel(post.categoryId)
  if (!label) return null
  return (
    <span className={cn('mc-badge', onDark && 'mc-badge--on-dark')}>{label}</span>
  )
}

export function MobileCategoryHero({
  post,
  priority = false,
}: {
  post: TimelinePost
  priority?: boolean
}) {
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const isVideo = hasVideoContent(post)

  return (
    <article className="mc-hero">
      <Link href={categoryPostHref(post)} className="mc-hero__link group">
        <div className="mc-hero__media">
          <SafeNewsImage
            src={image}
            alt={post.title}
            fill
            sizes="(max-width: 767px) 100vw, 700px"
            priority={priority}
            className="object-cover"
          />
          <div className="mc-hero__scrim" aria-hidden />
          {isVideo ? (
            <span className="mc-play" aria-hidden>
              <Play className="h-5 w-5 fill-white text-white" />
            </span>
          ) : null}
          <div className="mc-hero__body">
            <Badge post={post} onDark />
            <h2 className="mc-hero__title">{post.title}</h2>
          </div>
        </div>
      </Link>
    </article>
  )
}

export function MobileCategoryLarge({ post }: { post: TimelinePost }) {
  const image = categoryPostImage(post)
  const summary = categoryPostSummary(post)
  const isVideo = hasVideoContent(post)

  return (
    <article className="mc-large">
      <Link href={categoryPostHref(post)} className="group block">
        {image ? (
          <div className="mc-large__media">
            <SafeNewsImage
              src={image}
              alt={post.title}
              fill
              sizes="(max-width: 767px) 100vw, 700px"
              className="object-cover transition-transform duration-300 group-active:scale-[1.01]"
            />
            {isVideo ? (
              <span className="mc-play mc-play--sm" aria-label="Videoyu oynat">
                <Play className="h-4 w-4 fill-white text-white" />
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="mc-large__body">
          <Badge post={post} />
          <h3 className="mc-large__title">{post.title}</h3>
          {summary ? <p className="mc-large__summary">{summary}</p> : null}
        </div>
      </Link>
    </article>
  )
}

export function MobileCategoryCompact({ post }: { post: TimelinePost }) {
  const image = categoryPostImage(post)
  const summary = categoryPostSummary(post)
  const isVideo = hasVideoContent(post)

  if (!image) {
    return <MobileCategoryText post={post} />
  }

  return (
    <article className="mc-compact">
      <Link href={categoryPostHref(post)} className="mc-compact__link group">
        <div className="mc-compact__media">
          <SafeNewsImage
            src={image}
            alt={post.title}
            fill
            sizes="(max-width: 767px) 44vw, 280px"
            className="object-cover transition-transform duration-300 group-active:scale-[1.02]"
          />
          {isVideo ? (
            <span className="mc-play mc-play--xs" aria-hidden>
              <Play className="h-3.5 w-3.5 fill-white text-white" />
            </span>
          ) : null}
        </div>
        <div className="mc-compact__body">
          <Badge post={post} />
          <h3 className="mc-compact__title">{post.title}</h3>
          {summary ? <p className="mc-compact__summary">{summary}</p> : null}
        </div>
      </Link>
    </article>
  )
}

export function MobileCategoryVideo({ post }: { post: TimelinePost }) {
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const summary = categoryPostSummary(post)

  return (
    <article className="mc-video">
      <Link href={categoryPostHref(post)} className="mc-video__link group">
        <div className="mc-video__media">
          <SafeNewsImage
            src={image}
            alt={post.title}
            fill
            sizes="(max-width: 767px) 44vw, 280px"
            className="object-cover"
          />
          <span className="mc-play" aria-label="Videoyu oynat">
            <Play className="h-5 w-5 fill-white text-white" />
          </span>
        </div>
        <div className="mc-video__body">
          <Badge post={post} onDark />
          <h3 className="mc-video__title">{post.title}</h3>
          {summary ? <p className="mc-video__summary">{summary}</p> : null}
        </div>
      </Link>
    </article>
  )
}

export function MobileCategoryText({ post }: { post: TimelinePost }) {
  const summary = categoryPostSummary(post)
  const time = formatNewsRelative(postIso(post))

  return (
    <article className="mc-text">
      <Link href={categoryPostHref(post)} className="group block">
        <Badge post={post} />
        <h3 className="mc-text__title">{post.title}</h3>
        {summary ? <p className="mc-text__summary">{summary}</p> : null}
        {time ? <p className="mc-text__meta">{time}</p> : null}
      </Link>
    </article>
  )
}

export function MobileCategoryStory({
  variant,
  post,
  priority,
}: {
  variant: MobileStoryVariant
  post: TimelinePost
  priority?: boolean
}) {
  switch (variant) {
    case 'hero':
      return <MobileCategoryHero post={post} priority={priority} />
    case 'large':
      return <MobileCategoryLarge post={post} />
    case 'video':
      return <MobileCategoryVideo post={post} />
    case 'text':
      return <MobileCategoryText post={post} />
    case 'compact':
    case 'feed':
    default:
      return <MobileCategoryCompact post={post} />
  }
}
