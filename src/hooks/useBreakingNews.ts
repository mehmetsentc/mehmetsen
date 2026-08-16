'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db, VIDEO_FEED_COLLECTION } from '@/lib/firebase/firestore'
import { mapNewsSnapshot } from '@/lib/newsMapper'
import { isNationalBreakingEligible } from '@/lib/featuredScope'
import type { Post } from '@/types/post'

const BREAKING_LIMIT = 5
const LIVE_SCAN_LIMIT = 20
const BREAKING_FRESH_WINDOW_MS = 6 * 60 * 60 * 1000
const CACHE_TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  posts: Post[]
  fetchedAt: number
}

let memoryCache: CacheEntry | null = null
let inflight: Promise<Post[]> | null = null

function readSessionCache(): CacheEntry | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem('nahaber-breaking-cache')
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    if (!Array.isArray(parsed.posts) || typeof parsed.fetchedAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writeSessionCache(entry: CacheEntry): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem('nahaber-breaking-cache', JSON.stringify(entry))
  } catch {
    // storage may be full / disabled
  }
}

function isFresh(entry: CacheEntry | null): entry is CacheEntry {
  return !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS
}

async function fetchBreakingPosts(): Promise<Post[]> {
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const snap = await getDocs(
        query(
          collection(db, VIDEO_FEED_COLLECTION),
          where('status', '==', 'published'),
          orderBy('publishedAt', 'desc'),
          limit(LIVE_SCAN_LIMIT)
        )
      )

      const now = Date.now()
      const candidates = mapNewsSnapshot(snap.docs)
      const freshBreaking = candidates
        .filter((post) => {
          const publishedAt = Date.parse(post.publishedAt ?? post.createdAt)
          if (!Number.isFinite(publishedAt)) return false
          const fresh = now - publishedAt <= BREAKING_FRESH_WINDOW_MS
          const isBreaking = post.isBreaking || post.categoryId === 'son-dakika'
          const national = isNationalBreakingEligible({
            categoryId: post.categoryId,
            originalCategoryId: post.originalCategoryId,
            citySlug: post.citySlug,
          })
          return fresh && isBreaking && national
        })
        .slice(0, BREAKING_LIMIT)

      const entry: CacheEntry = { posts: freshBreaking, fetchedAt: Date.now() }
      memoryCache = entry
      writeSessionCache(entry)
      return freshBreaking
    } catch (error) {
      console.warn('[useBreakingNews] fetch failed:', error)
      return memoryCache?.posts ?? []
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/**
 * Son dakika haberlerini tek-seferlik fetch eder ve 5dk in-memory + sessionStorage cache.
 * Eski versiyon `onSnapshot` ile real-time listener kuruyordu — her sayfa açılışında
 * sürekli okuma yapıyordu, Firestore okuma kotasını şişiriyordu.
 */
export function useBreakingNews() {
  const [posts, setPosts] = useState<Post[]>(() => {
    if (isFresh(memoryCache)) return memoryCache.posts
    const stored = readSessionCache()
    if (isFresh(stored)) {
      memoryCache = stored
      return stored.posts
    }
    return []
  })
  const [loading, setLoading] = useState(() => !isFresh(memoryCache))

  useEffect(() => {
    if (isFresh(memoryCache)) {
      setPosts(memoryCache.posts)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    fetchBreakingPosts().then((result) => {
      if (cancelled) return
      setPosts(result)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return { posts, loading }
}
