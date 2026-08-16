'use client'

import Link from 'next/link'
import { Play, Radio, Sparkles, Bookmark } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import {
  resolveDistrictDisplayLabel,
  withDistrictCategoryLabel,
} from '@/lib/districtLabel'
import { getCategoryLabel } from '@/lib/newsMapper'
import { hasVideoContent } from '@/lib/postUtils'
import { formatNewsDateBbc } from '@/components/home/desktop/formatNewsDate'
import {
  categoryPostHref,
  categoryPostImage,
  categoryPostSummary,
} from '@/components/home/desktop/categoryPostUtils'
import { cn } from '@/lib/utils'
import type { TimelinePost } from '@/types/post'
import type { AspectRatio, CardVariant } from './types'

function postIso(post: TimelinePost): string {
  const raw = post.publishedAt ?? post.createdAt
  return typeof raw === 'number' ? new Date(raw).toISOString() : String(raw)
}

export function useCardMeta(post: TimelinePost) {
  const href = categoryPostHref(post)
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const summary = categoryPostSummary(post)
  const districtLabel = resolveDistrictDisplayLabel({
    district: post.district ?? post.location?.district,
    districtSlug: post.districtSlug,
  })
  const label = withDistrictCategoryLabel(getCategoryLabel(post.categoryId), districtLabel)
  const time = formatNewsDateBbc(postIso(post))
  const isVideo = hasVideoContent(post)
  const reading = post.readingTimeMinutes
  return { href, image, summary, label, time, isVideo, reading }
}

export function AspectBox({
  aspect,
  children,
  className,
}: {
  aspect: AspectRatio
  children: React.ReactNode
  className?: string
}) {
  const map: Record<AspectRatio, string> = {
    '1/1': 'aspect-square',
    '4/5': 'aspect-[4/5]',
    '16/9': 'aspect-video',
    '9/16': 'aspect-[9/16]',
    '3/2': 'aspect-[3/2]',
    '21/9': 'aspect-[21/9]',
  }
  return <div className={cn('relative overflow-hidden bg-[rgb(var(--color-border))]', map[aspect], className)}>{children}</div>
}

export function CardBadge({
  children,
  tone = 'accent',
}: {
  children: React.ReactNode
  tone?: 'accent' | 'live' | 'breaking' | 'ai' | 'muted'
}) {
  return (
    <span
      className={cn(
        'exp-badge',
        tone === 'live' && 'exp-badge--live',
        tone === 'breaking' && 'exp-badge--breaking',
        tone === 'ai' && 'exp-badge--ai',
        tone === 'muted' && 'exp-badge--muted'
      )}
    >
      {children}
    </span>
  )
}

export function MediaOverlay({
  post,
  aspect,
  priority,
  badge,
  titleClassName,
  showSummary,
  hero,
}: {
  post: TimelinePost
  aspect: AspectRatio
  priority?: boolean
  badge?: React.ReactNode
  titleClassName?: string
  showSummary?: boolean
  /** Lead featured card — stronger scrim + sizing */
  hero?: boolean
}) {
  const { href, image, summary, label, time, isVideo } = useCardMeta(post)

  return (
    <Link
      href={href}
      className={cn('exp-card exp-card--overlay group', hero && 'exp-card--hero')}
    >
      <AspectBox aspect={aspect} className="exp-card__media">
        <SafeNewsImage
          src={image}
          alt={post.title}
          fill
          priority={priority}
          sizes={
            hero
              ? '(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1100px'
              : '(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw'
          }
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="exp-card__scrim" aria-hidden />
        {badge ?? (label ? <CardBadge>{label}</CardBadge> : null)}
        {isVideo ? (
          <span className="exp-card__play">
            <Play className="h-4 w-4 fill-white" />
          </span>
        ) : null}
        <div className="exp-card__body">
          <h3 className={cn('exp-card__title', titleClassName)}>{post.title}</h3>
          {showSummary && summary ? <p className="exp-card__summary">{summary}</p> : null}
          {time ? <span className="exp-card__meta">{time}</span> : null}
        </div>
      </AspectBox>
    </Link>
  )
}

export function MediaBelow({
  post,
  aspect,
  priority,
  badge,
  titleClassName,
  showSummary = true,
  kicker,
}: {
  post: TimelinePost
  aspect: AspectRatio
  priority?: boolean
  badge?: React.ReactNode
  titleClassName?: string
  showSummary?: boolean
  kicker?: string
}) {
  const { href, image, summary, label, time, isVideo, reading } = useCardMeta(post)

  return (
    <article className="exp-card exp-card--stack group">
      <Link href={href} className="block">
        <AspectBox aspect={aspect} className="exp-card__media rounded-[var(--exp-radius,1rem)]">
          <SafeNewsImage
            src={image}
            alt={post.title}
            fill
            priority={priority}
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          {isVideo ? (
            <span className="exp-card__play">
              <Play className="h-4 w-4 fill-white" />
            </span>
          ) : null}
        </AspectBox>
        <div className="exp-card__stack-body">
          <div className="exp-card__chips">
            {badge ?? (label ? <CardBadge>{label}</CardBadge> : null)}
          </div>
          <h3 className={cn('exp-card__title exp-card__title--ink', titleClassName)}>{post.title}</h3>
          {showSummary && summary ? <p className="exp-card__summary exp-card__summary--ink">{summary}</p> : null}
          <div className="exp-card__meta-row">
            {time ? <span>{time}</span> : null}
            {kicker ? <span>{kicker}</span> : null}
            {reading ? <span>{reading} dk okuma</span> : null}
          </div>
        </div>
      </Link>
    </article>
  )
}

export function QuoteSurface({ post }: { post: TimelinePost }) {
  const { href, label, time } = useCardMeta(post)
  return (
    <Link href={href} className="exp-card exp-card--quote group">
      <span className="exp-card__quote-mark" aria-hidden>
        “
      </span>
      <div className="exp-card__chips">
        {label ? <CardBadge tone="muted">{label}</CardBadge> : null}
      </div>
      <h3 className="exp-card__quote-title">{post.title}</h3>
      {time ? <span className="exp-card__meta exp-card__meta--ink">{time}</span> : null}
    </Link>
  )
}

export function AiSurface({ post }: { post: TimelinePost }) {
  const { href, summary, time } = useCardMeta(post)
  return (
    <Link href={href} className="exp-card exp-card--ai group">
      <div className="exp-card__chips">
        <CardBadge tone="ai">
          <Sparkles className="mr-1 inline h-3 w-3" />
          NaHaber Özet
        </CardBadge>
      </div>
      <h3 className="exp-card__title exp-card__title--ink">{post.title}</h3>
      {summary ? <p className="exp-card__summary exp-card__summary--ink mt-2 line-clamp-4">{summary}</p> : null}
      {time ? <span className="exp-card__meta exp-card__meta--ink mt-3 block">{time}</span> : null}
    </Link>
  )
}

export function LiveSurface({ post, aspect }: { post: TimelinePost; aspect: AspectRatio }) {
  return (
    <MediaOverlay
      post={post}
      aspect={aspect}
      badge={
        <CardBadge tone="live">
          <Radio className="mr-1 inline h-3 w-3" />
          Canlı
        </CardBadge>
      }
      showSummary
      titleClassName="text-[1.15rem] sm:text-xl"
    />
  )
}

export function BreakingSurface({ post, aspect }: { post: TimelinePost; aspect: AspectRatio }) {
  return (
    <MediaOverlay
      post={post}
      aspect={aspect}
      badge={<CardBadge tone="breaking">Son Dakika</CardBadge>}
      showSummary
      titleClassName="text-[1.2rem] sm:text-2xl"
    />
  )
}

export function QuickReadSurface({ post }: { post: TimelinePost }) {
  const { href, label, time, reading } = useCardMeta(post)
  return (
    <Link href={href} className="exp-card exp-card--quick group">
      <div className="exp-card__chips">
        {label ? <CardBadge tone="muted">{label}</CardBadge> : null}
        <Bookmark className="ml-auto h-4 w-4 text-[rgb(var(--color-muted))] opacity-0 transition group-hover:opacity-100" />
      </div>
      <h3 className="exp-card__title exp-card__title--ink">{post.title}</h3>
      <div className="exp-card__meta-row mt-auto">
        {time ? <span>{time}</span> : null}
        <span>{reading ? `${reading} dk` : 'Hızlı oku'}</span>
      </div>
    </Link>
  )
}

/**
 * Editorial status labels only. Layout roles (magazine / gallery / photoStory)
 * must NEVER appear as badges — they were misread as category tags.
 */
export function editorialKicker(variant: CardVariant): string | undefined {
  switch (variant) {
    case 'recommended':
      return 'Editörün seçimi'
    case 'trending':
      return 'Trend'
    case 'popular':
      return 'Popüler'
    case 'podcast':
      return 'Dinle'
    default:
      return undefined
  }
}

/** @deprecated Use editorialKicker — kept briefly for any leftover imports. */
export const variantLabel = editorialKicker
