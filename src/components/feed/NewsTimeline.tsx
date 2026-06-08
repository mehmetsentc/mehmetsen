'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, RefreshCw, Radio } from 'lucide-react'
import { getCityCategoryName } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { hasFeedGuestConsent } from '@/lib/feedConsent'
import { useAppState } from '@/store/appStateContext'
import type { FeedSource } from '@/lib/feedSource'
import type { TimelinePost } from '@/types/post'
import { useAuth } from '@/hooks/useAuth'
import { useRecentCities } from '@/hooks/useRecentCities'
import { useTimelineFeed } from '@/hooks/useTimelineFeed'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { TimelineItem } from './TimelineItem'
import { FeedFilters } from './FeedFilters'
import { FeedSourceTabs } from './FeedSourceTabs'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { rankFeedPosts, filterYerelHaberPosts, YEREL_HABER_CATEGORY } from '@/lib/feedRanking'
import { useUserLocation } from '@/hooks/useUserLocation'
import { slugifyCity } from '@/lib/location'

interface NewsTimelineContentProps {
  categoryParam: string | null
}

const MAX_CACHED_TIMELINE = 30

function timelineCacheKey(feedSource: FeedSource, categoryId: string | null): string {
  return `timeline:${feedSource}:${categoryId ?? 'all'}`
}

function NewsTimelineContent({ categoryParam }: NewsTimelineContentProps) {
const { user, loading: authLoading } = useAuth()
  const { getCachedFeed, setCachedFeed } = useAppState()
  const [categoryId, setCategoryId] = useState<string | null>(categoryParam)
  const [feedSource, setFeedSource] = useState<FeedSource>('nahaber')
  const [guestConsentReady, setGuestConsentReady] = useState(false)

  useEffect(() => {
    setCategoryId(categoryParam)
  }, [categoryParam])

  useEffect(() => {
    if (authLoading) return
    if (user) { setGuestConsentReady(true); return }
    setGuestConsentReady(hasFeedGuestConsent())
  }, [user, authLoading])

  // Re-check consent when it changes (ConsentStrip sets it)
  useEffect(() => {
    const handler = () => setGuestConsentReady(hasFeedGuestConsent())
    window.addEventListener('feedConsentGranted', handler)
    return () => window.removeEventListener('feedConsentGranted', handler)
  }, [])

  const canViewFeed = Boolean(user) || guestConsentReady

  const { citySlug: detectedCitySlug, cityName: detectedCityName } = useUserLocation()

  const { cities, loading: citiesLoading, refresh: refreshCities } = useRecentCities()
  const { posts, loading, loadingMore, error, hasMore, loadMore, retry } = useTimelineFeed(
    categoryId ?? undefined,
    feedSource,
    detectedCitySlug
  )

  // Component-level stale-while-revalidate cache (the hook is owned elsewhere):
  // seed instantly from cache while the hook fetches, and write fresh results
  // back so the next visit is instant.
  const [seededPosts, setSeededPosts] = useState<TimelinePost[]>([])

  useEffect(() => {
    const cached = getCachedFeed<TimelinePost[]>(timelineCacheKey(feedSource, categoryId))
    setSeededPosts(cached ?? [])
  }, [feedSource, categoryId, getCachedFeed])

  useEffect(() => {
    if (loading || posts.length === 0) return
    setCachedFeed<TimelinePost[]>(
      timelineCacheKey(feedSource, categoryId),
      posts.slice(0, MAX_CACHED_TIMELINE)
    )
  }, [posts, loading, feedSource, categoryId, setCachedFeed])

  // Prefer live posts; fall back to the cached snapshot until they arrive.
  const rawPosts = posts.length > 0 ? posts : seededPosts

  const filteredPosts = useMemo(() => {
    if (categoryId === YEREL_HABER_CATEGORY) {
      return filterYerelHaberPosts(rawPosts, detectedCitySlug)
    }
    return rawPosts
  }, [rawPosts, categoryId, detectedCitySlug])

  const rankedPosts = useMemo(() => {
    const profileCity =
      user?.location ? slugifyCity(user.location) : user?.citySlug ?? null
    const citySlug = profileCity ?? detectedCitySlug
    return rankFeedPosts(filteredPosts, {
      citySlug,
      favoriteCategories: user?.favoriteCategories,
      interests: user?.interests,
      followingUsernames: new Set(
        filteredPosts.filter((p) => p.isFromFollowing).map((p) => p.authorUsername.toLowerCase())
      ),
    })
  }, [
    filteredPosts,
    user?.location,
    user?.citySlug,
    detectedCitySlug,
    user?.favoriteCategories,
    user?.interests,
  ])

  useEffect(() => {
    if (!loading && canViewFeed) void refreshCities()
  }, [loading, categoryId, feedSource, canViewFeed, refreshCities])

  const citySlug = categoryId?.startsWith('city:') ? categoryId.slice(5) : null
  const cityLabel = citySlug ? getCityCategoryName(citySlug) : null
  const showLocalHeader = !categoryId && detectedCitySlug
  const localHeaderLabel = showLocalHeader
    ? `${detectedCityName} — Yerel haberler`
    : null
  const leadPost = citySlug && rankedPosts.length > 0 ? rankedPosts[0] : null
  const relatedPosts =
    citySlug && rankedPosts.length > 1
      ? rankedPosts.slice(1)
      : citySlug
        ? []
        : rankedPosts

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore: canViewFeed && hasMore,
    loading: loadingMore,
  })

  const showEmpty = canViewFeed && !loading && !error && rankedPosts.length === 0
  // Show items as soon as we have anything (cached seed or live posts), even
  // while the hook is still loading, to avoid a spinner on re-entry.
  const showItems = canViewFeed && rankedPosts.length > 0
  const showSkeleton = canViewFeed && loading && rankedPosts.length === 0


  const emptyMessage =
    feedSource === 'nahaber'
      ? 'Henüz NaHaber editoryal haberi yok'
      : 'Henüz kullanıcı paylaşımı yok'

  return (
    <div className="w-full">
      <header className="timeline-header mb-0 py-3">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white">
            <Radio className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-lg font-black tracking-tight text-[rgb(var(--color-text))]">Son Dakika</h1>
            <p className="page-subtitle text-xs">
              {localHeaderLabel ?? 'Haber · Video · Fotoğraf · Gönderi'}
            </p>
          </div>
        </div>

        <FeedSourceTabs value={feedSource} onChange={setFeedSource} />

        <div className="mt-3">
          <FeedFilters
            selected={categoryId}
            onChange={setCategoryId}
            cities={cities}
            citiesLoading={citiesLoading}
          />
        </div>
      </header>

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
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">{emptyMessage}</p>
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
        {showSkeleton &&
          [...Array(4)].map((_, i) => <TimelineItemSkeleton key={`sk-${i}`} />)}

        {showItems && citySlug && leadPost && (
          <>
            <TimelineItem key={leadPost.id} post={leadPost} featured showConnector={relatedPosts.length > 0} />
            {relatedPosts.length > 0 && (
              <div className="timeline-related-heading px-1 py-2">
                <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                  {cityLabel} · İlgili haberler
                </p>
              </div>
            )}
            {relatedPosts.map((post, index) => (
              <TimelineItem
                key={post.id}
                post={post}
                showConnector={index < relatedPosts.length - 1}
              />
            ))}
          </>
        )}

        {showItems &&
          !citySlug &&
          rankedPosts.map((post, index) => (
            <TimelineItem
              key={post.id}
              post={post}
              showConnector={index < rankedPosts.length - 1}
            />
          ))}

        {canViewFeed && loadingMore && <TimelineItemSkeleton key="sk-more" />}
      </div>

      <div ref={sentinelRef} className="h-1" aria-hidden />
    </div>
  )
}

function NewsTimelineWithSearchParams() {
  const searchParams = useSearchParams()
  const categoryParam = searchParams.get('category')

  return <NewsTimelineContent categoryParam={categoryParam} />
}

export function NewsTimeline() {
  return <NewsTimelineWithSearchParams />
}
