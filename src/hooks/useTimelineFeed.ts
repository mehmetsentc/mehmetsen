'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { annotateTimelinePosts } from '@/lib/newsMapper'
import { isFirestoreInternalError } from '@/lib/firestoreQueue'
import {
  FEED_BREAKING_POLL_MS,
  FEED_LIVE_DEFER_MS,
  FEED_LIVE_POLL_MS,
  notifyFeedUpdated,
} from '@/lib/feedLiveToast'
import type { FeedSource } from '@/lib/feedSource'
import { resolveLocalNewsCitySlug } from '@/constants/cities'
import { YEREL_HABER_CATEGORY } from '@/lib/feedRanking'
import { useAuth } from '@/hooks/useAuth'
import type { TimelinePost } from '@/types/post'

let postServiceModule: Promise<typeof import('@/services/postService')> | null = null
function loadPostService() {
  postServiceModule ??= import('@/services/postService')
  return postServiceModule.then((m) => m.postService)
}

function toFeedError(error: unknown): string {
  if (isFirestoreInternalError(error)) {
    return 'Bağlantı hatası oluştu. Lütfen tekrar deneyin.'
  }
  return error instanceof Error ? error.message : 'Akış yüklenemedi'
}

function postTimestamp(post: TimelinePost): number {
  const raw = post.publishedAt ?? post.createdAt
  const ms = typeof raw === 'string' ? Date.parse(raw) : Number(raw)
  return Number.isFinite(ms) ? ms : 0
}

function toTimelineOptions(
  categoryId: string | undefined,
  feedSource: FeedSource,
  userCitySlug?: string | null
) {
  if (categoryId === YEREL_HABER_CATEGORY) {
    const preferred = userCitySlug?.trim()
      ? resolveLocalNewsCitySlug(userCitySlug.trim())
      : undefined
    return {
      categoryId: YEREL_HABER_CATEGORY,
      preferredCitySlug: preferred,
      feedSource,
    }
  }

  return {
    ...(categoryId?.startsWith('city:')
      ? { citySlug: categoryId.slice(5) }
      : categoryId
        ? { categoryId }
        : {}),
    feedSource,
  }
}

export function useTimelineFeed(
  categoryId?: string,
  feedSource: FeedSource = 'nahaber',
  userCitySlug?: string | null,
  options?: {
    initialPosts?: TimelinePost[]
    initialCategoryId?: string
    initialFeedSource?: FeedSource
  }
) {
  const { user } = useAuth()
  const canUseServerSeed =
    Boolean(options?.initialPosts?.length) &&
    categoryId === options?.initialCategoryId &&
    feedSource === (options?.initialFeedSource ?? 'nahaber')

  const [posts, setPosts] = useState<TimelinePost[]>(
    canUseServerSeed ? options!.initialPosts! : []
  )
  const [loading, setLoading] = useState(!canUseServerSeed)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null)
  const followingRef = useRef<Set<string>>(new Set())
  const categoryRef = useRef(categoryId)
  const feedSourceRef = useRef(feedSource)
  const userCityRef = useRef(userCitySlug)
  const userIdRef = useRef(user?.uid)
  const retryOnceRef = useRef(false)
  const initialLoadDoneRef = useRef(canUseServerSeed)
  const newestSeenAtRef = useRef(
    canUseServerSeed
      ? Math.max(...options!.initialPosts!.map(postTimestamp), 0)
      : 0
  )
  const liveReadyRef = useRef(false)
  const skipInitialFetchRef = useRef(canUseServerSeed)

  categoryRef.current = categoryId
  feedSourceRef.current = feedSource
  userCityRef.current = userCitySlug
  userIdRef.current = user?.uid

  const loadFollowing = useCallback(async (uid: string) => {
    try {
      const { followService } = await import('@/services/followService')
      const following = await followService.getFollowingUsernames(uid)
      followingRef.current = following
      setPosts((prev) => annotateTimelinePosts(prev, following))
    } catch {
      followingRef.current = new Set()
    }
  }, [])

  const prependLivePosts = useCallback(
    (incoming: TimelinePost[], options?: { notify?: boolean }) => {
      if (!initialLoadDoneRef.current || incoming.length === 0) return

      const annotated = annotateTimelinePosts(incoming, followingRef.current)
      const shouldNotify = options?.notify ?? true

      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        const fresh = annotated.filter((p) => !seen.has(p.id))
        if (fresh.length === 0) return prev

        const maxTs = Math.max(...fresh.map(postTimestamp), newestSeenAtRef.current)
        newestSeenAtRef.current = maxTs

        if (shouldNotify) {
          notifyFeedUpdated(fresh.length)
        }

        return [...fresh, ...prev].sort((a, b) => postTimestamp(b) - postTimestamp(a))
      })
    },
    []
  )

  const fetchPosts = useCallback(async (reset: boolean, allowRetry = true) => {
    if (reset) {
      setLoading(true)
      setError(null)
      lastDocRef.current = null
      initialLoadDoneRef.current = false
      liveReadyRef.current = false
      newestSeenAtRef.current = 0
    } else {
      setLoadingMore(true)
    }

    try {
      const cursor = reset ? undefined : (lastDocRef.current ?? undefined)
      const cat = categoryRef.current
      const source = feedSourceRef.current
      const timelineOptions = toTimelineOptions(cat, source, userCityRef.current)

      const postService = await loadPostService()
      const result = await postService.getNewsTimeline(cursor, timelineOptions)

      const annotated = annotateTimelinePosts(result.posts, followingRef.current)

      setPosts((prev) => {
        if (reset) return annotated
        const seen = new Set(prev.map((p) => p.id))
        const fresh = annotated.filter((p) => !seen.has(p.id))
        return fresh.length > 0 ? [...prev, ...fresh] : prev
      })

      if (reset && annotated.length > 0) {
        newestSeenAtRef.current = Math.max(...annotated.map(postTimestamp))
      }

      const cursorAdvanced =
        reset || (result.lastDoc != null && result.lastDoc.id !== cursor?.id)

      if (cursorAdvanced) {
        lastDocRef.current = result.lastDoc
        setHasMore(result.hasMore)
      } else {
        setHasMore(false)
      }
      retryOnceRef.current = false

      if (reset) {
        initialLoadDoneRef.current = true
        const uid = userIdRef.current
        if (uid) {
          queueMicrotask(() => {
            void loadFollowing(uid)
          })
        }
      }
    } catch (err) {
      if (allowRetry && isFirestoreInternalError(err) && !retryOnceRef.current) {
        retryOnceRef.current = true
        await new Promise((resolve) => setTimeout(resolve, 300))
        return fetchPosts(reset, false)
      }

      setError(toFeedError(err))
      setHasMore(false)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [loadFollowing])

  const fetchPostsRef = useRef(fetchPosts)
  fetchPostsRef.current = fetchPosts

  useEffect(() => {
    if (!user?.uid) {
      followingRef.current = new Set()
      setPosts((prev) =>
        prev.map((post) => (post.isFromFollowing ? { ...post, isFromFollowing: false } : post))
      )
    }
  }, [user?.uid])

  useEffect(() => {
    let cancelled = false

    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false
      const uid = userIdRef.current
      if (uid) {
        queueMicrotask(() => {
          if (!cancelled) void loadFollowing(uid)
        })
      }
      return () => {
        cancelled = true
      }
    }

    queueMicrotask(() => {
      if (cancelled) return
      void fetchPostsRef.current(true)
    })

    return () => {
      cancelled = true
    }
  }, [categoryId, feedSource, user?.uid, userCitySlug, loadFollowing])

  useEffect(() => {
    if (!initialLoadDoneRef.current || loading) return

    const timelineOptions = toTimelineOptions(categoryRef.current, feedSourceRef.current, userCityRef.current)
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let deferTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const runPoll = () => {
      void loadPostService()
        .then((postService) => postService.getNewsTimeline(undefined, timelineOptions))
        .then((result) => {
          if (cancelled) return
          if (result.posts.length > 0) {
            const notify = liveReadyRef.current
            liveReadyRef.current = true
            prependLivePosts(result.posts, { notify })
          } else {
            liveReadyRef.current = true
          }
        })
        .catch((err) => console.warn('[useTimelineFeed] poll failed:', err))
    }

    const pollMs = categoryRef.current === 'son-dakika' ? FEED_BREAKING_POLL_MS : FEED_LIVE_POLL_MS
    const startPolling = () => {
      if (pollTimer || cancelled) return
      pollTimer = setInterval(runPoll, pollMs)
    }

    const handleVisibility = () => {
      if (document.hidden) {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
      } else if (!cancelled) {
        runPoll()
        startPolling()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Firestore canlı abone yerine ertelenmiş polling — Firestore okuma maliyetini düşürür.
    deferTimer = setTimeout(startPolling, FEED_LIVE_DEFER_MS)

    return () => {
      cancelled = true
      liveReadyRef.current = false
      document.removeEventListener('visibilitychange', handleVisibility)
      if (deferTimer) clearTimeout(deferTimer)
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [categoryId, feedSource, userCitySlug, loading, prependLivePosts])

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      void fetchPostsRef.current(false)
    }
  }, [loadingMore, hasMore, loading])

  const retry = useCallback(() => {
    retryOnceRef.current = false
    void fetchPostsRef.current(true)
  }, [])

  return {
    posts,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    retry,
  }
}
