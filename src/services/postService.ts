import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  increment,
  onSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { cityCategoryId, slugifyCity, toFirestoreLocation, type PostLocation } from '@/lib/location'
import { buildNewsSlug } from '@/lib/newsSlug'
import { getCityCategoryName } from '@/constants/cities'
import { filterPostsByFeedSource } from '@/lib/feedSource'
import { YEREL_HABER_CATEGORY, isYerelHaberEligible } from '@/lib/feedRanking'
import { db, Collections, VIDEO_FEED_COLLECTION } from '@/lib/firebase/firestore'
import { hasVideoContent, isPubliclyVisibleStatus } from '@/lib/postUtils'
import {
  hasNewsVideoUrl,
  mapNewsSnapshot,
  newsDocToPost,
  type NewsDocument,
} from '@/lib/newsMapper'
import { NEWS_FEED_QUERY, NEWS_REELS_QUERY } from '@/lib/newsQueries'
import { devLog, withTimeout } from '@/lib/asyncUtils'
import { enqueueFirestoreRead } from '@/lib/firestoreQueue'
import type { Post, TimelinePost } from '@/types/post'

export { NEWS_FEED_QUERY, NEWS_REELS_QUERY }

const PAGE_SIZE = 10
const LIVE_WATCH_LIMIT = 12
const REELS_PAGE_SIZE = 24
const QUERY_TIMEOUT_MS = 15_000

export type NewsTimelineOptions = {
  citySlug?: string
  categoryId?: string
  preferredCitySlug?: string
  feedSource?: 'nahaber' | 'user'
}

function buildNewsTimelineQueryConstraints(
  options?: NewsTimelineOptions,
  watchLimit = PAGE_SIZE
): { constraints: Parameters<typeof query>[1][]; filterAuthorOnServer: boolean } {
  // Never filter author server-side — composite index (author+createdAt) may not exist.
  // feedSource filter is always applied client-side via filterPostsByFeedSource.
  const filterAuthorOnServer = false

  // status filtresi her zaman ilk — composite index'ler (status, X, publishedAt) yapısında
  const constraints: Parameters<typeof query>[1][] = [
    where('status', '==', 'published'),
  ]

  if (options?.citySlug) {
    constraints.push(where('citySlug', '==', options.citySlug))
  } else if (
    options?.categoryId === YEREL_HABER_CATEGORY &&
    options?.preferredCitySlug?.trim()
  ) {
    constraints.push(where('citySlug', '==', options.preferredCitySlug.trim()))
  } else if (options?.categoryId === 'son-dakika') {
    // isBreaking==true catches all breaking news regardless of stored categoryId
    constraints.push(where('isBreaking', '==', true))
  } else if (options?.categoryId) {
    constraints.push(where('categoryId', '==', options.categoryId))
  }

  // publishedAt kullan — tüm composite index'ler bu alanı referans alıyor
  constraints.push(orderBy('publishedAt', 'desc'))
  constraints.push(limit(watchLimit))

  return { constraints, filterAuthorOnServer }
}

function applyTimelinePostFilters(posts: Post[], options?: NewsTimelineOptions): Post[] {
  if (options?.categoryId === YEREL_HABER_CATEGORY) {
    return posts.filter(isYerelHaberEligible)
  }
  return posts
}

function toPost(d: QueryDocumentSnapshot): Post {
  return { id: d.id, ...d.data() } as Post
}

function isPublicPublishedPost(post: Post): boolean {
  return post.status === 'published' && post.visibility === 'public'
}

async function runQuery(
  constraints: Parameters<typeof query>[1][],
  label: string
): Promise<QueryDocumentSnapshot[]> {
  const q = query(collection(db, Collections.POSTS), ...constraints)
  const snap = await withTimeout(enqueueFirestoreRead(() => getDocs(q)), QUERY_TIMEOUT_MS, label)
  return snap.docs
}

export const postService = {
  async getFeed(lastDoc?: QueryDocumentSnapshot) {
    const constraints: Parameters<typeof query>[1][] = [
      where('status', '==', 'published'),
      where('visibility', '==', 'public'),
      orderBy('publishedAt', 'desc'),
      limit(PAGE_SIZE),
    ]
    if (lastDoc) constraints.push(startAfter(lastDoc))

    const docs = await runQuery(constraints, 'getFeed')
    return {
      posts: docs.map(toPost),
      lastDoc: docs[docs.length - 1] ?? null,
      hasMore: docs.length === PAGE_SIZE,
    }
  },

  async getByCategory(categoryId: string, lastDoc?: QueryDocumentSnapshot) {
    const constraints: Parameters<typeof query>[1][] = [
      where('status', '==', 'published'),
      where('visibility', '==', 'public'),
      where('categoryId', '==', categoryId),
      orderBy('publishedAt', 'desc'),
      limit(PAGE_SIZE),
    ]
    if (lastDoc) constraints.push(startAfter(lastDoc))

    const docs = await runQuery(constraints, 'getByCategory')
    return {
      posts: docs.map(toPost),
      lastDoc: docs[docs.length - 1] ?? null,
      hasMore: docs.length === PAGE_SIZE,
    }
  },

  async getByAuthor(authorId: string, lastDoc?: QueryDocumentSnapshot) {
    const constraints: Parameters<typeof query>[1][] = [
      where('authorId', '==', authorId),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    ]
    if (lastDoc) constraints.push(startAfter(lastDoc))

    const docs = await runQuery(constraints, 'getByAuthor')
    return {
      posts: docs.map(toPost),
      lastDoc: docs[docs.length - 1] ?? null,
      hasMore: docs.length === PAGE_SIZE,
    }
  },

  async getById(id: string): Promise<Post | null> {
    const snap = await getDoc(doc(db, Collections.POSTS, id))
    if (!snap.exists()) return null
    return { id: snap.id, ...snap.data() } as Post
  },

  async create(
    data: Omit<Post, 'id' | 'createdAt' | 'updatedAt' | 'likesCount' | 'commentsCount' | 'savesCount' | 'sharesCount' | 'viewsCount'>
  ): Promise<string> {
    const now = new Date().toISOString()
    const ref = await addDoc(collection(db, Collections.POSTS), {
      ...data,
      likesCount: 0,
      commentsCount: 0,
      savesCount: 0,
      sharesCount: 0,
      viewsCount: 0,
      publishedAt: data.status === 'published' ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    return ref.id
  },

  async update(id: string, data: Partial<Post>) {
    await updateDoc(doc(db, Collections.POSTS, id), {
      ...data,
      updatedAt: new Date().toISOString(),
    })
  },

  async delete(id: string) {
    await deleteDoc(doc(db, Collections.POSTS, id))
  },

  async deleteNews(id: string) {
    await deleteDoc(doc(db, VIDEO_FEED_COLLECTION, id))
  },

  async getNewsTimeline(lastDoc?: QueryDocumentSnapshot, options?: NewsTimelineOptions) {
    devLog('postService', 'getNewsTimeline', {
      query: NEWS_FEED_QUERY.firestore,
      hasCursor: !!lastDoc,
      citySlug: options?.citySlug,
      categoryId: options?.categoryId,
      feedSource: options?.feedSource,
    })

    const { constraints: baseConstraints, filterAuthorOnServer } =
      buildNewsTimelineQueryConstraints(options, PAGE_SIZE)

    try {
      const constraints = [...baseConstraints]
      if (lastDoc) constraints.splice(constraints.length - 1, 0, startAfter(lastDoc))

      const q = query(collection(db, VIDEO_FEED_COLLECTION), ...constraints)
      const snap = await withTimeout(
        enqueueFirestoreRead(() => getDocs(q)),
        QUERY_TIMEOUT_MS,
        'news-timeline'
      )

      let posts = mapNewsSnapshot(snap.docs).filter((p) => isPubliclyVisibleStatus(p.status))

      if (!filterAuthorOnServer && options?.feedSource) {
        posts = filterPostsByFeedSource(posts, options.feedSource)
      }

      posts = applyTimelinePostFilters(posts, options)

      // `hasMore` and the cursor are derived from the raw docs (before the
      // client-side feed-source filter) so pagination keeps advancing even
      // when a page yields few or no displayable posts after filtering.
      return {
        posts,
        lastDoc: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: snap.docs.length === PAGE_SIZE,
      }
    } catch (newsError) {
      // RESOURCE_EXHAUSTED (code 8): Firestore quota doldu — fallback query da başarısız olur,
      // boş sayfa dön ki site çöküp error sayfası göstermesin.
      const errCode = (newsError as { code?: number }).code
      if (errCode === 8) {
        console.warn('[postService] Firestore RESOURCE_EXHAUSTED — returning empty timeline')
        return { posts: [], lastDoc: null, hasMore: false }
      }
      console.warn('[postService] news timeline failed, returning empty:', newsError)
      return { posts: [], lastDoc: null, hasMore: false }
    }
  },

  /**
   * Real-time listener for the newest feed page only (pagination stays cursor-based).
   * Returns an unsubscribe function; errors are passed to onError.
   */
  subscribeNewsTimeline(
    options: NewsTimelineOptions | undefined,
    onPosts: (posts: TimelinePost[]) => void,
    onError?: (error: unknown) => void
  ): () => void {
    const { constraints, filterAuthorOnServer } = buildNewsTimelineQueryConstraints(
      options,
      LIVE_WATCH_LIMIT
    )
    const q = query(collection(db, VIDEO_FEED_COLLECTION), ...constraints)

    return onSnapshot(
      q,
      (snap) => {
        let posts = mapNewsSnapshot(snap.docs).filter((p) => isPubliclyVisibleStatus(p.status))
        if (!filterAuthorOnServer && options?.feedSource) {
          posts = filterPostsByFeedSource(posts, options.feedSource)
        }
        posts = applyTimelinePostFilters(posts, options)
        onPosts(posts)
      },
      (error) => {
        console.warn('[postService] subscribeNewsTimeline failed:', error)
        onError?.(error)
      }
    )
  },

  async getRecentCities(scanLimit = 120): Promise<Array<{ slug: string; name: string; lastPostAt: number }>> {
    try {
      const q = query(
        collection(db, VIDEO_FEED_COLLECTION),
        orderBy('createdAt', 'desc'),
        limit(scanLimit)
      )
      const snap = await withTimeout(
        enqueueFirestoreRead(() => getDocs(q)),
        QUERY_TIMEOUT_MS,
        'recent-cities'
      )
      const ordered: Array<{ slug: string; name: string; lastPostAt: number }> = []
      const seen = new Set<string>()

      for (const docSnap of snap.docs) {
        const data = docSnap.data() as NewsDocument
        if (!isPubliclyVisibleStatus(data.status)) continue

        const slug = data.citySlug?.trim()
        if (!slug || seen.has(slug)) continue

        const createdAtRaw = data.createdAt
        let lastPostAt = Date.now()
        if (typeof createdAtRaw === 'number') {
          lastPostAt = createdAtRaw < 1_000_000_000_000 ? createdAtRaw * 1000 : createdAtRaw
        } else if (typeof createdAtRaw === 'string') {
          const parsed = Date.parse(createdAtRaw)
          if (!Number.isNaN(parsed)) lastPostAt = parsed
        }

        seen.add(slug)
        ordered.push({
          slug,
          name: data.city?.trim() || getCityCategoryName(slug),
          lastPostAt,
        })
      }

      return ordered
    } catch (error) {
      console.warn('[postService] getRecentCities failed:', error)
      return []
    }
  },

  async getVideoFeed(lastDoc?: QueryDocumentSnapshot) {
    devLog('postService', 'getVideoFeed', { query: NEWS_REELS_QUERY.firestore, hasCursor: !!lastDoc })

    try {
      const constraints: Parameters<typeof query>[1][] = [
        where('videoUrl', '!=', ''),
        orderBy('videoUrl'),
        orderBy('createdAt', 'desc'),
        limit(REELS_PAGE_SIZE),
      ]
      if (lastDoc) constraints.push(startAfter(lastDoc))

      const q = query(collection(db, VIDEO_FEED_COLLECTION), ...constraints)
      const snap = await withTimeout(getDocs(q), QUERY_TIMEOUT_MS, 'news-reels')

      const posts = mapNewsSnapshot(snap.docs)
        .filter((p) => isPubliclyVisibleStatus(p.status))
        .filter(hasVideoContent)

      devLog('postService', 'getVideoFeed success', {
        rawCount: snap.docs.length,
        videoCount: posts.length,
      })

      return {
        posts,
        lastDoc: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: snap.docs.length === REELS_PAGE_SIZE,
      }
    } catch (reelsError) {
      console.warn(
        '[postService] reels query failed, fallback:',
        NEWS_REELS_QUERY.fallback,
        reelsError
      )

      const constraints: Parameters<typeof query>[1][] = [
        orderBy('createdAt', 'desc'),
        limit(REELS_PAGE_SIZE),
      ]
      if (lastDoc) constraints.push(startAfter(lastDoc))

      const q = query(collection(db, VIDEO_FEED_COLLECTION), ...constraints)
      const snap = await withTimeout(getDocs(q), QUERY_TIMEOUT_MS, 'news-reels-fallback')

      const posts = mapNewsSnapshot(
        snap.docs.filter((d) => hasNewsVideoUrl(d.data() as NewsDocument))
      )
        .filter((p) => isPubliclyVisibleStatus(p.status))
        .filter(hasVideoContent)

      return {
        posts,
        lastDoc: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: snap.docs.length === REELS_PAGE_SIZE,
      }
    }
  },

  async getFollowingVideoFeed(followerId: string, lastDoc?: QueryDocumentSnapshot) {
    const { followService } = await import('@/services/followService')
    const followingIds = await followService.getFollowingIds(followerId)
    if (followingIds.length === 0) {
      return { posts: [], lastDoc: null, hasMore: false }
    }

    const authorIds = followingIds.slice(0, 30)

    devLog('postService', 'getFollowingVideoFeed', {
      followingCount: followingIds.length,
      queryCount: authorIds.length,
      hasCursor: !!lastDoc,
    })

    try {
      const constraints: Parameters<typeof query>[1][] = [
        where('authorId', 'in', authorIds),
        orderBy('createdAt', 'desc'),
        limit(REELS_PAGE_SIZE),
      ]
      if (lastDoc) constraints.push(startAfter(lastDoc))

      const q = query(collection(db, VIDEO_FEED_COLLECTION), ...constraints)
      const snap = await withTimeout(getDocs(q), QUERY_TIMEOUT_MS, 'following-reels')

      const posts = mapNewsSnapshot(snap.docs)
        .filter((p) => isPubliclyVisibleStatus(p.status))
        .filter(hasVideoContent)

      return {
        posts,
        lastDoc: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: snap.docs.length === REELS_PAGE_SIZE,
      }
    } catch (followingError) {
      console.warn('[postService] following reels query failed, fallback:', followingError)

      const constraints: Parameters<typeof query>[1][] = [
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE * 3),
      ]
      if (lastDoc) constraints.push(startAfter(lastDoc))

      const q = query(collection(db, VIDEO_FEED_COLLECTION), ...constraints)
      const snap = await withTimeout(getDocs(q), QUERY_TIMEOUT_MS, 'following-reels-fallback')

      const authorSet = new Set(authorIds)
      const posts = mapNewsSnapshot(snap.docs)
        .filter((p) => isPubliclyVisibleStatus(p.status))
        .filter(hasVideoContent)
        .filter((p) => authorSet.has(p.authorId))

      return {
        posts,
        lastDoc: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: snap.docs.length === PAGE_SIZE * 3,
      }
    }
  },

  async getNewsById(id: string): Promise<Post | null> {
    const snap = await getDoc(doc(db, VIDEO_FEED_COLLECTION, id))
    if (!snap.exists()) return null
    return newsDocToPost(snap.id, snap.data() as NewsDocument)
  },

  async getNewsBySlug(slug: string): Promise<Post | null> {
    const normalized = slug.trim()
    if (!normalized) return null

    try {
      const q = query(
        collection(db, VIDEO_FEED_COLLECTION),
        where('slug', '==', normalized),
        limit(1)
      )
      const snap = await withTimeout(getDocs(q), QUERY_TIMEOUT_MS, 'news-by-slug')
      if (!snap.empty) {
        const d = snap.docs[0]
        return newsDocToPost(d.id, d.data() as NewsDocument)
      }
    } catch (error) {
      console.warn('[postService] getNewsBySlug query failed:', error)
    }

    // Fallback: treat slug as document id for legacy articles
    return this.getNewsById(normalized)
  },

  async getSuggestedNews(
    excludeId: string,
    options?: { categoryId?: string; limit?: number }
  ): Promise<Post[]> {
    const maxResults = options?.limit ?? 10
    const categoryId = options?.categoryId?.trim()

    try {
      const q = query(
        collection(db, VIDEO_FEED_COLLECTION),
        orderBy('createdAt', 'desc'),
        limit(Math.max(maxResults * 3, 20))
      )
      const snap = await withTimeout(getDocs(q), QUERY_TIMEOUT_MS, 'suggested-news')
      let posts = mapNewsSnapshot(snap.docs).filter((p) => p.id !== excludeId)

      if (categoryId) {
        const sameCategory = posts.filter((p) => p.categoryId === categoryId)
        const other = posts.filter((p) => p.categoryId !== categoryId)
        posts = [...sameCategory, ...other]
      }

      return posts.slice(0, maxResults)
    } catch (error) {
      console.warn('[postService] getSuggestedNews failed:', error)
      return []
    }
  },

  async getNewsByIds(ids: string[]): Promise<Post[]> {
    if (ids.length === 0) return []
    const posts = await Promise.all(ids.map((id) => this.getNewsById(id)))
    return posts.filter((post): post is Post => post !== null)
  },

  async getNewsByAuthor(
    author: string,
    options?: { videosOnly?: boolean; lastDoc?: QueryDocumentSnapshot }
  ) {
    const normalizedAuthor = author.trim()
    devLog('postService', 'getNewsByAuthor', { author: normalizedAuthor, videosOnly: options?.videosOnly })

    try {
      const constraints: Parameters<typeof query>[1][] = [
        where('author', '==', normalizedAuthor),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE),
      ]
      if (options?.lastDoc) constraints.push(startAfter(options.lastDoc))

      const q = query(collection(db, VIDEO_FEED_COLLECTION), ...constraints)
      const snap = await withTimeout(getDocs(q), QUERY_TIMEOUT_MS, 'news-by-author')

      let posts = mapNewsSnapshot(snap.docs)
      if (options?.videosOnly) {
        posts = posts.filter(hasVideoContent)
      }

      return {
        posts,
        lastDoc: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: snap.docs.length === PAGE_SIZE,
      }
    } catch (error) {
      console.warn('[postService] getNewsByAuthor failed, client filter fallback:', error)

      const snap = await withTimeout(
        getDocs(query(collection(db, VIDEO_FEED_COLLECTION), limit(PAGE_SIZE * 3))),
        QUERY_TIMEOUT_MS,
        'news-by-author-fallback'
      )

      let posts = mapNewsSnapshot(snap.docs).filter(
        (p) => p.authorUsername === normalizedAuthor || p.authorId === normalizedAuthor
      )
      if (options?.videosOnly) {
        posts = posts.filter(hasVideoContent)
      }
      posts.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))

      return {
        posts: posts.slice(0, PAGE_SIZE),
        lastDoc: null,
        hasMore: false,
      }
    }
  },

  async incrementViews(id: string) {
    const ref = doc(db, VIDEO_FEED_COLLECTION, id)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      await updateDoc(ref, { viewsCount: increment(1) })
      return
    }
    await updateDoc(doc(db, Collections.POSTS, id), { viewsCount: increment(1) })
  },

  async incrementShares(id: string) {
    const ref = doc(db, VIDEO_FEED_COLLECTION, id)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      await updateDoc(ref, { sharesCount: increment(1) })
      return
    }
    await updateDoc(doc(db, Collections.POSTS, id), { sharesCount: increment(1) })
  },

  async createNews(data: {
    title: string
    description: string
    author: string
    authorId: string
    thumbnail?: string
    videoUrl?: string
    category?: string
    type?: string
    status?: string
    tags?: string[]
    location?: PostLocation | null
  }): Promise<string> {
    console.log('FIRESTORE WRITE START', {
      title: data.title,
      author: data.author,
      hasThumbnail: Boolean(data.thumbnail),
      hasVideo: Boolean(data.videoUrl),
      tags: data.tags?.length ?? 0,
      hasLocation: Boolean(data.location),
    })

    const now = Date.now()
    const location = toFirestoreLocation(data.location)
    const citySlug = location?.city ? slugifyCity(location.city) : ''
    const cityCategory = citySlug ? cityCategoryId(citySlug) : ''
    const topicCategory = data.category?.trim() ?? ''
    const status = data.status ?? 'published'

    const ref = await addDoc(collection(db, VIDEO_FEED_COLLECTION), {
      title: data.title.trim(),
      description: data.description.trim(),
      author: data.author,
      authorId: data.authorId,
      thumbnail: data.thumbnail ?? '',
      videoUrl: data.videoUrl ?? '',
      category: topicCategory || cityCategory,
      categoryId: topicCategory || cityCategory,
      city: location?.city ?? '',
      citySlug,
      location,
      tags: data.tags ?? [],
      type: data.type ?? 'news',
      createdAt: now,
      // Pending (moderation-held) posts are not live yet → no publish time.
      publishedAt: status === 'published' ? now : null,
      viewsCount: 0,
      likesCount: 0,
      commentCount: 0,
      savesCount: 0,
      sharesCount: 0,
      status,
    })

    if (status === 'published') {
      await updateDoc(ref, {
        slug: buildNewsSlug(data.title.trim(), ref.id.slice(0, 8)),
      })
    }

    console.log('FIRESTORE WRITE SUCCESS', ref.id)
    return ref.id
  },

  async createDraftNews(data: {
    author: string
    authorId: string
    type: 'video' | 'photo' | 'news'
  }): Promise<string> {
    const now = Date.now()
    const ref = await addDoc(collection(db, VIDEO_FEED_COLLECTION), {
      title: 'Taslak',
      description: '',
      author: data.author,
      authorId: data.authorId,
      thumbnail: '',
      videoUrl: '',
      category: '',
      categoryId: '',
      city: '',
      citySlug: '',
      location: null,
      tags: [],
      type: data.type,
      createdAt: now,
      publishedAt: null,
      viewsCount: 0,
      likesCount: 0,
      commentCount: 0,
      savesCount: 0,
      status: 'draft',
    })
    return ref.id
  },

  async updateDraftNews(
    id: string,
    patch: {
      thumbnail?: string
      videoUrl?: string
    }
  ): Promise<void> {
    await updateDoc(doc(db, VIDEO_FEED_COLLECTION, id), {
      ...patch,
      updatedAt: Date.now(),
    })
  },

  async publishNews(
    id: string,
    data: {
      title: string
      description: string
      author: string
      authorId: string
      thumbnail?: string
      videoUrl?: string
      category?: string
      type?: string
      tags?: string[]
      location?: PostLocation | null
      // Resolved by moderation: 'published' (clean) or 'pending' (held for
      // admin approval). Defaults to 'published' to preserve prior behaviour.
      status?: 'published' | 'pending'
    }
  ): Promise<void> {
    const now = Date.now()
    const location = toFirestoreLocation(data.location)
    const citySlug = location?.city ? slugifyCity(location.city) : ''
    const cityCategory = citySlug ? cityCategoryId(citySlug) : ''
    const topicCategory = data.category?.trim() ?? ''
    const status = data.status ?? 'published'

    await updateDoc(doc(db, VIDEO_FEED_COLLECTION, id), {
      title: data.title.trim(),
      description: data.description.trim(),
      author: data.author,
      authorId: data.authorId,
      thumbnail: data.thumbnail ?? '',
      videoUrl: data.videoUrl ?? '',
      category: topicCategory || cityCategory,
      categoryId: topicCategory || cityCategory,
      city: location?.city ?? '',
      citySlug,
      location,
      tags: data.tags ?? [],
      type: data.type ?? 'news',
      status,
      // A pending post is not yet live, so it has no publish time.
      publishedAt: status === 'published' ? now : null,
      updatedAt: now,
    })
  },
}
