'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { useTimelineFeed } from '@/hooks/useTimelineFeed'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { useAppState } from '@/store/appStateContext'
import { getCache } from '@/lib/clientCache'
import { PAGE_CACHE_KEYS, PAGE_CACHE_TTL } from '@/lib/pageCache'
import { TimelineItem } from './TimelineItem'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { rankFeedPosts } from '@/lib/feedRanking'
import { useAuth } from '@/hooks/useAuth'
import type { TimelinePost } from '@/types/post'

const MAX_CACHED = 30

interface CategoryFeedProps {
  categoryId: string
}

export function CategoryFeed({ categoryId }: CategoryFeedProps) {
  const { user } = useAuth()
  const { setCachedFeed } = useAppState()
  const cacheKey = PAGE_CACHE_KEYS.category(categoryId)

  // Read cache SYNCHRONOUSLY on first render (in-memory Map — zero latency).
  // Passing as initialPosts triggers canUseServerSeed=true in the hook →
  // skips the initial Firestore fetch on cache hit, shows content instantly.
  // The live poll (30–60 s) still runs and prepends new posts with a toast.
  const [cachedPosts] = useState<TimelinePost[]>(
    () => getCache<TimelinePost[]>(cacheKey) ?? []
  )

  const { posts, loading, loadingMore, error, hasMore, loadMore, retry } = useTimelineFeed(
    categoryId,
    'nahaber',
    undefined,
    {
      initialPosts: cachedPosts,
      initialCategoryId: categoryId,
      initialFeedSource: 'nahaber',
    }
  )

  // Persist fresh posts to cache for next visit
  useEffect(() => {
    if (loading || posts.length === 0) return
    setCachedFeed(cacheKey, posts.slice(0, MAX_CACHED), PAGE_CACHE_TTL.category)
  }, [posts, loading, cacheKey, setCachedFeed])

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

  const showSkeleton = loading && rankedPosts.length === 0

  if (error && !loading && rankedPosts.length === 0) {
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

  return (
    <div className="timeline-list">
      {showSkeleton &&
        [...Array(4)].map((_, i) => <TimelineItemSkeleton key={`sk-${i}`} />)}

      {rankedPosts.map((post, i) => (
        <TimelineItem key={post.id} post={post} isLast={i === rankedPosts.length - 1} />
      ))}

      {!loading && rankedPosts.length === 0 && (
        <div className="surface-card border-dashed py-16 text-center">
          <p className="text-lg font-semibold text-[rgb(var(--color-text))]">Bu kategoride haber yok</p>
          <Link href={ROUTES.FEED} className="mt-3 inline-block text-sm font-semibold text-red-600 hover:underline">
            Gündeme dön
          </Link>
        </div>
      )}

      {loadingMore && <TimelineItemSkeleton key="sk-more" />}
      <div ref={sentinelRef} className="h-1" aria-hidden />
    </div>
  )
}
