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
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { cityCategoryId, slugifyCity, toFirestoreLocation, type PostLocation } from '@/lib/location'
import { buildNewsSlug } from '@/lib/newsSlug'
import { getCityCategoryName } from '@/constants/cities'
import { getHomeFeedCategoryFamily } from '@/constants/config'
import { filterPostsByFeedSource } from '@/lib/feedSource'
import { YEREL_HABER_CATEGORY, isYerelHaberEligible } from '@/lib/feedRanking'
import { isExcludedFromCityLocalPrimaryFeed } from '@/lib/gastronomyRouting'
import { isNationalBreakingEligible } from '@/lib/featuredScope'
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
import type { Post } from '@/types/post'

export { NEWS_FEED_QUERY, NEWS_REELS_QUERY }

const PAGE_SIZE = 10
const REELS_PAGE_SIZE = 24
const QUERY_TIMEOUT_MS = 8_000

// ── Videos collection document (AI-generated TTS reels) ──────────────────────
interface VideoCollectionDoc {
  newsId?: string
  title?: string
  description?: string
  voiceText?: string
  thumbnailUrl?: string
  coverImageUrl?: string
  audioUrl?: string
  categoryId?: string
  status?: string
  scriptReady?: boolean
  audioReady?: boolean
  hashtags?: string[]
  likes?: number
  views?: number
  comments?: number
  saves?: number
  createdAt?: number
  publishedAt?: number
}

type AudioPost = Post & { audioUrl?: string }

function videoDocToPost(id: string, data: VideoCollectionDoc): AudioPost {
  const thumbUrl = data.thumbnailUrl?.trim() || data.coverImageUrl?.trim() || null
  const createdMs = typeof data.createdAt === 'number' ? data.createdAt : Date.now()
  const createdIso = new Date(createdMs).toISOString()
  return {
    id,
    title: data.title?.trim() || 'Sesli Haber',
    slug: id,
    content: data.voiceText?.trim() || data.description?.trim() || '',
    summary: data.description?.trim() || data.voiceText?.slice(0, 280) || '',
    feedTeaser: data.title?.trim() || '',
    authorId: 'nahaber',
    authorUsername: 'nahaber',
    authorDisplayName: 'NaHaber',
    authorPhotoURL: null,
    categoryId: data.categoryId?.trim() || 'gundem',
    city: null,
    citySlug: null,
    location: null,
    tags: Array.isArray(data.hashtags) ? data.hashtags : [],
    postType: 'news',
    source: 'NaHaber',
    // Use image mediaItem so the VideoFeedItem falls into audio-mode (no stableSrc)
    mediaItems: thumbUrl ? [{ type: 'image' as const, url: thumbUrl, thumbnailUrl: thumbUrl, caption: null }] : [],
    coverImageUrl: thumbUrl,
    status: 'published',
    visibility: 'public',
    likesCount: data.likes ?? 0,
    commentsCount: data.comments ?? 0,
    savesCount: data.saves ?? 0,
    sharesCount: 0,
    viewsCount: data.views ?? 0,
    isEditorPick: false,
    isTrending: false,
    publishedAt: createdIso,
    createdAt: createdIso,
    updatedAt: createdIso,
    audioUrl: data.audioUrl?.trim() || undefined,
  }
}

export type NewsTimelineOptions = {
  citySlug?: string
  categoryId?: string
  preferredCitySlug?: string
  feedSource?: 'nahaber' | 'user'
  /** Varsayılan PAGE_SIZE (10); yerel haber gibi sayfalarda artırılabilir */
  limit?: number
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
    // Parent kategorileri (spor, kultur) → tüm alt kategorileri de kapsa
    const family = getHomeFeedCategoryFamily(options.categoryId)
    if (family.length > 1) {
      constraints.push(where('categoryId', 'in', family))
    } else {
      constraints.push(where('categoryId', '==', options.categoryId))
    }
  }

  // publishedAt kullan — tüm composite index'ler bu alanı referans alıyor
  constraints.push(orderBy('publishedAt', 'desc'))
  constraints.push(limit(watchLimit))

  return { constraints, filterAuthorOnServer }
}

/** Şehir sorgusu için daha hafif filtre — salt ulusal + gastronomi (şehir sahipliği yok) */
const CITY_QUERY_BLOCKED_CATEGORIES = new Set([
  'meteoroloji', 'hava-durumu', 'hava', 'cevre', 'dunya', 'kripto', 'borsa',
])

function applyTimelinePostFilters(posts: Post[], options?: NewsTimelineOptions): Post[] {
  if (options?.categoryId === 'son-dakika') {
    return posts.filter((p) =>
      isNationalBreakingEligible({
        categoryId: p.categoryId,
        originalCategoryId: p.originalCategoryId,
        citySlug: p.citySlug,
      })
    )
  }
  if (options?.categoryId === YEREL_HABER_CATEGORY) {
    // Yerel haber sayfası: tam filtre — citySlug olmayan veya ulusal kategori olan her şeyi at
    return posts.filter(isYerelHaberEligible)
  }
  if (options?.citySlug) {
    // Şehir sayfası: meteoroloji/dünya + gastronomi (tarifler şehir feed'ini ezmesin).
    // gundem/spor/ekonomi vb. o şehirden gelen haber olabilir, bloklanmamalı.
    return posts.filter((p) => {
      const cat = (p as Post & { categoryId?: string }).categoryId?.trim().toLowerCase() ?? ''
      if (isExcludedFromCityLocalPrimaryFeed(cat)) return false
      return !CITY_QUERY_BLOCKED_CATEGORIES.has(cat)
    })
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

    const pageLimit = options?.limit ?? PAGE_SIZE
    // City feeds filter gastronomi client-side — oversample so real local news still fills a page.
    const fetchLimit =
      options?.citySlug && !options?.categoryId
        ? Math.min(pageLimit * 3, 60)
        : options?.categoryId === 'son-dakika'
          ? Math.min(pageLimit * 3, 60)
          : pageLimit
    const { constraints: baseConstraints, filterAuthorOnServer } =
      buildNewsTimelineQueryConstraints(options, fetchLimit)

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

      posts = applyTimelinePostFilters(posts, options).slice(0, pageLimit)

      // `hasMore` and the cursor are derived from the raw docs (before the
      // client-side feed-source filter) so pagination keeps advancing even
      // when a page yields few or no displayable posts after filtering.
      return {
        posts,
        lastDoc: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: snap.docs.length === fetchLimit,
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

    const mapReelsDocs = (docs: QueryDocumentSnapshot[]) =>
      mapNewsSnapshot(docs.filter((d) => hasNewsVideoUrl(d.data() as NewsDocument)))
        .filter((p) => isPubliclyVisibleStatus(p.status))
        .filter(hasVideoContent)

    let newsPosts: Post[] = []
    let newsLastDoc: QueryDocumentSnapshot | null = null
    let newsHasMore = false

    const queryAttempts: Parameters<typeof query>[1][][] = [
      // Primary: server-side filter on hasVideo flag — fast, targeted
      [
        where('hasVideo', '==', true),
        where('status', '==', 'published'),
        orderBy('createdAt', 'desc'),
        limit(REELS_PAGE_SIZE),
        ...(lastDoc ? [startAfter(lastDoc)] : []),
      ],
      // Fallback: explicit videoUrl field
      [
        where('videoUrl', '!=', ''),
        orderBy('videoUrl'),
        orderBy('createdAt', 'desc'),
        limit(REELS_PAGE_SIZE),
        ...(lastDoc ? [startAfter(lastDoc)] : []),
      ],
    ]

    for (let attempt = 0; attempt < queryAttempts.length; attempt++) {
      const constraints = queryAttempts[attempt]
      try {
        const snap = await withTimeout(
          getDocs(query(collection(db, VIDEO_FEED_COLLECTION), ...constraints)),
          QUERY_TIMEOUT_MS,
          `getVideoFeed-attempt-${attempt}`
        )
        const posts = mapReelsDocs(snap.docs).slice(0, REELS_PAGE_SIZE)
        if (posts.length > 0 || lastDoc) {
          newsPosts = posts
          newsLastDoc = snap.docs[snap.docs.length - 1] ?? null
          newsHasMore = snap.docs.length >= REELS_PAGE_SIZE
          devLog('postService', 'getVideoFeed news hit', { raw: snap.docs.length, videos: posts.length })
          break
        }
      } catch (reelsError) {
        console.warn('[postService] getVideoFeed attempt failed:', reelsError)
      }
    }

    if (newsPosts.length > 0 || lastDoc) {
      return { posts: newsPosts, lastDoc: newsLastDoc, hasMore: newsHasMore }
    }

    // Final fallback: videos collection (AI-generated TTS audio reels)
    devLog('postService', 'getVideoFeed falling back to videos collection')
    try {
      const videosSnap = await withTimeout(
        getDocs(
          query(
            collection(db, Collections.VIDEOS),
            orderBy('createdAt', 'desc'),
            limit(REELS_PAGE_SIZE)
          )
        ),
        QUERY_TIMEOUT_MS,
        'getVideoFeed-videos-fallback'
      )

      const posts = videosSnap.docs
        .map((d) => videoDocToPost(d.id, d.data() as VideoCollectionDoc))
        .filter((p) => Boolean(p.coverImageUrl || p.title))

      devLog('postService', 'getVideoFeed audio fallback', { audioCount: posts.length })
      return { posts, lastDoc: null, hasMore: false }
    } catch (audioError) {
      console.warn('[postService] reels audio fallback failed:', audioError)
      return { posts: [], lastDoc: null, hasMore: false }
    }
  },

  /** Belirli bir kategorideki videoları çeker (reels kategori filtresi). */
  async getVideoFeedByCategory(categoryId: string, lastDoc?: QueryDocumentSnapshot) {
    const mapReelsDocs = (docs: QueryDocumentSnapshot[]) =>
      mapNewsSnapshot(docs.filter((d) => hasNewsVideoUrl(d.data() as NewsDocument)))
        .filter((p) => isPubliclyVisibleStatus(p.status))
        .filter(hasVideoContent)

    const { getHomeFeedCategoryFamily } = await import('@/constants/config')
    const family = getHomeFeedCategoryFamily(categoryId)

    try {
      const constraints = [
        where('hasVideo', '==', true),
        where('status', '==', 'published'),
        ...(family.length > 1
          ? [where('categoryId', 'in', family)]
          : [where('categoryId', '==', categoryId)]),
        orderBy('createdAt', 'desc'),
        limit(REELS_PAGE_SIZE),
        ...(lastDoc ? [startAfter(lastDoc)] : []),
      ]
      const snap = await withTimeout(
        getDocs(query(collection(db, VIDEO_FEED_COLLECTION), ...constraints)),
        QUERY_TIMEOUT_MS,
        `getVideoFeedByCategory-${categoryId}`
      )
      const posts = mapReelsDocs(snap.docs)
      return {
        posts,
        lastDoc: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: snap.docs.length >= REELS_PAGE_SIZE,
      }
    } catch (err) {
      console.warn(`[postService] getVideoFeedByCategory(${categoryId}) failed:`, err)
      return { posts: [], lastDoc: null, hasMore: false }
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

  async incrementViews(_id: string) {
    // COST PAUSE (client SDK path): article views use POST /api/news/view instead
    // (session-debounced, single FieldValue.increment). Do not re-enable direct
    // client writes here — that bypasses debounce and raises cost.
    return
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
    mediaItems?: unknown[]
    category?: string
    type?: string
    status?: string
    tags?: string[]
    location?: PostLocation | null
    citySlug?: string   // doğrudan slug (location.city'den türetilmez)
    districtSlug?: string
    spot?: string
    seoTitle?: string
    seoDescription?: string
    seoKeywords?: string[]
    isBreaking?: boolean
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
    // citySlug: doğrudan gelenler önce, yoksa location.city'den türet
    const resolvedCitySlug = data.citySlug?.trim() || (location?.city ? slugifyCity(location.city) : '')
    const cityCategory = resolvedCitySlug ? cityCategoryId(resolvedCitySlug) : ''
    const topicCategory = data.category?.trim() ?? ''
    const status = data.status ?? 'pending'

    const ref = await addDoc(collection(db, VIDEO_FEED_COLLECTION), {
      title: data.title.trim(),
      description: data.description.trim(),
      spot: data.spot?.trim() ?? '',
      seoTitle: data.seoTitle?.trim() ?? '',
      seoDescription: data.seoDescription?.trim() ?? '',
      seoKeywords: Array.isArray(data.seoKeywords) ? data.seoKeywords : [],
      isBreaking: data.isBreaking ?? false,
      author: data.author,
      authorId: data.authorId,
      thumbnail: data.thumbnail ?? '',
      coverImageUrl: data.thumbnail ?? '',
      imageUrl: data.thumbnail ?? '',
      videoUrl: data.videoUrl ?? '',
      mediaItems: Array.isArray(data.mediaItems) ? data.mediaItems : [],
      category: topicCategory || cityCategory,
      categoryId: topicCategory || cityCategory,
      city: location?.city ?? '',
      citySlug: resolvedCitySlug,
      districtSlug: data.districtSlug?.trim() ?? '',
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
      mediaItems?: unknown[]
      category?: string
      type?: string
      tags?: string[]
      location?: PostLocation | null
      // Resolved by moderation: 'published' (clean) or 'pending' (held for
      // admin approval). Defaults to 'published' to preserve prior behaviour.
      status?: 'published' | 'pending'
      spot?: string
      seoTitle?: string
      seoDescription?: string
      seoKeywords?: string[]
      isBreaking?: boolean
    }
  ): Promise<void> {
    const now = Date.now()
    const location = toFirestoreLocation(data.location)
    const citySlug = location?.city ? slugifyCity(location.city) : ''
    const cityCategory = citySlug ? cityCategoryId(citySlug) : ''
    const topicCategory = data.category?.trim() ?? ''
    const status = data.status ?? 'published'
    const slug = buildNewsSlug(data.title.trim(), id.slice(0, 8))

    await updateDoc(doc(db, VIDEO_FEED_COLLECTION, id), {
      title: data.title.trim(),
      description: data.description.trim(),
      spot: data.spot?.trim() ?? '',
      seoTitle: data.seoTitle?.trim() ?? '',
      seoDescription: data.seoDescription?.trim() ?? '',
      seoKeywords: Array.isArray(data.seoKeywords) ? data.seoKeywords : [],
      isBreaking: data.isBreaking ?? false,
      author: data.author,
      authorId: data.authorId,
      thumbnail: data.thumbnail ?? '',
      coverImageUrl: data.thumbnail ?? '',
      imageUrl: data.thumbnail ?? '',
      videoUrl: data.videoUrl ?? '',
      mediaItems: Array.isArray(data.mediaItems) ? data.mediaItems : [],
      category: topicCategory || cityCategory,
      categoryId: topicCategory || cityCategory,
      city: location?.city ?? '',
      citySlug,
      location,
      tags: data.tags ?? [],
      type: data.type ?? 'news',
      status,
      // Set slug on publish so the news detail URL (/haber/[slug]) works.
      ...(status === 'published' ? { slug } : {}),
      // A pending post is not yet live, so it has no publish time.
      publishedAt: status === 'published' ? now : null,
      updatedAt: now,
    })
  },
}
