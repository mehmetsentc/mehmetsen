'use client'

import Link from 'next/link'
import { Play } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { hasVideoContent } from '@/lib/postUtils'
import { formatNewsRelative } from '@/components/home/desktop/formatNewsDate'
import {
  categoryPostHref,
  categoryPostImage,
  categoryPostSummary,
} from '@/components/home/desktop/categoryPostUtils'
import { cn } from '@/lib/utils'
import type { TimelinePost } from '@/types/post'

function postIso(post: TimelinePost): string {
  const raw = post.publishedAt ?? post.createdAt
  return typeof raw === 'number' ? new Date(raw).toISOString() : String(raw)
}

function CategoryBadge({ post }: { post: TimelinePost }) {
  const label = getCategoryLabel(post.categoryId)
  if (!label) return null
  return (
    <span className="inline-block text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
      {label}
    </span>
  )
}

function StoryMeta({ post, className }: { post: TimelinePost; className?: string }) {
  const time = formatNewsRelative(postIso(post))
  if (!time) return null
  return <p className={cn('text-xs text-[rgb(var(--color-muted))]', className)}>{time}</p>
}

const TITLE = {
  hero: 'font-serif text-2xl font-bold leading-tight md:text-3xl',
  lg: 'text-lg font-bold leading-snug',
  md: 'text-base font-bold leading-snug',
  sm: 'text-sm font-bold leading-snug',
} as const

function StoryLink({
  post,
  children,
  className,
}: {
  post: TimelinePost
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link href={categoryPostHref(post)} className={cn('group block min-w-0', className)}>
      {children}
    </Link>
  )
}

export function CategoryHeroStory({
  post,
  priority = false,
}: {
  post: TimelinePost
  priority?: boolean
}) {
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const summary = categoryPostSummary(post)
  const isVideo = hasVideoContent(post)

  return (
    <article className="min-w-0">
      <StoryLink post={post}>
        <div className="relative mb-4 aspect-[16/10] overflow-hidden bg-[rgb(var(--color-border))]">
          <SafeNewsImage
            src={image}
            alt={post.title}
            fill
            sizes="(max-width: 1024px) 100vw, 640px"
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.01]"
          />
          {isVideo ? (
            <span className="absolute bottom-3 left-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white">
              <Play className="h-4 w-4 fill-white" />
            </span>
          ) : null}
        </div>
        <CategoryBadge post={post} />
        <h3
          className={cn(
            TITLE.hero,
            'mt-2 break-words text-[rgb(var(--color-text))] group-hover:underline'
          )}
        >
          {post.title}
        </h3>
        {summary ? (
          <p className="mt-3 line-clamp-3 text-[15px] leading-relaxed text-[rgb(var(--color-muted))]">
            {summary}
          </p>
        ) : null}
        <StoryMeta post={post} className="mt-3" />
      </StoryLink>
    </article>
  )
}

/** BBC yan sütun — görsel + başlık */
export function CategoryFeatureStory({ post }: { post: TimelinePost }) {
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const summary = categoryPostSummary(post)

  return (
    <article className="min-w-0 border-b border-[rgb(var(--color-border))] py-4 last:border-b-0">
      <StoryLink post={post}>
        <div className="relative mb-3 aspect-[3/2] w-full overflow-hidden bg-[rgb(var(--color-border))]">
          <SafeNewsImage
            src={image}
            alt={post.title}
            fill
            sizes="(max-width: 1024px) 40vw, 280px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
        <CategoryBadge post={post} />
        <h3
          className={cn(
            TITLE.sm,
            'mt-1.5 break-words text-[rgb(var(--color-text))] group-hover:underline'
          )}
        >
          {post.title}
        </h3>
        {summary ? (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
            {summary}
          </p>
        ) : null}
        <StoryMeta post={post} className="mt-1.5" />
      </StoryLink>
    </article>
  )
}

/** BBC metin listesi — görsel yok */
export function CategoryTextStory({ post }: { post: TimelinePost }) {
  return (
    <article className="min-w-0 border-b border-[rgb(var(--color-border))] py-3 last:border-b-0">
      <StoryLink post={post}>
        <CategoryBadge post={post} />
        <h3
          className={cn(
            TITLE.sm,
            'mt-1 break-words text-[rgb(var(--color-text))] group-hover:underline'
          )}
        >
          {post.title}
        </h3>
        <StoryMeta post={post} className="mt-1.5" />
      </StoryLink>
    </article>
  )
}

/** BBC 4–5 sütun keşfet kartı */
export function CategoryGridStory({
  post,
  showSummary = false,
}: {
  post: TimelinePost
  showSummary?: boolean
}) {
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const summary = categoryPostSummary(post)

  return (
    <article className="min-w-0">
      <StoryLink post={post}>
        <div className="relative mb-3 aspect-[3/2] w-full overflow-hidden bg-[rgb(var(--color-border))]">
          <SafeNewsImage
            src={image}
            alt={post.title}
            fill
            sizes="(max-width: 1280px) 20vw, 220px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
        <CategoryBadge post={post} />
        <h3
          className={cn(
            TITLE.md,
            'mt-1.5 break-words text-[rgb(var(--color-text))] group-hover:underline'
          )}
        >
          {post.title}
        </h3>
        {showSummary && summary ? (
          <p className="mt-2 line-clamp-2 text-sm text-[rgb(var(--color-muted))]">{summary}</p>
        ) : null}
        <StoryMeta post={post} className="mt-2" />
      </StoryLink>
    </article>
  )
}
