'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db, VIDEO_FEED_COLLECTION } from '@/lib/firebase/firestore'
import { mapNewsSnapshot } from '@/lib/newsMapper'
import type { Post } from '@/types/post'

const BREAKING_LIMIT = 5
const GUNDEM_LIMIT = 5

export function useBreakingNews() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchBreaking() {
      try {
        // Önce son-dakika kategorisinden çek
        const breakingSnap = await getDocs(
          query(
            collection(db, VIDEO_FEED_COLLECTION),
            where('status', '==', 'published'),
            where('categoryId', '==', 'son-dakika'),
            orderBy('publishedAt', 'desc'),
            limit(BREAKING_LIMIT)
          )
        )

        let results = mapNewsSnapshot(breakingSnap.docs)

        // son-dakika yeterli değilse gündem'den tamamla
        if (results.length < BREAKING_LIMIT) {
          const gundemSnap = await getDocs(
            query(
              collection(db, VIDEO_FEED_COLLECTION),
              where('status', '==', 'published'),
              where('categoryId', '==', 'gundem'),
              orderBy('publishedAt', 'desc'),
              limit(GUNDEM_LIMIT)
            )
          )
          const gundemPosts = mapNewsSnapshot(gundemSnap.docs)
          // Mevcut id'leri çıkar
          const existingIds = new Set(results.map((p) => p.id))
          results = [
            ...results,
            ...gundemPosts.filter((p) => !existingIds.has(p.id)),
          ].slice(0, BREAKING_LIMIT)
        }

        if (!cancelled) setPosts(results)
      } catch {
        // Sessizce başarısız ol — placeholder göster
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchBreaking()
    return () => { cancelled = true }
  }, [])

  return { posts, loading }
}
