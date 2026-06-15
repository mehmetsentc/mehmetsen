import Link from 'next/link'
import Image from 'next/image'
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'
import { formatTimelineTime } from '@/lib/timelineUtils'
import {
  FEED_FALLBACK_LOGO,
  getCategoryFallbackGradient,
  resolvePostThumbnail,
} from '@/lib/feedMediaUtils'
import { SliderImage } from '@/components/widgets/SliderImage'

interface FeedTimelineStaticProps {
  posts: Post[]
}

function detailHref(post: Post): string {
  if (post.slug && post.slug !== post.id) return ROUTES.NEWS_DETAIL(post.slug)
  return ROUTES.POST_DETAIL(post.id)
}

/** Server-rendered feed cards — visible before any client JS (slow mobile networks). */
export function FeedTimelineStatic({ posts }: FeedTimelineStaticProps) {
  if (posts.length === 0) return null

  return (
    <div className="timeline-list" id="feed-timeline-static">
      {posts.map((post, i) => {
        const thumbnail = resolvePostThumbnail(post)
        const fallbackGradient = getCategoryFallbackGradient(post.categoryId)
        const categoryLabel = getCategoryLabel(post.categoryId)
        const timeLabel = formatTimelineTime(post.publishedAt ?? post.createdAt)
        const href = detailHref(post)
        const isLast = i === posts.length - 1

        return (
          <article key={post.id} className="relative flex gap-3 px-3 py-0 sm:px-4">
            <div className="relative flex w-5 shrink-0 flex-col items-center">
              <div className="relative z-10 mt-3.5 h-3 w-3 shrink-0 rounded-full bg-[rgb(var(--color-brand))] ring-2 ring-[rgb(var(--color-surface))]" />
              {!isLast && <div className="timeline-connector mt-1 w-px flex-1" />}
            </div>

            <div className="min-w-0 flex-1 pb-4">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 pt-2.5">
                {timeLabel && (
                  <time
                    dateTime={post.publishedAt ?? post.createdAt}
                    className="text-xs font-bold text-[rgb(var(--color-brand))] tabular-nums"
                  >
                    {timeLabel}
                  </time>
                )}
              </div>

              <Link href={href} className="group block overflow-hidden rounded-2xl shadow-md">
                <div
                  className="relative w-full overflow-hidden rounded-2xl"
                  style={{ aspectRatio: '4/3' }}
                >
                  {thumbnail ? (
                    <SliderImage
                      src={thumbnail}
                      alt={post.title}
                      priority={false}
                      className="transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${fallbackGradient} 0%, #111827 100%)`,
                      }}
                    >
                      <Image
                        src={FEED_FALLBACK_LOGO}
                        alt=""
                        width={80}
                        height={80}
                        className="h-14 w-auto opacity-80 drop-shadow-lg"
                      />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />

                  {categoryLabel && (
                    <span className="absolute left-3 top-3 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                      {categoryLabel}
                    </span>
                  )}

                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h2 className="line-clamp-3 text-[1.05rem] font-black leading-tight tracking-tight text-white drop-shadow-lg sm:text-lg">
                      {post.title}
                    </h2>
                  </div>
                </div>
              </Link>
            </div>
          </article>
        )
      })}
    </div>
  )
}
