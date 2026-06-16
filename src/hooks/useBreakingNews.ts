'use client'

import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db, VIDEO_FEED_COLLECTION } from '@/lib/firebase/firestore'
import { mapNewsSnapshot } from '@/lib/newsMapper'
import type { Post } from '@/types/post'

const BREAKING_LIMIT = 5
const LIVE_SCAN_LIMIT = 30
const BREAKING_FRESH_WINDOW_MS = 2 * 60 * 60 * 1000

export function useBreakingNews() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, VIDEO_FEED_COLLECTION),
      where('status', '==', 'published'),
      orderBy('publishedAt', 'desc'),
      limit(LIVE_SCAN_LIMIT)
    )

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const now = Date.now()
        const candidates = mapNewsSnapshot(snap.docs)

        const freshBreaking = candidates
          .filter((post) => {
            const publishedAt = Date.parse(post.publishedAt ?? post.createdAt)
            if (!Number.isFinite(publishedAt)) return false
            const isFresh = now - publishedAt <= BREAKING_FRESH_WINDOW_MS
            const isBreaking = post.isBreaking || post.categoryId === 'son-dakika'
            return isFresh && isBreaking
          })
          .slice(0, BREAKING_LIMIT)

        setPosts(freshBreaking)
        setLoading(false)
      },
      () => {
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  return { posts, loading }
}
