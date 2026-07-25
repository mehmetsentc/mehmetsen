'use client'

import { useEffect, useRef, useState } from 'react'
import type { TimelinePost } from '@/types/post'
import type { HomeFeedInitialData, NewsItem } from '@/types/newsItem'
import {
  FEED_LIVE_DEFER_MS,
  FEED_LIVE_POLL_MS,
  notifyFeedUpdated,
} from '@/lib/feedLiveToast'

let postServiceModule: Promise<typeof import('@/services/postService')> | null = null
function loadPostService() {
  postServiceModule ??= import('@/services/postService')
  return postServiceModule.then((m) => m.postService)
}

function timelinePostToNewsItem(post: TimelinePost): NewsItem | null {
  const title = post.title?.trim()
  if (!title) return null

  const categoryId = (post.categoryId ?? '').trim()
  const imageUrl =
    post.coverImageUrl?.trim() ||
    post.mediaItems?.find((m) => m.type === 'image')?.url?.trim() ||
    undefined

  const raw = post.publishedAt ?? post.createdAt
  const publishedAt =
    typeof raw === 'number'
      ? new Date(raw).toISOString()
      : typeof raw === 'string'
        ? raw
        : undefined

  const videoUrl =
    post.mediaItems?.find((m) => m.type === 'video')?.url?.trim() || undefined

  const isBreaking = Boolean(post.isBreaking) || categoryId === 'son-dakika'

  return {
    id: post.id,
    slug: post.slug?.trim() || post.id,
    title,
    description: post.summary?.trim() || post.spot?.trim() || undefined,
    imageUrl: imageUrl && imageUrl.length > 5 ? imageUrl : undefined,
    videoUrl,
    category: categoryId || undefined,
    publishedAt,
    breaking: isBreaking,
    featured: post.featured === true || post.isEditorPick === true,
  }
}

function collectIds(data: HomeFeedInitialData): Set<string> {
  const ids = new Set<string>()
  const add = (items: NewsItem[]) => items.forEach((i) => ids.add(i.id))
  add(data.latest)
  add(data.breaking)
  add(data.featured)
  add(data.trending)
  add(data.trendFeed)
  add(data.mostRead)
  Object.values(data.categoryRails).forEach((rail) => {
    if (rail) add(rail)
  })
  return ids
}

function mergeHomeFeed(prev: HomeFeedInitialData, incoming: TimelinePost[]): HomeFeedInitialData {
  const seen = collectIds(prev)
  const fresh = incoming
    .map(timelinePostToNewsItem)
    .filter((item): item is NewsItem => item !== null && !seen.has(item.id))

  if (fresh.length === 0) return prev

  fresh.sort((a, b) => {
    const ta = Date.parse(a.publishedAt ?? '') || 0
    const tb = Date.parse(b.publishedAt ?? '') || 0
    return tb - ta
  })

  const breakingFresh = fresh.filter((i) => i.breaking)
  const latestFresh = fresh.filter((i) => !i.breaking)

  return {
    ...prev,
    latest: [...latestFresh, ...prev.latest],
    breaking: [...breakingFresh, ...prev.breaking].slice(0, 15),
  }
}

/**
 * Ana sayfa (/feed) — açıkken yeni haberleri poll eder, akışı günceller ve toast gösterir.
 */
export function useHomeFeedLiveUpdates(initial: HomeFeedInitialData): HomeFeedInitialData {
  const [data, setData] = useState(initial)
  const liveReadyRef = useRef(false)
  const initialKey = `${initial.latest[0]?.id ?? ''}:${initial.latest.length}`

  useEffect(() => {
    setData(initial)
    liveReadyRef.current = false
  }, [initialKey, initial])

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let deferTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const applyIncoming = (posts: TimelinePost[], notify: boolean) => {
      setData((prev) => {
        const seen = collectIds(prev)
        const fresh = posts.filter((p) => !seen.has(p.id))
        if (fresh.length === 0) return prev
        if (notify) notifyFeedUpdated(fresh.length)
        return mergeHomeFeed(prev, fresh)
      })
    }

    const runPoll = () => {
      void loadPostService()
        .then((postService) => postService.getNewsTimeline(undefined, { feedSource: 'nahaber' }))
        .then((result) => {
          if (cancelled) return
          if (result.posts.length === 0) {
            liveReadyRef.current = true
            return
          }
          const notify = liveReadyRef.current
          liveReadyRef.current = true
          applyIncoming(result.posts as TimelinePost[], notify)
        })
        .catch((err) => console.warn('[useHomeFeedLiveUpdates] poll failed:', err))
    }

    const startPolling = () => {
      if (pollTimer || cancelled) return
      pollTimer = setInterval(runPoll, FEED_LIVE_POLL_MS)
    }

    const handleVisibility = () => {
      if (document.hidden) {
        if (pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }
      } else if (!cancelled) {
        runPoll()
        startPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    const startAfterInteraction = () => {
      if (cancelled) return
      startPolling()
      window.removeEventListener('pointerdown', startAfterInteraction)
      window.removeEventListener('keydown', startAfterInteraction)
      window.removeEventListener('scroll', startAfterInteraction)
    }

    // Defer live poll until after LCP budget; start earlier on first user input.
    deferTimer = setTimeout(() => {
      if (cancelled) return
      startPolling()
      window.removeEventListener('pointerdown', startAfterInteraction)
      window.removeEventListener('keydown', startAfterInteraction)
      window.removeEventListener('scroll', startAfterInteraction)
    }, FEED_LIVE_DEFER_MS)

    window.addEventListener('pointerdown', startAfterInteraction, { once: true, passive: true })
    window.addEventListener('keydown', startAfterInteraction, { once: true })
    window.addEventListener('scroll', startAfterInteraction, { once: true, passive: true })

    return () => {
      cancelled = true
      liveReadyRef.current = false
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pointerdown', startAfterInteraction)
      window.removeEventListener('keydown', startAfterInteraction)
      window.removeEventListener('scroll', startAfterInteraction)
      if (deferTimer) clearTimeout(deferTimer)
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [initialKey])

  return data
}
