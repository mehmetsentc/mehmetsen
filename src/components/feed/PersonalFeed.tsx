'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Settings } from 'lucide-react'
import {
  collection, getDocs, orderBy, query, where, limit, startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'
import { chunkIds, FIRESTORE_IN_LIMIT } from '@/lib/firestoreIn'
import { useAuth } from '@/hooks/useAuth'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { TimelineItem } from '@/components/feed/TimelineItem'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { rankFeedPosts } from '@/lib/feedRanking'
import { newsDocToPost, type NewsDocument } from '@/lib/newsMapper'
import { ROUTES } from '@/constants/routes'
import type { TimelinePost } from '@/types/post'

const PAGE_SIZE = 15

async function fetchPersonalPage(
  categories: string[],
  lastDoc?: QueryDocumentSnapshot
): Promise<{ posts: TimelinePost[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
  const chunks = categories.length > FIRESTORE_IN_LIMIT ? chunkIds(categories) : [categories]
  const cursorValue = lastDoc ? (lastDoc.data().publishedAt as unknown) : undefined
  const useChunkCursor = chunks.length > 1

  const snaps = await Promise.all(
    chunks.map((chunk) => {
      const constraints = [
        where('status', '==', 'published'),
        chunk.length > 1
          ? where('categoryId', 'in', chunk)
          : where('categoryId', '==', chunk[0]),
        ...(useChunkCursor && cursorValue != null ? [where('publishedAt', '<', cursorValue)] : []),
        orderBy('publishedAt', 'desc'),
        limit(PAGE_SIZE),
        ...(!useChunkCursor && lastDoc ? [startAfter(lastDoc)] : []),
      ]
      return getDocs(query(collection(db, Collections.NEWS), ...constraints))
    })
  )

  const merged = new Map<string, QueryDocumentSnapshot>()
  for (const snap of snaps) {
    for (const docSnap of snap.docs) {
      if (!merged.has(docSnap.id)) merged.set(docSnap.id, docSnap)
    }
  }
  const docs = [...merged.values()].sort((a, b) => {
    const ms = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string') {
        const asNumber = Number(value)
        if (Number.isFinite(asNumber) && value.trim() !== '') return asNumber
        const parsed = Date.parse(value)
        return Number.isFinite(parsed) ? parsed : 0
      }
      if (value && typeof value === 'object' && 'toMillis' in value) {
        const toMillis = (value as { toMillis?: () => number }).toMillis
        if (typeof toMillis === 'function') return toMillis.call(value)
      }
      return 0
    }
    return ms(b.data().publishedAt) - ms(a.data().publishedAt)
  })
  const page = docs.slice(0, PAGE_SIZE)
  const posts = page
    .map((d) => newsDocToPost(d.id, d.data() as NewsDocument))
    .filter((p): p is NonNullable<typeof p> => p !== null) as TimelinePost[]
  const hitCap = snaps.some((snap) => snap.docs.length === PAGE_SIZE)
  return {
    posts,
    lastDoc: page[page.length - 1] ?? null,
    hasMore: hitCap || docs.length > PAGE_SIZE,
  }
}

// ── Giriş yapmamış / kategori seçilmemiş ekranı ──────────────────────────────
function PersonalFeedPrompt({ loggedIn }: { loggedIn: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgb(var(--color-primary))]/10">
        <Sparkles className="h-8 w-8 text-[rgb(var(--color-primary))]" />
      </div>
      <div>
        <h2 className="text-xl font-black text-[rgb(var(--color-text))]">Sana Özel Akış</h2>
        <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">
          {loggedIn
            ? 'İlgilendiğin haber kategorilerini seçerek kişiselleştirilmiş akışını oluştur.'
            : 'Kişiselleştirilmiş akış için giriş yap ve ilgi alanlarını belirle.'}
        </p>
      </div>
      {loggedIn ? (
        <Link
          href="/settings/profile"
          className="inline-flex items-center gap-2 rounded-full bg-[rgb(var(--color-primary))] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          <Settings className="h-4 w-4" />
          Kategorilerimi seç
        </Link>
      ) : (
        <Link
          href={ROUTES.LOGIN}
          className="inline-flex items-center gap-2 rounded-full bg-[rgb(var(--color-primary))] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          Giriş yap
        </Link>
      )}
    </div>
  )
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export function PersonalFeed() {
  const { user } = useAuth()
  const [posts, setPosts] = useState<TimelinePost[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null)
  const didFetchRef = useRef(false)

  const categories = useMemo(
    () => user?.favoriteCategories?.filter(Boolean) ?? [],
    [user]
  )

  // İlk yükleme
  useEffect(() => {
    if (!categories.length || didFetchRef.current) return
    didFetchRef.current = true
    setLoading(true)
    fetchPersonalPage(categories)
      .then(({ posts: p, lastDoc, hasMore: more }) => {
        setPosts(p)
        lastDocRef.current = lastDoc
        setHasMore(more)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [categories])

  const loadMore = async () => {
    if (loadingMore || !hasMore || !categories.length) return
    setLoadingMore(true)
    try {
      const { posts: more, lastDoc, hasMore: stillMore } = await fetchPersonalPage(
        categories,
        lastDocRef.current ?? undefined
      )
      setPosts(prev => {
        const ids = new Set(prev.map(p => p.id))
        return [...prev, ...more.filter(p => !ids.has(p.id))]
      })
      lastDocRef.current = lastDoc
      setHasMore(stillMore)
    } finally {
      setLoadingMore(false)
    }
  }

  const { sentinelRef } = useInfiniteScroll({ onLoadMore: loadMore, hasMore, loading: loadingMore })

  const rankedPosts = useMemo(
    () =>
      rankFeedPosts(posts, {
        citySlug: user?.citySlug ?? null,
        favoriteCategories: user?.favoriteCategories,
        interests: user?.interests,
        followingUsernames: new Set(),
      }),
    [posts, user]
  )

  // Giriş yapılmamış veya kategori seçilmemişse prompt
  if (!user) return <PersonalFeedPrompt loggedIn={false} />
  if (!categories.length) return <PersonalFeedPrompt loggedIn={true} />

  return (
    <div className="timeline-list">
      {/* Başlık chip'i */}
      <div className="mb-3 flex items-center gap-2 px-1">
        <Sparkles className="h-4 w-4 text-[rgb(var(--color-primary))]" />
        <span className="text-sm font-semibold text-[rgb(var(--color-text))]">
          Seçtiğin kategorilerden en son haberler
        </span>
        <Link
          href="/settings/profile"
          className="ml-auto text-xs font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
        >
          Düzenle
        </Link>
      </div>

      {loading && rankedPosts.length === 0
        ? [...Array(5)].map((_, i) => <TimelineItemSkeleton key={i} />)
        : rankedPosts.map((post, i) => (
            <TimelineItem key={post.id} post={post} isLast={i === rankedPosts.length - 1} />
          ))}

      {!loading && rankedPosts.length === 0 && (
        <div className="surface-card border-dashed py-16 text-center">
          <p className="font-semibold text-[rgb(var(--color-text))]">
            Seçilen kategorilerde henüz haber yok
          </p>
          <Link
            href="/settings/profile"
            className="mt-2 inline-block text-sm text-[rgb(var(--color-primary))] hover:underline"
          >
            Kategorilerimi güncelle
          </Link>
        </div>
      )}

      {loadingMore && <TimelineItemSkeleton />}
      <div ref={sentinelRef} className="h-1" aria-hidden />
    </div>
  )
}
