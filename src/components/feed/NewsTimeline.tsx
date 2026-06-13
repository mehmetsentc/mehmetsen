'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { getCityCategoryName } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { hasFeedGuestConsent } from '@/lib/feedConsent'
import { useAppState } from '@/store/appStateContext'
import { getCache } from '@/lib/clientCache'
import { useFeedStore } from '@/store/feedStore'
import { CACHE_KEYS } from '@/lib/stateKeys'
import type { TimelinePost } from '@/types/post'
import { useAuth } from '@/hooks/useAuth'
import { useRecentCities } from '@/hooks/useRecentCities'
import { useTimelineFeed } from '@/hooks/useTimelineFeed'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { TimelineItem } from './TimelineItem'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { rankFeedPosts, filterYerelHaberPosts, YEREL_HABER_CATEGORY } from '@/lib/feedRanking'
import { useUserLocation } from '@/hooks/useUserLocation'
import { slugifyCity } from '@/lib/location'

interface NewsTimelineContentProps {
  categoryParam: string | null
  initialPosts?: TimelinePost[]
  initialCategoryId?: string
}

const MAX_CACHED_TIMELINE = 30

function NewsTimelineContent({
  categoryParam,
  initialPosts,
  initialCategoryId,
}: NewsTimelineContentProps) {
  const { user, loading: authLoading } = useAuth()
  const { setCachedFeed } = useAppState()
  const feedSource = useFeedStore((s) => s.feedSource)
  const setLastCategoryId = useFeedStore((s) => s.setLastCategoryId)
  const [categoryId, setCategoryId] = useState<string | null>(categoryParam)

  useEffect(() => { setCategoryId(categoryParam) }, [categoryParam])

  useEffect(() => {
    setLastCategoryId(categoryId)
  }, [categoryId, setLastCategoryId])

  // Misafirler her zaman haberleri görebilir — onay engeli kaldırıldı.
  const canViewFeed = true

  const { citySlug: detectedCitySlug, cityName: detectedCityName } = useUserLocation()
  const { cities, loading: citiesLoading, refresh: refreshCities } = useRecentCities()

  const { posts, loading, loadingMore, error, hasMore, loadMore, retry } = useTimelineFeed(
    categoryId ?? undefined,
    feedSource,
    detectedCitySlug,
    { initialPosts, initialCategoryId, initialFeedSource: 'nahaber' }
  )

  // Read cache SYNCHRONOUSLY — updates instantly when categoryId changes.
  // This seeds the feed while the Firestore fetch runs in the background,
  // eliminating the skeleton flash when switching categories.
  const seededPosts = useMemo(
    () => getCache<TimelinePost[]>(CACHE_KEYS.timeline(categoryId)) ?? [],
    [categoryId]
  )

  useEffect(() => {
    if (loading || posts.length === 0) return
    setCachedFeed<TimelinePost[]>(CACHE_KEYS.timeline(categoryId), posts.slice(0, MAX_CACHED_TIMELINE))
  }, [posts, loading, categoryId, setCachedFeed])

  const rawPosts = posts.length > 0 ? posts : seededPosts

  const filteredPosts = useMemo(() => {
    if (categoryId === YEREL_HABER_CATEGORY) return filterYerelHaberPosts(rawPosts, detectedCitySlug)
    return rawPosts
  }, [rawPosts, categoryId, detectedCitySlug])

  const rankedPosts = useMemo(() => {
    const profileCity = user?.location ? slugifyCity(user.location) : user?.citySlug ?? null
    const citySlug = profileCity ?? detectedCitySlug
    return rankFeedPosts(filteredPosts, {
      citySlug,
      favoriteCategories: user?.favoriteCategories,
      interests: user?.interests,
      followingUsernames: new Set(
        filteredPosts.filter((p) => p.isFromFollowing).map((p) => p.authorUsername.toLowerCase())
      ),
    })
  }, [filteredPosts, user?.location, user?.citySlug, detectedCitySlug, user?.favoriteCategories, user?.interests])

  useEffect(() => {
    if (!loading && canViewFeed) void refreshCities()
  }, [loading, categoryId, canViewFeed, refreshCities])

  const citySlug = categoryId?.startsWith('city:') ? categoryId.slice(5) : null
  const cityLabel = citySlug ? getCityCategoryName(citySlug) : null
  const leadPost = citySlug && rankedPosts.length > 0 ? rankedPosts[0] : null
  const relatedPosts =
    citySlug && rankedPosts.length > 1 ? rankedPosts.slice(1) : citySlug ? [] : rankedPosts

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore: canViewFeed && hasMore,
    loading: loadingMore,
  })

  const showEmpty = canViewFeed && !loading && !error && rankedPosts.length === 0
  const showItems = canViewFeed && rankedPosts.length > 0
  const showSkeleton = canViewFeed && loading && rankedPosts.length === 0

  return (
    <div className="w-full">
      {!canViewFeed && !authLoading && (
        <div className="surface-card border-dashed py-16 text-center">
          <p className="text-lg font-semibold text-[rgb(var(--color-text))]">Akışı görüntülemek için onay gerekli</p>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            İçerik kurallarını okuyup kabul etmeniz gerekiyor.
          </p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('openFeedPolicy'))}
            className="mt-4 inline-flex rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Kuralları göster
          </button>
        </div>
      )}

      {canViewFeed && error && !loading && (
        <div className="mb-4 surface-card p-8 text-center">
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
      )}

      {showEmpty && (
        <div className="surface-card border-dashed py-16 text-center">
          <p className="text-lg font-semibold text-[rgb(var(--color-text))]">Akış boş</p>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">Henüz NaHaber editoryal haberi yok</p>
          {!user && (
            <p className="mt-4 text-sm text-[rgb(var(--color-muted))]">
              Paylaşım yapmak için{' '}
              <Link href={ROUTES.REGISTER} className="font-semibold text-red-600 hover:underline">
                kayıt olun
              </Link>
              .
            </p>
          )}
        </div>
      )}

      <div className="timeline-list">
        {showSkeleton && [...Array(4)].map((_, i) => <TimelineItemSkeleton key={`sk-${i}`} />)}

        {showItems && citySlug && leadPost && (
          <>
            <TimelineItem key={leadPost.id} post={leadPost} featured />
            {relatedPosts.length > 0 && (
              <div className="timeline-related-heading px-1 py-2">
                <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                  {cityLabel} · İlgili haberler
                </p>
              </div>
            )}
            {relatedPosts.map((post) => (
              <TimelineItem key={post.id} post={post} />
            ))}
          </>
        )}

        {showItems && !citySlug && rankedPosts.map((post, i) => (
          <TimelineItem key={post.id} post={post} isLast={i === rankedPosts.length - 1} />
        ))}

        {canViewFeed && loadingMore && <TimelineItemSkeleton key="sk-more" />}
      </div>

      <div ref={sentinelRef} className="h-1" aria-hidden />
    </div>
  )
}

function NewsTimelineWithSearchParams({
  defaultCategory,
  initialPosts,
  initialCategoryId,
}: {
  defaultCategory?: string
  initialPosts?: TimelinePost[]
  initialCategoryId?: string
}) {
  const searchParams = useSearchParams()
  const categoryParam = searchParams.get('category') ?? defaultCategory ?? null
  return (
    <NewsTimelineContent
      categoryParam={categoryParam}
      initialPosts={initialPosts}
      initialCategoryId={initialCategoryId}
    />
  )
}

export function NewsTimeline({
  defaultCategory,
  initialPosts,
  initialCategoryId,
}: {
  defaultCategory?: string
  initialPosts?: TimelinePost[]
  initialCategoryId?: string
} = {}) {
  return (
    <NewsTimelineWithSearchParams
      defaultCategory={defaultCategory}
      initialPosts={initialPosts}
      initialCategoryId={initialCategoryId}
    />
  )
}
