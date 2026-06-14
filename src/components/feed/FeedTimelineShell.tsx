import Link from 'next/link'
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { formatTimelineTime } from '@/lib/timelineUtils'
import { resolvePostThumbnail } from '@/lib/feedMediaUtils'
import { SliderImage } from '@/components/widgets/SliderImage'

interface FeedTimelineShellProps {
  posts: Post[]
  maxItems?: number
}

/** Server-rendered timeline preview — visible before client JS (FCP). */
export function FeedTimelineShell({ posts, maxItems = 4 }: FeedTimelineShellProps) {
  const items = posts.slice(0, maxItems)
  if (items.length === 0) return null

  return (
    <div id="feed-timeline-static" className="timeline-list w-full" aria-label="Gündem haberleri">
      {items.map((post, i) => {
        const href =
          post.slug && post.slug !== post.id
            ? ROUTES.NEWS_DETAIL(post.slug)
            : ROUTES.POST_DETAIL(post.id)
        const thumb = resolvePostThumbnail(post)
        const timeLabel = formatTimelineTime(post.publishedAt ?? post.createdAt)

        return (
          <article key={post.id} className="relative flex gap-3 px-3 py-0 sm:px-4">
            <div className="relative flex w-5 shrink-0 flex-col items-center">
              <div className="relative z-10 mt-3.5 h-3 w-3 shrink-0 rounded-full bg-[rgb(var(--color-brand))] ring-2 ring-[rgb(var(--color-surface))]" />
              {i < items.length - 1 && <div className="timeline-connector mt-1 w-px flex-1" />}
            </div>
            <div className="min-w-0 flex-1 pb-4">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 pt-2.5">
                {timeLabel ? (
                  <time
                    dateTime={post.publishedAt ?? post.createdAt}
                    className="text-xs font-bold text-[rgb(var(--color-brand))] tabular-nums"
                  >
                    {timeLabel}
                  </time>
                ) : null}
              </div>
              <Link href={href} className="surface-card block overflow-hidden">
                {thumb ? (
                  <div className="relative aspect-[16/9] w-full">
                    <SliderImage src={thumb} alt={post.title} />
                  </div>
                ) : null}
                <div className="px-4 py-3">
                  <h3 className="line-clamp-3 text-[15px] font-bold leading-snug text-[rgb(var(--color-text))]">
                    {post.title}
                  </h3>
                  {post.feedTeaser ? (
                    <p className="mt-1.5 line-clamp-2 text-sm text-[rgb(var(--color-muted))]">
                      {post.feedTeaser}
                    </p>
                  ) : null}
                </div>
              </Link>
            </div>
          </article>
        )
      })}
    </div>
  )
}
