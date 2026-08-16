import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  updateDoc,
  getCountFromServer,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from 'firebase/firestore'
import { cityCategoryId, slugifyCity, toFirestoreLocation, type PostLocation } from '@/lib/location'
import { normalizeCitySlug } from '@/constants/cities'
import { auth } from '@/lib/firebase/auth'
import { Collections, db, VIDEO_FEED_COLLECTION } from '@/lib/firebase/firestore'
import { buildFeedTeaser } from '@/lib/newsContentCleanup'
import { mapNewsSnapshot, type NewsDocument } from '@/lib/newsMapper'
import { isAdminLocalFeatured, isNationalFeaturedEligible } from '@/lib/featuredScope'
import { postService } from '@/services/postService'
import type { MediaItem, Post, PostStatus } from '@/types/post'

/** Match citySlug including district → province aliases. */
function postMatchesCitySlug(
  post: { citySlug?: string | null; city?: string | null },
  citySlug: string
): boolean {
  const want = normalizeCitySlug(citySlug)
  if (!want) return true
  const raw = post.citySlug?.trim() || post.city?.trim() || ''
  if (!raw) return false
  return normalizeCitySlug(raw) === want
}

/**
 * `MediaItem[]`'i Firestore'a güvenli yazılacak hâle getirir.
 *
 * Firebase JS SDK `undefined` değerleri reddeder; alt/credit gibi opsiyonel
 * alanlar boşsa düşürülmeli. Order alanı yoksa index ile damgalanır ki
 * okuma tarafı kararlı bir sıraya sahip olsun.
 */
function sanitizeMediaItems(items: MediaItem[] | undefined): Array<{
  type: 'image' | 'video'
  url: string
  thumbnailUrl: string | null
  caption: string | null
  alt: string | null
  credit: string | null
  order: number
}> {
  if (!Array.isArray(items)) return []
  return items
    .filter((m) => m && typeof m.url === 'string' && m.url.trim())
    .map((m, idx) => ({
      type: m.type === 'video' ? 'video' : 'image',
      url: m.url.trim(),
      thumbnailUrl: m.thumbnailUrl?.trim() || null,
      caption: m.caption?.trim() || null,
      alt: m.alt?.trim() || null,
      credit: m.credit?.trim() || null,
      order: typeof m.order === 'number' ? m.order : idx,
    }))
}

const PAGE_SIZE = 50

export type AdminNewsFilter =
  | 'all'
  | 'published'
  | 'pending'
  | 'review'
  | 'duplicate'
  | 'draft'
  | 'removed'
  | 'featured'
  | 'local-featured'

/** Admin list sort — date = newest first; views = viewsCount desc. */
export type AdminNewsSort = 'date' | 'views'

export type AdminNewsSource = 'news' | 'newsDrafts' | 'newsQueue'

export interface AdminNewsItem extends Post {
  adminSource: AdminNewsSource
  /** FB/IG/X feed post olarak paylaşılmış mı */
  socialPublished?: boolean
  /** IG/FB hikâye olarak paylaşılmış mı */
  storyPublished?: boolean
}

function withSocialFlags(post: Post, data: Record<string, unknown>, adminSource: AdminNewsSource): AdminNewsItem {
  return {
    ...post,
    adminSource,
    socialPublished: data.socialPublished === true,
    storyPublished: data.storyPublished === true,
    needsReview: data.needsReview === true || post.needsReview === true,
    aiAutoPublished: data.aiAutoPublished === true || post.aiAutoPublished === true,
  }
}

async function adminFetch(path: string, method: 'POST' | 'DELETE', body?: object): Promise<void> {
  const user = auth.currentUser
  if (!user) throw new Error('Giriş gerekli')
  const token = await user.getIdToken()
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? 'İşlem başarısız')
  }
}

/** Duplikat / tekrarlayan audit stub — Onay Bekliyor dışında tutulur. */
export function isDuplicateNewsData(data: NewsDocument | Record<string, unknown>): boolean {
  return data.isDuplicate === true || data.categoryId === 'tekrarlayan'
}

const VISIBLE_COUNT_CAP = 400

/** Count docs matching `base` after dropping duplicate/tekrar stubs (same rule as the list). */
async function countVisibleDocs(colName: string, base: QueryConstraint[]): Promise<number> {
  const countSnap = await getCountFromServer(query(collection(db, colName), ...base)).catch(() => null)
  const raw = countSnap?.data().count ?? 0
  if (raw <= 0) return 0
  const take = Math.min(raw, VISIBLE_COUNT_CAP)
  const snap = await getDocs(query(collection(db, colName), ...base, limit(take)))
  return snap.docs.filter((d) => !isDuplicateNewsData(d.data() as NewsDocument)).length
}

/** Sidebar / header / dashboard: only items that appear on Onay Bekleyenler. */
export async function countVisiblePendingApprovals(): Promise<number> {
  const [drafts, legacy] = await Promise.all([
    countVisibleDocs(Collections.NEWS_DRAFTS, [where('draftStatus', '==', 'pending_review')]),
    countVisibleDocs(VIDEO_FEED_COLLECTION, [where('status', '==', 'pending')]),
  ])
  return drafts + legacy
}

function draftDocToPost(id: string, data: NewsDocument): AdminNewsItem {
  const post = adminNewsDocToPost(id, data)
  const draftStatus = String((data as { draftStatus?: unknown }).draftStatus ?? '')
  const isDup = isDuplicateNewsData(data)
  // Rejected / duplicate stubs must not look like "Onay Bekliyor" (Bekliyor badge).
  // Keep approve UI possible via isDuplicate + TEKRAR; status reflects stub state.
  const status: PostStatus =
    isDup || draftStatus === 'rejected'
      ? 'archived'
      : draftStatus === 'approved'
        ? 'published'
        : 'pending'
  return {
    ...withSocialFlags(post, data as Record<string, unknown>, 'newsDrafts'),
    status,
    isDuplicate: isDup || post.isDuplicate === true,
  }
}

function adminNewsDocToPost(id: string, data: NewsDocument): Post {
  const mapped = mapNewsSnapshot([{ id, data: () => data }])[0]
  if (mapped) return mapped

  const createdAt =
    typeof data.createdAt === 'number'
      ? new Date(data.createdAt < 1_000_000_000_000 ? data.createdAt * 1000 : data.createdAt).toISOString()
      : new Date().toISOString()

  const author = data.author?.trim() || 'nahaber'
  const title = data.title?.trim() || 'Başlıksız'
  const content = data.description?.trim() || data.content?.trim() || ''
  const summary = data.summary?.trim() || content.slice(0, 280)
  return {
    id,
    title,
    slug: id,
    content,
    summary,
    feedTeaser: buildFeedTeaser(title, summary, content),
    spot: data.spot?.trim() || '',
    seoTitle: data.seoTitle?.trim() || '',
    seoDescription: data.seoDescription?.trim() || '',
    seoKeywords: Array.isArray(data.seoKeywords) ? data.seoKeywords : [],
    authorId: data.authorId?.trim() || author,
    authorUsername: author,
    authorDisplayName: author,
    authorPhotoURL: null,
    categoryId: data.categoryId?.trim() || data.category?.trim() || '',
    city: data.city?.trim() || null,
    citySlug: data.citySlug?.trim() || null,
    location: data.location ?? null,
    tags: Array.isArray(data.tags) ? data.tags.filter(Boolean) : [],
    postType: 'news',
    source: 'NaHaber',
    mediaItems: [],
    additionalImages: Array.isArray(data.additionalImages)
      ? data.additionalImages
          .filter((img) => img?.url?.trim())
          .map((img) => ({
            url: img.url!.trim(),
            caption: img.caption?.trim() ?? '',
          }))
      : [],
    coverImageUrl: data.thumbnail?.trim() || null,
    status: (data.status as PostStatus) ?? 'draft',
    visibility: 'public',
    likesCount: data.likesCount ?? 0,
    commentsCount: data.commentCount ?? data.commentsCount ?? 0,
    savesCount: data.savesCount ?? 0,
    sharesCount: data.sharesCount ?? 0,
    viewsCount: data.viewsCount ?? 0,
    isEditorPick: data.featured === true || data.isEditorPick === true,
    featured: data.featured === true || data.isEditorPick === true,
    localFeatured: data.localFeatured === true,
    isTrending: false,
    publishedAt: null,
    createdAt,
    updatedAt: createdAt,
  }
}

function statusConstraint(filter: AdminNewsFilter): Parameters<typeof where>[2] | null {
  switch (filter) {
    case 'published':
      return 'published'
    case 'pending':
      return 'pending'
    case 'draft':
      return 'draft'
    case 'removed':
      return null
    default:
      return null
  }
}

function timestampToMs(raw: unknown): number {
  if (typeof raw === 'number') {
    return raw < 1_000_000_000_000 ? raw * 1000 : raw
  }
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  if (raw && typeof raw === 'object' && 'toMillis' in raw && typeof (raw as { toMillis: () => number }).toMillis === 'function') {
    return (raw as { toMillis: () => number }).toMillis()
  }
  if (raw && typeof raw === 'object' && 'seconds' in raw) {
    return Number((raw as { seconds: number }).seconds) * 1000
  }
  return 0
}

function docCreatedAtMs(data: NewsDocument): number {
  return (
    timestampToMs(data.createdAt) ||
    timestampToMs(data.updatedAt) ||
    timestampToMs(data.publishedAt) ||
    timestampToMs((data as { sourcePublishedAt?: unknown }).sourcePublishedAt) ||
    0
  )
}

function mapAdminNewsDocs(
  docs: QueryDocumentSnapshot[],
  filter: AdminNewsFilter,
  categoryId?: string,
  citySlug?: string,
  sort: AdminNewsSort = 'date'
): AdminNewsItem[] {
  const sorted = [...docs].sort(
    (a, b) =>
      docCreatedAtMs(b.data() as NewsDocument) - docCreatedAtMs(a.data() as NewsDocument)
  )

  let posts: AdminNewsItem[] = sorted.map((d) => {
    const data = d.data() as NewsDocument
    return withSocialFlags(adminNewsDocToPost(d.id, data), data as Record<string, unknown>, 'news')
  })

  // Enforce the category filter in-memory. The query fallbacks below may drop the
  // `where('categoryId', ...)` clause (composite-index gaps), which would otherwise
  // leak other categories into a category-filtered admin view.
  if (categoryId) {
    posts = posts.filter((p) => p.categoryId === categoryId)
  }

  // Enforce citySlug in-memory for fallback queries that may drop the constraint.
  // Normalize so ilçe / legacy slug aliases still match the selected province chip.
  if (citySlug) {
    posts = posts.filter((p) => postMatchesCitySlug(p, citySlug))
  }

  if (filter === 'removed') {
    posts = posts.filter((p) => p.status === 'archived' || p.status === 'banned')
  } else if (filter === 'featured') {
    posts = posts.filter(
      (p) =>
        p.featured === true &&
        isNationalFeaturedEligible({ categoryId: p.categoryId, citySlug: p.citySlug })
    )
  } else if (filter === 'local-featured') {
    posts = posts.filter((p) =>
      isAdminLocalFeatured({
        categoryId: p.categoryId,
        citySlug: p.citySlug,
        featured: p.featured,
        localFeatured: p.localFeatured,
      })
    )
  } else if (filter === 'published') {
    posts = posts.filter((p) => p.status === 'published')
  } else if (filter === 'draft') {
    posts = posts.filter((p) => p.status === 'draft')
  }

  if (sort === 'views') {
    posts.sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0))
  } else {
    posts.sort((a, b) => {
      const aMs = Date.parse(a.createdAt) || 0
      const bMs = Date.parse(b.createdAt) || 0
      return bMs - aMs
    })
  }
  return posts
}

async function fetchAdminNewsSnap(constraints: QueryConstraint[]) {
  return getDocs(query(collection(db, VIDEO_FEED_COLLECTION), ...constraints))
}

export const adminNewsService = {
  async list(
    filter: AdminNewsFilter = 'all',
    lastDoc?: QueryDocumentSnapshot,
    categoryId?: string,
    limitOverride?: number,
    citySlug?: string,
    sort: AdminNewsSort = 'date'
  ): Promise<{ posts: AdminNewsItem[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
    const pageSize = limitOverride ?? PAGE_SIZE
    if (filter === 'pending') {
      return listPendingQueue(lastDoc, sort)
    }

    if (filter === 'review') {
      return listReviewQueue(lastDoc, categoryId, limitOverride, citySlug, sort)
    }

    if (filter === 'duplicate') {
      return listDuplicateNews(lastDoc, categoryId, limitOverride, citySlug, sort)
    }

    const status = statusConstraint(filter)
    const filterConstraints: QueryConstraint[] = []
    if (filter === 'featured') filterConstraints.push(where('featured', '==', true))
    if (filter === 'local-featured') filterConstraints.push(where('localFeatured', '==', true))
    if (filter === 'removed') filterConstraints.push(where('status', 'in', ['archived', 'banned']))
    else if (status) filterConstraints.push(where('status', '==', status))
    if (categoryId) filterConstraints.push(where('categoryId', '==', categoryId))
    if (citySlug) filterConstraints.push(where('citySlug', '==', citySlug))

    const viewsOverFetch = Math.max(pageSize * 10, 500)

    // Draft/pending rows often lack createdAt/publishedAt. Firestore orderBy on a
    // missing field returns an empty snapshot (success) — so we must keep trying
    // weaker queries when a status filter yields zero docs.
    // createdAt is tried first so the server-side fetch order matches the
    // client-side sort in mapAdminNewsDocs — otherwise updatedAt-ordered fetches
    // can return recently-edited old articles while newer articles fall outside
    // the page window.
    // views: prefer real viewsCount ordering; fall back to over-fetch + in-memory sort
    // when composite indexes (categoryId/status + viewsCount) are missing.
    const queryAttempts: QueryConstraint[][] =
      sort === 'views'
        ? [
            [
              ...filterConstraints,
              orderBy('viewsCount', 'desc'),
              ...(lastDoc ? [startAfter(lastDoc)] : []),
              limit(pageSize),
            ],
            [...filterConstraints, orderBy('viewsCount', 'desc'), limit(pageSize)],
            [...filterConstraints, orderBy('createdAt', 'desc'), limit(viewsOverFetch)],
            [...filterConstraints, limit(viewsOverFetch)],
            [orderBy('viewsCount', 'desc'), limit(viewsOverFetch)],
            [limit(viewsOverFetch)],
          ]
        : [
            [
              ...filterConstraints,
              orderBy('createdAt', 'desc'),
              ...(lastDoc ? [startAfter(lastDoc)] : []),
              limit(pageSize),
            ],
            [
              ...filterConstraints,
              orderBy('updatedAt', 'desc'),
              ...(lastDoc ? [startAfter(lastDoc)] : []),
              limit(pageSize),
            ],
            [...filterConstraints, orderBy('publishedAt', 'desc'), limit(pageSize)],
            [...filterConstraints, limit(pageSize * 2)],
            [limit(Math.max(pageSize * 3, 150))],
          ]

    let lastError: unknown = null
    for (let i = 0; i < queryAttempts.length; i++) {
      const constraints = queryAttempts[i]!
      const isLast = i === queryAttempts.length - 1
      // First two views attempts use orderBy('viewsCount') — cursor pagination is valid there.
      const isViewsOrderedAttempt = sort === 'views' && i <= 1
      try {
        const snap = await fetchAdminNewsSnap(constraints)
        let allFiltered = mapAdminNewsDocs(snap.docs, filter, categoryId, citySlug, sort)
        if (filter === 'local-featured' && !lastDoc) {
          try {
            const featSnap = await fetchAdminNewsSnap([
              where('featured', '==', true),
              orderBy('createdAt', 'desc'),
              limit(Math.max(pageSize * 2, 100)),
            ])
            const extra = mapAdminNewsDocs(
              featSnap.docs,
              'local-featured',
              categoryId,
              citySlug,
              sort
            )
            const byId = new Map(allFiltered.map((p) => [p.id, p]))
            for (const p of extra) byId.set(p.id, p)
            allFiltered = [...byId.values()]
            if (sort === 'views') {
              allFiltered.sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0))
            } else {
              allFiltered.sort(
                (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
              )
            }
          } catch {
            /* featured merge is best-effort for legacy yerel pins */
          }
        }
        const posts = allFiltered.slice(0, pageSize)
        // Empty ordered query ≠ "no drafts" — try next attempt while filter is set.
        const hasServerFilter = !!(
          status ||
          filter === 'removed' ||
          filter === 'featured' ||
          filter === 'local-featured' ||
          citySlug ||
          categoryId
        )
        if (posts.length === 0 && hasServerFilter && !isLast) continue
        // Classic cursor pagination only when Firestore already ordered by viewsCount;
        // over-fetch fallbacks are a single ranked page (same as search/city bulk).
        const hasMore =
          sort === 'views'
            ? isViewsOrderedAttempt && posts.length >= pageSize && snap.docs.length >= pageSize
            : posts.length >= pageSize
        return {
          posts,
          lastDoc: snap.docs[snap.docs.length - 1] ?? null,
          hasMore,
        }
      } catch (error) {
        lastError = error
        console.warn('[adminNewsService] list attempt failed:', error)
      }
    }

    console.error('[adminNewsService] all list attempts failed:', lastError)
    throw lastError instanceof Error ? lastError : new Error('Haberler yüklenemedi')
  },

  async getById(id: string): Promise<Post | null> {
    const snap = await getDoc(doc(db, VIDEO_FEED_COLLECTION, id))
    if (snap.exists()) {
      return adminNewsDocToPost(snap.id, snap.data() as NewsDocument)
    }

    // Onay kuyruğundaki haberler newsDrafts'ta olabilir
    const draftSnap = await getDoc(doc(db, Collections.NEWS_DRAFTS, id))
    if (!draftSnap.exists()) return null
    return draftDocToPost(draftSnap.id, draftSnap.data() as NewsDocument)
  },

  async approve(id: string, source: AdminNewsSource = 'news'): Promise<void> {
    if (source === 'newsQueue') {
      await adminFetch(`/api/admin/news-queue/${id}/approve`, 'POST')
      return
    }
    if (source === 'newsDrafts') {
      await adminFetch(`/api/admin/news-drafts/${id}/approve`, 'POST')
      return
    }

    try {
      await adminFetch(`/api/admin/news/${id}/approve`, 'POST')
    } catch {
      const now = Date.now()
      await updateDoc(doc(db, VIDEO_FEED_COLLECTION, id), {
        status: 'published',
        publishedAt: now,
        updatedAt: now,
        needsReview: false,
        needsAdminReview: false,
        reviewedAt: now,
        moderationNote: null,
      })
    }
  },

  async reject(id: string, source: AdminNewsSource = 'news', reason?: string): Promise<void> {
    if (source === 'newsQueue') {
      await adminFetch(`/api/admin/news-queue/${id}/reject`, 'POST', { reason })
      return
    }
    if (source === 'newsDrafts') {
      await adminFetch(`/api/admin/news-drafts/${id}/reject`, 'POST', { reason })
      return
    }

    const now = Date.now()
    await updateDoc(doc(db, VIDEO_FEED_COLLECTION, id), {
      status: 'draft',
      publishedAt: null,
      updatedAt: now,
      moderationNote: reason?.trim() || 'Admin tarafından reddedildi',
    })
  },

  async remove(id: string, _reason?: string, source?: AdminNewsSource): Promise<void> {
    if (source === 'newsQueue') {
      await adminFetch(`/api/admin/news-queue/${id}/reject`, 'POST', { reason: 'Kaldırıldı' })
      return
    }
    // Server-side route: archives + revalidates ISR cache
    await adminFetch(`/api/admin/news/${id}`, 'DELETE' as never)
  },

  /** Taslakları (draft) kalıcı olarak Firestore'dan siler. */
  async permanentDelete(id: string, source?: AdminNewsSource): Promise<void> {
    if (source === 'newsQueue') {
      await adminFetch(`/api/admin/news-queue/${id}/reject`, 'POST', { reason: 'Kalıcı olarak silindi' })
      return
    }
    // Server-side route: hard-deletes + revalidates ISR cache
    await adminFetch(`/api/admin/news/${id}?permanent=true`, 'DELETE' as never)
  },

  async createAdminNews(data: {
    title: string
    description: string
    spot?: string
    seoTitle?: string
    seoDescription?: string
    seoKeywords?: string[]
    category?: string
    city?: string
    citySlug?: string
    districtSlug?: string
    thumbnail?: string
    videoUrl?: string
    mediaItems?: MediaItem[]
    draftId?: string | null
    tags?: string[]
    isBreaking?: boolean
    authorId: string
    authorUsername: string
  }): Promise<string> {
    const location: PostLocation | null = data.city?.trim()
      ? { city: data.city.trim(), country: 'Türkiye', lat: 0, lng: 0 }
      : null
    const sanitizedMedia = sanitizeMediaItems(data.mediaItems)

    if (data.draftId) {
      await postService.publishNews(data.draftId, {
        title: data.title,
        description: data.description,
        author: 'nahaber',
        authorId: data.authorId,
        thumbnail: data.thumbnail,
        videoUrl: data.videoUrl,
        mediaItems: sanitizedMedia,
        category: data.category,
        tags: data.tags,
        location,
        status: 'published',
        type: 'news',
        spot: data.spot,
        seoTitle: data.seoTitle,
        seoDescription: data.seoDescription,
      })
      return data.draftId
    }

    return postService.createNews({
      title: data.title,
      description: data.description,
      author: 'nahaber',
      authorId: data.authorId,
      thumbnail: data.thumbnail,
      videoUrl: data.videoUrl,
      mediaItems: sanitizedMedia,
      category: data.category,
      tags: data.tags,
      location,
      citySlug: data.citySlug?.trim() || undefined,
      districtSlug: data.districtSlug?.trim() || undefined,
      status: 'published',
      type: 'news',
      spot: data.spot,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
      seoKeywords: data.seoKeywords,
      isBreaking: data.isBreaking ?? false,
    })
  },

  async updateAdminNews(
    id: string,
    data: {
      title: string
      description: string
      spot?: string
      seoTitle?: string
      seoDescription?: string
      category?: string
      city?: string
      thumbnail?: string
      videoUrl?: string
      mediaItems?: MediaItem[]
      tags?: string[]
      status?: PostStatus
    }
  ): Promise<void> {
    const location = toFirestoreLocation(
      data.city?.trim()
        ? { city: data.city.trim(), country: 'Türkiye', lat: 0, lng: 0 }
        : null
    )
    const citySlug = location?.city ? slugifyCity(location.city) : ''
    const cityCategory = citySlug ? cityCategoryId(citySlug) : ''
    const topicCategory = data.category?.trim() ?? ''
    const now = Date.now()
    const status = data.status ?? 'published'
    const sanitizedMedia = sanitizeMediaItems(data.mediaItems)

    const finalCategoryId = topicCategory || cityCategory
    await updateDoc(doc(db, VIDEO_FEED_COLLECTION, id), {
      title: data.title.trim(),
      description: data.description.trim(),
      thumbnail: data.thumbnail ?? '',
      coverImageUrl: data.thumbnail ?? '',
      imageUrl: data.thumbnail ?? '',
      videoUrl: data.videoUrl ?? '',
      mediaItems: sanitizedMedia,
      category: finalCategoryId,
      categoryId: finalCategoryId,
      // Kategori son-dakika değilse isBreaking temizle
      isBreaking: finalCategoryId === 'son-dakika',
      city: location?.city ?? '',
      citySlug,
      location,
      tags: data.tags ?? [],
      spot: data.spot?.trim() || '',
      seoTitle: data.seoTitle?.trim() || '',
      seoDescription: data.seoDescription?.trim() || '',
      status,
      publishedAt: status === 'published' ? now : null,
      updatedAt: now,
    })
  },

  /**
   * Tag'e göre Firestore array-contains sorgusu — tüm arşivde arama yapar.
   * Admin arama kutusunda kullanılır: normal list(500) limitinin dışındaki
   * eski haberleri de bulur.
   */
  async searchByTag(rawTerm: string): Promise<AdminNewsItem[]> {
    const term = rawTerm.trim()
    if (!term) return []

    const variants = new Set<string>([
      term.toLocaleLowerCase('tr-TR'),
      term.charAt(0).toUpperCase() + term.slice(1),
      term,
    ])

    const seen = new Set<string>()
    const results: AdminNewsItem[] = []

    await Promise.allSettled(
      [...variants].map(async (variant) => {
        try {
          const snap = await getDocs(
            query(
              collection(db, VIDEO_FEED_COLLECTION),
              where('tags', 'array-contains', variant),
              limit(200)
            )
          )
          for (const d of snap.docs) {
            if (!seen.has(d.id)) {
              seen.add(d.id)
              const data = d.data() as NewsDocument
              results.push(withSocialFlags(adminNewsDocToPost(d.id, data), data as Record<string, unknown>, 'news'))
            }
          }
        } catch {
          // composite index eksik olabilir — sessizce atla
        }
      })
    )

    return results.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  },

  async countByStatus(): Promise<Record<string, number>> {
    // Eski yaklaşım: getDocs(limit(500)) → 500 döküman tam okuma
    // Yeni yaklaşım: getCountFromServer — sadece index taraması, döküman okumaz
    const statuses = ['published', 'pending', 'draft', 'archived', 'banned'] as const
    const counts: Record<string, number> = { total: 0 }

    try {
      const snaps = await Promise.all(
        statuses.map((s) =>
          getCountFromServer(
            query(collection(db, VIDEO_FEED_COLLECTION), where('status', '==', s))
          ).catch(() => null)
        )
      )
      let total = 0
      statuses.forEach((s, i) => {
        const n = snaps[i]?.data().count ?? 0
        counts[s] = n
        total += n
      })
      counts.total = total
    } catch {
      counts.total = 0
    }
    try {
      const draftSnap = await getCountFromServer(
        query(
          collection(db, Collections.NEWS_DRAFTS),
          where('draftStatus', '==', 'pending_review')
        )
      )
      let pendingReview = draftSnap.data().count
      // Tekrar haber stub'ları Onay Bekliyor sayacına girmesin (liste ile aynı kural)
      try {
        const dupPendingSnap = await getCountFromServer(
          query(
            collection(db, Collections.NEWS_DRAFTS),
            where('draftStatus', '==', 'pending_review'),
            where('isDuplicate', '==', true)
          )
        )
        pendingReview = Math.max(0, pendingReview - dupPendingSnap.data().count)
      } catch {
        /* compound index yoksa listPendingQueue client filter yeterli */
      }
      try {
        const tekrarSnap = await getCountFromServer(
          query(
            collection(db, Collections.NEWS_DRAFTS),
            where('draftStatus', '==', 'pending_review'),
            where('categoryId', '==', 'tekrarlayan')
          )
        )
        let tekrarOnly = tekrarSnap.data().count
        // isDuplicate + tekrarlayan çift sayımını düş
        try {
          const bothSnap = await getCountFromServer(
            query(
              collection(db, Collections.NEWS_DRAFTS),
              where('draftStatus', '==', 'pending_review'),
              where('categoryId', '==', 'tekrarlayan'),
              where('isDuplicate', '==', true)
            )
          )
          tekrarOnly = Math.max(0, tekrarOnly - bothSnap.data().count)
        } catch {
          /* ignore */
        }
        pendingReview = Math.max(0, pendingReview - tekrarOnly)
      } catch {
        /* ignore */
      }
      counts.pending_review = pendingReview
      counts.pending = (counts.pending ?? 0) + pendingReview
    } catch {
      counts.pending_review = 0
    }
    // Legacy news: pending + isDuplicate / tekrarlayan → yalnızca Tekrar Haber
    try {
      const dupNewsPending = await getCountFromServer(
        query(
          collection(db, VIDEO_FEED_COLLECTION),
          where('status', '==', 'pending'),
          where('isDuplicate', '==', true)
        )
      )
      counts.pending = Math.max(0, (counts.pending ?? 0) - dupNewsPending.data().count)
    } catch {
      /* ignore */
    }
    try {
      const tekrarNewsPending = await getCountFromServer(
        query(
          collection(db, VIDEO_FEED_COLLECTION),
          where('status', '==', 'pending'),
          where('categoryId', '==', 'tekrarlayan')
        )
      )
      let tekrarOnly = tekrarNewsPending.data().count
      try {
        const bothSnap = await getCountFromServer(
          query(
            collection(db, VIDEO_FEED_COLLECTION),
            where('status', '==', 'pending'),
            where('categoryId', '==', 'tekrarlayan'),
            where('isDuplicate', '==', true)
          )
        )
        tekrarOnly = Math.max(0, tekrarOnly - bothSnap.data().count)
      } catch {
        /* ignore */
      }
      counts.pending = Math.max(0, (counts.pending ?? 0) - tekrarOnly)
    } catch {
      /* ignore */
    }
    try {
      const reviewSnap = await getCountFromServer(
        query(collection(db, VIDEO_FEED_COLLECTION), where('needsReview', '==', true))
      )
      counts.review = reviewSnap.data().count
    } catch {
      counts.review = 0
    }

    return counts
  },

  async countNavBadges(): Promise<{
    pending: number
    draft: number
    published: number
    scheduled: number
    smmQueue: number
  }> {
    const [pending, draftSnap, publishedSnap, smmSnap] = await Promise.all([
      countVisiblePendingApprovals(),
      getCountFromServer(
        query(collection(db, VIDEO_FEED_COLLECTION), where('status', '==', 'draft'))
      ).catch(() => null),
      getCountFromServer(
        query(collection(db, VIDEO_FEED_COLLECTION), where('status', '==', 'published'))
      ).catch(() => null),
      getCountFromServer(
        query(collection(db, Collections.SMM_QUEUE), where('status', '==', 'queued'))
      ).catch(() => null),
    ])
    return {
      pending,
      draft: draftSnap?.data().count ?? 0,
      published: publishedSnap?.data().count ?? 0,
      scheduled: 0,
      smmQueue: smmSnap?.data().count ?? 0,
    }
  },
}

function queueDocToPost(id: string, data: Record<string, unknown>): AdminNewsItem {
  const input = (data.input ?? {}) as Record<string, unknown>
  const queueStatus = String(data.status ?? 'pending')
  const statusLabel = queueStatus === 'skipped' ? '⏭️ ' : queueStatus === 'processing' ? '⚙️ ' : ''
  const title = statusLabel + (String(input.originalTitle ?? '').trim() || 'Başlıksız (kuyruk)')
  const summary = String(input.originalSummary ?? '').trim()
  const content = String(input.originalContent ?? '').trim()
  const imageUrl = String(input.imageUrl ?? '').trim()
  const sourceLabel = String(input.sourceLabel ?? data.workerId ?? '').trim()
  const categoryId = String(input.forcedCategoryId ?? '').trim()
  const citySlug = String(input.forcedCitySlug ?? '').trim()
  const city = String(input.forcedCity ?? '').trim()
  const createdAtRaw = data.createdAt as number | undefined
  const createdAt = createdAtRaw
    ? new Date(createdAtRaw < 1_000_000_000_000 ? createdAtRaw * 1000 : createdAtRaw).toISOString()
    : new Date().toISOString()

  return {
    id,
    title,
    slug: id,
    content,
    summary: summary || content.slice(0, 280),
    feedTeaser: summary || title,
    spot: '',
    seoTitle: '',
    seoDescription: '',
    seoKeywords: [],
    authorId: 'nahaber',
    authorUsername: 'nahaber',
    authorDisplayName: sourceLabel || 'Kuyruk',
    authorPhotoURL: null,
    categoryId,
    city: city || null,
    citySlug: citySlug || null,
    location: null,
    tags: Array.isArray(input.extraTags) ? (input.extraTags as string[]) : [],
    postType: 'news',
    source: sourceLabel,
    mediaItems: [],
    additionalImages: [],
    coverImageUrl: imageUrl || null,
    status: 'pending',
    visibility: 'public',
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    isEditorPick: false,
    featured: false,
    localFeatured: false,
    isTrending: false,
    publishedAt: null,
    createdAt,
    updatedAt: createdAt,
    adminSource: 'newsQueue',
  }
}

/** AI auto-published items awaiting post-publish human review (CMS İnceleme). */
async function listReviewQueue(
  lastDoc?: QueryDocumentSnapshot,
  categoryId?: string,
  limitOverride?: number,
  citySlug?: string,
  sort: AdminNewsSort = 'date'
): Promise<{ posts: AdminNewsItem[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
  const pageSize = limitOverride ?? PAGE_SIZE
  const filterConstraints: QueryConstraint[] = [where('needsReview', '==', true)]
  if (categoryId) filterConstraints.push(where('categoryId', '==', categoryId))
  if (citySlug) filterConstraints.push(where('citySlug', '==', citySlug))

  const queryAttempts: QueryConstraint[][] =
    sort === 'views'
      ? [
          [...filterConstraints, orderBy('viewsCount', 'desc'), ...(lastDoc ? [startAfter(lastDoc)] : []), limit(pageSize)],
          [...filterConstraints, orderBy('viewsCount', 'desc'), limit(pageSize)],
          [...filterConstraints, orderBy('createdAt', 'desc'), limit(Math.max(pageSize * 10, 500))],
          [...filterConstraints, limit(Math.max(pageSize * 10, 500))],
          [where('needsReview', '==', true), limit(Math.max(pageSize * 3, 150))],
        ]
      : [
          [...filterConstraints, orderBy('createdAt', 'desc'), ...(lastDoc ? [startAfter(lastDoc)] : []), limit(pageSize)],
          [...filterConstraints, orderBy('updatedAt', 'desc'), ...(lastDoc ? [startAfter(lastDoc)] : []), limit(pageSize)],
          [...filterConstraints, orderBy('publishedAt', 'desc'), limit(pageSize)],
          [...filterConstraints, limit(pageSize * 2)],
          [where('needsReview', '==', true), limit(Math.max(pageSize * 3, 150))],
        ]

  let lastError: unknown = null
  for (let i = 0; i < queryAttempts.length; i++) {
    const constraints = queryAttempts[i]!
    const isLast = i === queryAttempts.length - 1
    try {
      const snap = await fetchAdminNewsSnap(constraints)
      // Badge/"İnceledim" key off needsReview — do NOT also require status=published
      // (that wiped the İnceleme filter while Tümü still showed violet badges).
      const posts = mapAdminNewsDocs(snap.docs, 'all', categoryId, citySlug, sort).filter(
        (p) => p.needsReview === true
      )
      if (posts.length === 0 && !isLast) continue
      const sliced = posts.slice(0, pageSize)
      return {
        posts: sliced,
        lastDoc: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: sort === 'views' ? i <= 1 && sliced.length >= pageSize : sliced.length >= pageSize,
      }
    } catch (error) {
      lastError = error
      console.warn('[adminNewsService] review list attempt failed:', error)
    }
  }

  console.error('[adminNewsService] review list failed:', lastError)
  throw lastError instanceof Error ? lastError : new Error('İnceleme listesi yüklenemedi')
}

/** Tekrar haberler: newsDrafts audit stub'ları + news.isDuplicate (editorial review). */
async function listDuplicateNews(
  lastDoc?: QueryDocumentSnapshot,
  categoryId?: string,
  limitOverride?: number,
  citySlug?: string,
  sort: AdminNewsSort = 'date'
): Promise<{ posts: AdminNewsItem[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
  const pageSize = limitOverride ?? PAGE_SIZE
  const items: AdminNewsItem[] = []
  const seen = new Set<string>()

  const draftAttempts: QueryConstraint[][] = [
    [
      where('isDuplicate', '==', true),
      orderBy('createdAt', 'desc'),
      ...(lastDoc ? [startAfter(lastDoc)] : []),
      limit(pageSize),
    ],
    [where('isDuplicate', '==', true), orderBy('updatedAt', 'desc'), limit(pageSize)],
    [where('isDuplicate', '==', true), limit(pageSize)],
    [where('categoryId', '==', 'tekrarlayan'), orderBy('createdAt', 'desc'), limit(pageSize)],
    [where('categoryId', '==', 'tekrarlayan'), limit(pageSize)],
  ]

  let draftLastDoc: QueryDocumentSnapshot | null = null
  for (const constraints of draftAttempts) {
    try {
      const snap = await getDocs(query(collection(db, Collections.NEWS_DRAFTS), ...constraints))
      if (snap.empty && constraints !== draftAttempts[draftAttempts.length - 1]) continue
      for (const d of snap.docs) {
        const data = d.data() as NewsDocument
        if (data.isDuplicate !== true && data.categoryId !== 'tekrarlayan') continue
        if (seen.has(d.id)) continue
        seen.add(d.id)
        items.push(draftDocToPost(d.id, data))
      }
      draftLastDoc = snap.docs[snap.docs.length - 1] ?? null
      if (items.length > 0) break
    } catch (err) {
      console.warn('[adminNewsService] duplicate drafts attempt failed:', err)
    }
  }

  if (items.length < pageSize) {
    const newsAttempts: QueryConstraint[][] = [
      [where('isDuplicate', '==', true), orderBy('createdAt', 'desc'), limit(pageSize - items.length)],
      [where('isDuplicate', '==', true), orderBy('updatedAt', 'desc'), limit(pageSize - items.length)],
      [where('isDuplicate', '==', true), limit(pageSize - items.length)],
    ]
    for (const constraints of newsAttempts) {
      try {
        const snap = await fetchAdminNewsSnap(constraints)
        if (snap.empty && constraints !== newsAttempts[newsAttempts.length - 1]) continue
        for (const d of snap.docs) {
          if (seen.has(d.id)) continue
          seen.add(d.id)
          const data = d.data() as NewsDocument
          items.push(withSocialFlags(adminNewsDocToPost(d.id, data), data as Record<string, unknown>, 'news'))
        }
        if (items.length > 0) break
      } catch (err) {
        console.warn('[adminNewsService] duplicate news attempt failed:', err)
      }
    }
  }

  let posts = items
  if (categoryId) posts = posts.filter((p) => p.categoryId === categoryId)
  if (citySlug) posts = posts.filter((p) => postMatchesCitySlug(p, citySlug))

  if (sort === 'views') {
    posts.sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0))
  } else {
    posts.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }
  const sliced = posts.slice(0, pageSize)

  return {
    posts: sliced,
    lastDoc: draftLastDoc,
    hasMore: items.length >= pageSize,
  }
}

async function listPendingQueue(
  lastDoc?: QueryDocumentSnapshot,
  sort: AdminNewsSort = 'date'
): Promise<{ posts: AdminNewsItem[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
  const items: AdminNewsItem[] = []
  // Over-fetch so skipping duplicate stubs still fills a page
  const fetchLimit = Math.max(PAGE_SIZE * 3, 150)

  try {
    // 1. newsDrafts pending_review — skip duplicate stubs; don't stop on an all-dup page
    const draftAttemptConstraints: QueryConstraint[][] = [
      [
        where('draftStatus', '==', 'pending_review'),
        orderBy('createdAt', 'desc'),
        ...(lastDoc ? [startAfter(lastDoc)] : []),
        limit(fetchLimit),
      ],
      [where('draftStatus', '==', 'pending_review'), limit(fetchLimit)],
    ]

    let draftLastDoc: QueryDocumentSnapshot | null = null
    let draftDocCount = 0
    for (const constraints of draftAttemptConstraints) {
      try {
        const snap = await getDocs(query(collection(db, Collections.NEWS_DRAFTS), ...constraints))
        if (snap.empty && constraints !== draftAttemptConstraints[draftAttemptConstraints.length - 1]) {
          continue
        }
        let added = 0
        for (const d of snap.docs) {
          const data = d.data() as NewsDocument
          if (isDuplicateNewsData(data)) continue
          items.push(draftDocToPost(d.id, data))
          added += 1
          if (items.length >= PAGE_SIZE) break
        }
        draftLastDoc = snap.docs[snap.docs.length - 1] ?? null
        draftDocCount = snap.docs.length
        if (added > 0 || constraints === draftAttemptConstraints[draftAttemptConstraints.length - 1]) break
      } catch (err) {
        console.warn('[adminNewsService] pending_review attempt failed:', err)
      }
    }

    // 2. Legacy news collection with status=pending (exclude isDuplicate / tekrarlayan)
    if (items.length < PAGE_SIZE) {
      const legacyAttempts: QueryConstraint[][] = [
        [where('status', '==', 'pending'), orderBy('createdAt', 'desc'), limit(fetchLimit)],
        [where('status', '==', 'pending'), limit(fetchLimit)],
      ]
      for (const constraints of legacyAttempts) {
        try {
          const legacySnap = await getDocs(query(collection(db, VIDEO_FEED_COLLECTION), ...constraints))
          if (legacySnap.empty && constraints !== legacyAttempts[legacyAttempts.length - 1]) continue
          let added = 0
          for (const d of legacySnap.docs) {
            const data = d.data() as NewsDocument
            if (isDuplicateNewsData(data)) continue
            items.push(withSocialFlags(adminNewsDocToPost(d.id, data), data as Record<string, unknown>, 'news'))
            added += 1
            if (items.length >= PAGE_SIZE) break
          }
          if (added > 0 || constraints === legacyAttempts[legacyAttempts.length - 1]) break
        } catch (err) {
          console.warn('[adminNewsService] legacy pending attempt failed:', err)
        }
      }
    }

    const totalHasMore = draftDocCount >= fetchLimit || items.length >= PAGE_SIZE
    if (sort === 'views') {
      items.sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0))
    }
    return {
      posts: items.slice(0, PAGE_SIZE),
      lastDoc: draftLastDoc,
      hasMore: totalHasMore,
    }
  } catch (error) {
    console.warn('[adminNewsService] pending queue failed:', error)
    const results: AdminNewsItem[] = []
    try {
      const snap = await getDocs(
        query(collection(db, Collections.NEWS_DRAFTS), where('draftStatus', '==', 'pending_review'), limit(fetchLimit))
      )
      for (const d of snap.docs) {
        const data = d.data() as NewsDocument
        if (isDuplicateNewsData(data)) continue
        results.push(draftDocToPost(d.id, data))
        if (results.length >= PAGE_SIZE) break
      }
    } catch { /* ignore */ }
    try {
      const legacySnap = await getDocs(
        query(collection(db, VIDEO_FEED_COLLECTION), where('status', '==', 'pending'), limit(fetchLimit))
      )
      for (const d of legacySnap.docs) {
        const data = d.data() as NewsDocument
        if (isDuplicateNewsData(data)) continue
        results.push(withSocialFlags(adminNewsDocToPost(d.id, data), data as Record<string, unknown>, 'news'))
        if (results.length >= PAGE_SIZE) break
      }
    } catch { /* ignore */ }
    if (sort === 'views') {
      results.sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0))
    }
    return { posts: results.slice(0, PAGE_SIZE), lastDoc: null, hasMore: false }
  }
}
