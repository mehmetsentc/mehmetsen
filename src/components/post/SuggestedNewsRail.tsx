'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { ChevronRight } from 'lucide-react'
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { getPrimaryVideo, getPostDetailHref } from '@/lib/postUtils'
import { formatTimelineTime, getPostTypeLabel } from '@/lib/timelineUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import {
  useNetworkTier,
  imageQualityForTier,
} from '@/store/networkContext'

interface SuggestedNewsRailProps {
  posts: Post[]
  /** Prefer canonical `/haber/[slug]` links for news articles. */
  preferSlugLinks?: boolean
  /** Hide built-in “Önerilen Haberler” heading when parent supplies one. */
  hideHeader?: boolean
}

function suggestedNewsHref(post: Post, _preferSlugLinks: boolean): string {
  return getPostDetailHref(post)
}

export function SuggestedNewsRail({
  posts,
  preferSlugLinks = false,
  hideHeader = false,
}: SuggestedNewsRailProps) {
  const tier = useNetworkTier()
  if (posts.length === 0) return null

  return (
    <section
      className={
        hideHeader
          ? 'mt-0'
          : 'mt-8 border-t border-gray-100 pt-6 dark:border-gray-800'
      }
    >
      {hideHeader ? null : (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Önerilen Haberler</h2>
          <Link
            href={ROUTES.FEED}
            className="flex items-center gap-0.5 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Tümü
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div className="hide-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
        {posts.map((post) => {
          const href = suggestedNewsHref(post, preferSlugLinks)
          const imageUrl =
            post.coverImageUrl ||
            getPrimaryVideo(post)?.thumbnailUrl ||
            post.mediaItems?.find((m) => m.type === 'image')?.url ||
            null
          const timeLabel = formatTimelineTime(post.publishedAt)

          return (
            <Link
              key={post.id}
              href={href}
              className="group w-56 shrink-0 snap-start overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-gray-100 dark:bg-gray-800">
                {imageUrl ? (
                  <SafeNewsImage
                    src={imageUrl}
                    alt=""
                    fill
                    loading="lazy"
                    quality={imageQualityForTier(tier)}
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="224px"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-3 text-center text-xs text-gray-400">
                    {post.title.slice(0, 40)}
                  </div>
                )}
                <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  {getPostTypeLabel(post.postType)}
                </span>
              </div>
              <div className="p-3">
                {post.categoryId && (
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                    {getCategoryLabel(post.categoryId)}
                  </p>
                )}
                <h3 className="line-clamp-2 text-sm font-bold leading-snug text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
                  {post.title}
                </h3>
                {timeLabel && (
                  <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                    {timeLabel}
                  </p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
