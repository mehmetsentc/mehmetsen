'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { postService } from '@/services/postService'
import { likeService } from '@/services/likeService'
import { saveService } from '@/services/saveService'
import { useAuth } from '@/hooks/useAuth'
import { sortByEngagement } from '@/lib/engagementScore'
import { hasVideoContent } from '@/lib/postUtils'
import { CACHE_TTL } from '@/lib/clientCache'
import { CACHE_KEYS } from '@/lib/stateKeys'
import { useAppState } from '@/store/appStateContext'
import { getSeenPostIds } from '@/lib/reelsSeen'
import { type ReelsFeedTab, isCategoryTab } from '@/components/video/ReelsFeedTabs'
import type { Post } from '@/types/post'

export interface VideoFeedItem extends Post {
  isLiked?: boolean
  isSaved?: boolean
}

const FEED_LOAD_TIMEOUT_MS = 15_000
// Cap how many items we persist so we stay well under storage quotas.
const MAX_CACHED_VIDEOS = 20
// When every loaded video is already seen, auto-fetch more pages to find fresh content.
const MAX_AUTO_FETCH_ALL_SEEN = 5

function partitionBySeen<T extends Post>(posts: T[], uid?: string | null): T[] {
  const seen = getSeenPostIds(uid)
  const unseen: T[] = []
  const seenPosts: T[] = []

  for (const post of posts) {
    if (seen.has(post.id)) {
      seenPosts.push(post)
    } else {
      unseen.push(post)
    }
  }

  return [...sortByEngagement(unseen), ...sortByEngagement(seenPosts)]
}

function dedupePostsById<T extends Post>(posts: T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const post of posts) {
    if (seen.has(post.id)) continue
    seen.add(post.id)
    result.push(post)
  }
  return result
}

export function useVideoFeed(targetVideoId?: string | null, feedMode: ReelsFeedTab = 'for-you') {
  const { user, loading: authLoading } = useAuth()
  const { getCachedFeed, setCachedFeed } = useAppState()
  const [videos, setVideos] = useState<VideoFeedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [targetIndex, setTargetIndex] = useState<number | null>(null)
  const [resolvingTarget, setResolvingTarget] = useState(Boolean(targetVideoId))

  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null)
  const fetchIdRef = useRef(0)
  const isFetchingRef = useRef(false)
  const hasFetchedRef = useRef(false)
  const resolveInFlightRef = useRef(false)
  const seededFromCacheRef = useRef(false)
  const autoFetchAllSeenRef = useRef(0)
  const feedModeRef = useRef(feedMode)
  const userIdRef = useRef(user?.uid)

  feedModeRef.current = feedMode
  userIdRef.current = user?.uid

  const enrichWithUserState = useCallback(
    async (posts: Post[]): Promise<VideoFeedItem[]> => {
      if (!user?.uid || posts.length === 0) {
        return posts
      }

      const ids = posts.map((p) => p.id)
      try {
        const [likedMap, savedMap] = await Promise.all([
          likeService.getLikedStatus(user.uid, ids),
          saveService.getSavedStatus(user.uid, ids),
        ])
        return posts.map((p) => ({
          ...p,
          isLiked: likedMap[p.id] ?? false,
          isSaved: savedMap[p.id] ?? false,
        }))
      } catch (enrichError) {
        console.warn('[useVideoFeed] enrichment failed, returning posts without state:', enrichError)
        return posts
      }
    },
    [user?.uid]
  )

  const fetchVideos = useCallback(
    async (reset = false) => {
      if (isFetchingRef.current) {
        return
      }

      const mode = feedModeRef.current
      const userId = userIdRef.current

      if (mode === 'following' && !userId) {
        if (reset) {
          setVideos([])
          setHasMore(false)
          setError(null)
          setLoading(false)
          setLoadingMore(false)
          hasFetchedRef.current = true
        }
        return
      }

      const fetchId = ++fetchIdRef.current
      isFetchingRef.current = true

      if (reset) {
        lastDocRef.current = null
        autoFetchAllSeenRef.current = 0
        setLoading(true)
        setError(null)
      } else {
        setLoadingMore(true)
      }

      try {
        const cursor = reset ? undefined : (lastDocRef.current ?? undefined)
        const result =
          mode === 'following' && userId
            ? await postService.getFollowingVideoFeed(userId, cursor)
            : isCategoryTab(mode)
              ? await postService.getVideoFeedByCategory(mode, cursor)
              : await postService.getVideoFeed(cursor)

        if (fetchId !== fetchIdRef.current) return

        const enriched = await enrichWithUserState(result.posts)
        if (fetchId !== fetchIdRef.current) return

        lastDocRef.current = result.lastDoc
        setVideos((prev) => {
          const merged = reset ? enriched : dedupePostsById([...prev, ...enriched])
          const next = partitionBySeen(merged, userId)
          // Persist the head of the (revalidated) feed for instant re-entry.
          setCachedFeed(
            CACHE_KEYS.videoFeed(mode, userId),
            next.slice(0, MAX_CACHED_VIDEOS),
            CACHE_TTL.LONG
          )
          return next
        })
        setHasMore(result.hasMore)
        hasFetchedRef.current = true
      } catch (fetchError) {
        if (fetchId !== fetchIdRef.current) return

        const message =
          fetchError instanceof Error ? fetchError.message : 'Video akışı yüklenemedi'
        console.error('[useVideoFeed] fetch failed:', fetchError)
        hasFetchedRef.current = true

        // If we already painted cached videos (SWR), keep them visible and
        // swallow the background revalidation error instead of showing a
        // full-screen error panel.
        if (reset && seededFromCacheRef.current) {
          return
        }

        setError(message)
        setHasMore(false)

        if (reset) {
          setVideos([])
        }
      } finally {
        if (fetchId === fetchIdRef.current) {
          isFetchingRef.current = false
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [enrichWithUserState, setCachedFeed]
  )

  const fetchVideosRef = useRef(fetchVideos)
  fetchVideosRef.current = fetchVideos

  useEffect(() => {
    hasFetchedRef.current = false
    setActiveIndex(0)
    setHasMore(true)
    setError(null)
    setTargetIndex(null)
    if (!targetVideoId) setResolvingTarget(false)

    if (feedMode === 'following' && authLoading) return

    // Stale-while-revalidate: hydrate instantly from cache (no spinner), then
    // fetch fresh in the background. Skip seeding when targeting a deep-linked
    // video so the resolve flow can run unobstructed.
    const cached = !targetVideoId
      ? getCachedFeed<VideoFeedItem[]>(CACHE_KEYS.videoFeed(feedMode, user?.uid))
      : null
    if (cached && cached.length > 0) {
      setVideos(partitionBySeen(cached, user?.uid))
      hasFetchedRef.current = true
      seededFromCacheRef.current = true
    } else {
      setVideos([])
      seededFromCacheRef.current = false
    }

    fetchVideosRef.current(true)
  }, [feedMode, user?.uid, authLoading, targetVideoId, getCachedFeed])

  useEffect(() => {
    if (authLoading || !user?.uid || videos.length === 0) return
    enrichWithUserState(videos).then((enriched) =>
      setVideos(partitionBySeen(enriched, user.uid))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, authLoading])

  const seededFromCacheExposedRef = useRef(false)
  seededFromCacheExposedRef.current = seededFromCacheRef.current

  useEffect(() => {
    if (!loading) return

    const timeout = setTimeout(() => {
      isFetchingRef.current = false
      setLoading(false)
      setLoadingMore(false)
      hasFetchedRef.current = true
      setResolvingTarget(false)
      // Cache'den yüklenen içerik varsa hata gösterme — SWR background refresh failed silently
      if (!seededFromCacheExposedRef.current) {
        setError('Video akışı yüklenemedi (zaman aşımı). Lütfen tekrar deneyin.')
      }
    }, FEED_LOAD_TIMEOUT_MS)

    return () => clearTimeout(timeout)
  }, [loading])

  useEffect(() => {
    if (targetVideoId) {
      setResolvingTarget(true)
      setTargetIndex(null)
      resolveInFlightRef.current = false
    } else {
      setResolvingTarget(false)
      setTargetIndex(null)
    }
  }, [targetVideoId])

  const mergeVideoById = useCallback(
    async (videoId: string): Promise<number> => {
      const post = await postService.getNewsById(videoId)
      if (!post || !hasVideoContent(post)) return -1

      const [enriched] = await enrichWithUserState([post])
      let mergedIndex = -1

      setVideos((prev) => {
        const existing = prev.findIndex((v) => v.id === videoId)
        if (existing >= 0) {
          mergedIndex = existing
          return prev
        }
        const next = partitionBySeen(dedupePostsById([...prev, enriched]), userIdRef.current)
        mergedIndex = next.findIndex((v) => v.id === videoId)
        return next
      })

      return mergedIndex
    },
    [enrichWithUserState]
  )

  useEffect(() => {
    if (!targetVideoId || !resolvingTarget || loading) return

    const index = videos.findIndex((v) => v.id === targetVideoId)
    if (index >= 0) {
      setActiveIndex(index)
      setTargetIndex(index)
      setResolvingTarget(false)
      return
    }

    if (resolveInFlightRef.current || loadingMore) return

    if (hasMore) {
      resolveInFlightRef.current = true
      fetchVideos(false).finally(() => {
        resolveInFlightRef.current = false
      })
      return
    }

    resolveInFlightRef.current = true
    mergeVideoById(targetVideoId)
      .then((mergedIndex) => {
        if (mergedIndex >= 0) {
          setActiveIndex(mergedIndex)
          setTargetIndex(mergedIndex)
        }
      })
      .finally(() => {
        resolveInFlightRef.current = false
        setResolvingTarget(false)
      })
  }, [
    targetVideoId,
    resolvingTarget,
    loading,
    loadingMore,
    hasMore,
    videos,
    fetchVideos,
    mergeVideoById,
  ])

  const loadMore = useCallback(() => {
    if (!loading && !loadingMore && hasMore && !isFetchingRef.current) {
      fetchVideos(false)
    }
  }, [loading, loadingMore, hasMore, fetchVideos])

  const updateVideo = useCallback((postId: string, patch: Partial<VideoFeedItem>) => {
    // partitionBySeen ÇAĞIRILMAZ — sıralama değişirse scroll pozisyonu yanlış
    // video gösterir (farklı videonun başlığı görünür). Sadece ilgili öğeyi güncelle.
    setVideos((prev) =>
      prev.map((v) => (v.id === postId ? { ...v, ...patch } : v))
    )
  }, [])

  // If every loaded video is already seen, keep fetching until we find unseen
  // content or hit the auto-fetch cap (feed still shows seen videos as fallback).
  useEffect(() => {
    if (loading || loadingMore || !hasMore || isFetchingRef.current) return
    if (videos.length === 0) return

    const seen = getSeenPostIds(user?.uid)
    const allSeen = videos.every((v) => seen.has(v.id))
    if (!allSeen) {
      autoFetchAllSeenRef.current = 0
      return
    }

    if (autoFetchAllSeenRef.current >= MAX_AUTO_FETCH_ALL_SEEN) return

    autoFetchAllSeenRef.current += 1
    fetchVideosRef.current(false)
  }, [videos, hasMore, loading, loadingMore, user?.uid])

  const retry = useCallback(() => {
    hasFetchedRef.current = false
    if (targetVideoId) setResolvingTarget(true)
    fetchVideos(true)
  }, [fetchVideos, targetVideoId])

  return {
    videos,
    loading: loading && !hasFetchedRef.current,
    loadingMore,
    error,
    hasMore,
    activeIndex,
    setActiveIndex,
    targetIndex,
    resolvingTarget,
    loadMore,
    updateVideo,
    retry,
  }
}
