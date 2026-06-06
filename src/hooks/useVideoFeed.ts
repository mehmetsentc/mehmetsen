'use client'

import { useState, useCallback, useEffect } from 'react'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { postService } from '@/services/postService'
import { likeService } from '@/services/likeService'
import { saveService } from '@/services/saveService'
import { useAuth } from '@/hooks/useAuth'
import type { Post } from '@/types/post'

export interface VideoFeedItem extends Post {
  isLiked?: boolean
  isSaved?: boolean
}

export function useVideoFeed() {
  const { user } = useAuth()
  const [videos, setVideos] = useState<VideoFeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const enrichWithUserState = useCallback(
    async (posts: Post[]): Promise<VideoFeedItem[]> => {
      if (!user || posts.length === 0) return posts
      const ids = posts.map((p) => p.id)
      const [likedMap, savedMap] = await Promise.all([
        likeService.getLikedStatus(user.uid, ids),
        saveService.getSavedStatus(user.uid, ids),
      ])
      return posts.map((p) => ({
        ...p,
        isLiked: likedMap[p.id] ?? false,
        isSaved: savedMap[p.id] ?? false,
      }))
    },
    [user]
  )

  const fetchVideos = useCallback(
    async (reset = false) => {
      if (reset) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      try {
        const cursor = reset ? undefined : (lastDoc ?? undefined)
        const result = await postService.getVideoFeed(cursor)
        const enriched = await enrichWithUserState(result.posts)

        setVideos((prev) => (reset ? enriched : [...prev, ...enriched]))
        setLastDoc(result.lastDoc)
        setHasMore(result.hasMore)
      } catch {
        setHasMore(false)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [lastDoc, enrichWithUserState]
  )

  useEffect(() => {
    fetchVideos(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) fetchVideos(false)
  }, [loadingMore, hasMore, fetchVideos])

  const updateVideo = useCallback((postId: string, patch: Partial<VideoFeedItem>) => {
    setVideos((prev) => prev.map((v) => (v.id === postId ? { ...v, ...patch } : v)))
  }, [])

  return {
    videos,
    loading,
    loadingMore,
    hasMore,
    activeIndex,
    setActiveIndex,
    loadMore,
    updateVideo,
  }
}
