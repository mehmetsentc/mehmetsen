'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import {
  categoryPostHref,
  categoryPostImage,
  categoryPostSummary,
} from '@/components/home/desktop/categoryPostUtils'
import { cn } from '@/lib/utils'
import type { TimelinePost } from '@/types/post'

export function GridStory({ post, size = 'md' }: { post: TimelinePost; size?: 'md' | 'lg' | 'xl' }) {
  const href = categoryPostHref(post)
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const summary = categoryPostSummary(post)

  const aspect =
    size === 'xl' ? 'aspect-[16/10]' : size === 'lg' ? 'aspect-[16/10]' : 'aspect-video'
  const titleSize =
    size === 'xl' ? 'text-2xl md:text-3xl' : size === 'lg' ? 'text-xl' : 'text-base'

  return (
    <article className="min-w-0">
      <Link href={href} className="group block min-w-0">
        <div className={cn('relative mb-3 w-full overflow-hidden bg-[rgb(var(--color-border))]', aspect)}>
          <SafeNewsImage
            src={image}
            alt={post.title}
            fill
            sizes="(max-width: 1280px) 50vw, 300px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
        <h3
          className={cn(
            'break-words font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline',
            titleSize
          )}
        >
          {post.title}
        </h3>
        {summary ? (
          <p className="mt-2 line-clamp-3 break-words text-sm leading-relaxed text-[rgb(var(--color-muted))]">
            {summary}
          </p>
        ) : null}
      </Link>
    </article>
  )
}

export function StackedStory({ post }: { post: TimelinePost }) {
  const href = categoryPostHref(post)
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const summary = categoryPostSummary(post)

  return (
    <article className="border-b border-[rgb(var(--color-border))] pb-4 last:border-b-0 last:pb-0">
      <Link href={href} className="group flex gap-3">
        <div className="relative h-[72px] w-[108px] shrink-0 overflow-hidden bg-[rgb(var(--color-border))]">
          <SafeNewsImage
            src={image}
            alt={post.title}
            fill
            sizes="108px"
            className="object-cover transition-transform group-hover:scale-[1.02]"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-3 text-sm font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline">
            {post.title}
          </h3>
          {summary ? (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
              {summary}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  )
}
