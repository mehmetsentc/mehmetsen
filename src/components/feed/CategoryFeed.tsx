'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { useTimelineFeed } from '@/hooks/useTimelineFeed'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { TimelineItem } from './TimelineItem'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { rankFeedPosts } from '@/lib/feedRanking'
import { useAuth } from '@/hooks/useAuth'

interface CategoryFeedProps {
  categoryId: string
}

export function CategoryFeed({ categoryId }: CategoryFeedProps) {
  const { user } = useAuth()
  const { posts, loading, loadingMore, error, hasMore, loadMore, retry } = useTimelineFeed(
    categoryId,
    'nahaber',
    undefined,
  )

  const rankedPosts = useMemo(
    () =>
      rankFeedPosts(posts, {
        citySlug: user?.citySlug ?? null,
        favoriteCategories: user?.favoriteCategories,
        interests: user?.interests,
        followingUsernames: new Set(),
      }),
    [posts, user],
  )

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    loading: loadingMore,
  })

  if (error && !loading) {
    return (
      <div className="surface-card p-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
        <p className="text-sm text-[rgb(var(--color-muted))]">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white"
        >
          <RefreshCw className="h-4 w-4" />
          Tekrar dene
        </button>
      </div>
    )
  }

  if (!loading && rankedPosts.length === 0) {
    return (
      <div className="surface-card border-dashed py-16 text-center">
        <p className="text-lg font-semibold text-[rgb(var(--color-text))]">Haber bulunamadı</p>
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
          Bu kategoride henüz haber yok.
        </p>
        <Link
          href={ROUTES.FEED}
          className="mt-4 inline-flex rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Tüm haberlere dön
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="timeline-list">
        {loading && rankedPosts.length === 0 &&
          [...Array(4)].map((_, i) => <TimelineItemSkeleton key={`sk-${i}`} />)}

        {rankedPosts.map((post, i) => (
          <TimelineItem key={post.id} post={post} isLast={i === rankedPosts.length - 1} />
        ))}

        {loadingMore && <TimelineItemSkeleton key="sk-more" />}
      </div>

      <div ref={sentinelRef} className="h-1" aria-hidden />
    </div>
  )
}
