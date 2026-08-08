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
import { auth } from '@/lib/firebase/auth'
import { Collections, db, VIDEO_FEED_COLLECTION } from '@/lib/firebase/firestore'
import { buildFeedTeaser } from '@/lib/newsContentCleanup'
import { mapNewsSnapshot, type NewsDocument } from '@/lib/newsMapper'
import { postService } from '@/services/postService'
import type { MediaItem, Post, PostStatus } from '@/types/post'

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

export type AdminNewsFilter = 'all' | 'published' | 'pending' | 'duplicate' | 'draft' | 'removed' | 'featured'

export type AdminNewsSource = 'news' | 'newsDrafts'

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

function draftDocToPost(id: string, data: NewsDocument): AdminNewsItem {
  const post = adminNewsDocToPost(id, data)
  return {
    ...withSocialFlags(post, data as Record<string, unknown>, 'newsDrafts'),
    status: 'pending',
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
  citySlug?: string
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
  if (citySlug) {
    posts = posts.filter((p) => p.citySlug === citySlug)
  }

  if (filter === 'removed') {
    posts = posts.filter((p) => p.status === 'archived' || p.status === 'banned')
  } else if (filter === 'featured') {
    posts = posts.filter((p) => p.featured === true)
  } else if (filter === 'published') {
    posts = posts.filter((p) => p.status === 'published')
  } else if (filter === 'draft') {
    posts = posts.filter((p) => p.status === 'draft')
  }

  posts.sort((a, b) => {
    const aMs = Date.parse(a.createdAt) || 0
    const bMs = Date.parse(b.createdAt) || 0
    return bMs - aMs
  })
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
    citySlug?: string
  ): Promise<{ posts: AdminNewsItem[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
    const pageSize = limitOverride ?? PAGE_SIZE
    if (filter === 'pending') {
      return listPendingQueue(lastDoc)
    }

    const status = statusConstraint(filter)
    const filterConstraints: QueryConstraint[] = []
    if (filter === 'featured') filterConstraints.push(where('featured', '==', true))
    if (filter === 'removed') filterConstraints.push(where('status', 'in', ['archived', 'banned']))
    else if (status) filterConstraints.push(where('status', '==', status))
    if (categoryId) filterConstraints.push(where('categoryId', '==', categoryId))
    if (citySlug) filterConstraints.push(where('citySlug', '==', citySlug))

    // Draft/pending rows often lack createdAt/publishedAt. Firestore orderBy on a
    // missing field returns an empty snapshot (success) — so we must keep trying
    // weaker queries when a status filter yields zero docs.
    // createdAt is tried first so the server-side fetch order matches the
    // client-side sort in mapAdminNewsDocs — otherwise updatedAt-ordered fetches
    // can return recently-edited old articles while newer articles fall outside
    // the page window.
    const queryAttempts: QueryConstraint[][] = [
      [...filterConstraints, orderBy('createdAt', 'desc'), ...(lastDoc ? [startAfter(lastDoc)] : []), limit(pageSize)],
      [...filterConstraints, orderBy('updatedAt', 'desc'), ...(lastDoc ? [startAfter(lastDoc)] : []), limit(pageSize)],
      [...filterConstraints, orderBy('publishedAt', 'desc'), limit(pageSize)],
      [...filterConstraints, limit(pageSize * 2)],
      [limit(Math.max(pageSize * 3, 150))],
    ]

    let lastError: unknown = null
    for (let i = 0; i < queryAttempts.length; i++) {
      const constraints = queryAttempts[i]!
      const isLast = i === queryAttempts.length - 1
      try {
        const snap = await fetchAdminNewsSnap(constraints)
        const allFiltered = mapAdminNewsDocs(snap.docs, filter, categoryId, citySlug)
        const posts = allFiltered.slice(0, pageSize)
        // Empty ordered query ≠ "no drafts" — try next attempt while filter is set.
        const hasServerFilter = !!(status || filter === 'removed' || filter === 'featured' || citySlug)
        if (posts.length === 0 && hasServerFilter && !isLast) continue
        const hasMore = posts.length >= pageSize && allFiltered.length > pageSize
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
        moderationNote: null,
      })
    }
  },

  async reject(id: string, source: AdminNewsSource = 'news', reason?: string): Promise<void> {
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

  async remove(id: string, _reason?: string): Promise<void> {
    // Server-side route: archives + revalidates ISR cache
    await adminFetch(`/api/admin/news/${id}`, 'DELETE' as never)
  },

  /** Taslakları (draft) kalıcı olarak Firestore'dan siler. */
  async permanentDelete(id: string): Promise<void> {
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
      counts.pending_review = draftSnap.data().count
      counts.pending = (counts.pending ?? 0) + draftSnap.data().count
    } catch {
      counts.pending_review = 0
    }

    return counts
  },
}

async function listPendingQueue(
  lastDoc?: QueryDocumentSnapshot
): Promise<{ posts: AdminNewsItem[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
  const items: AdminNewsItem[] = []

  try {
    // Prefer updatedAt — many review docs lack createdAt.
    const draftAttemptConstraints: QueryConstraint[][] = [
      [
        where('draftStatus', '==', 'pending_review'),
        orderBy('updatedAt', 'desc'),
        ...(lastDoc ? [startAfter(lastDoc)] : []),
        limit(PAGE_SIZE),
      ],
      [
        where('draftStatus', '==', 'pending_review'),
        orderBy('createdAt', 'desc'),
        ...(lastDoc ? [startAfter(lastDoc)] : []),
        limit(PAGE_SIZE),
      ],
      [where('draftStatus', '==', 'pending_review'), limit(PAGE_SIZE)],
    ]

    let draftLastDoc: QueryDocumentSnapshot | null = null
    let draftDocCount = 0
    for (const constraints of draftAttemptConstraints) {
      try {
        const snap = await getDocs(query(collection(db, Collections.NEWS_DRAFTS), ...constraints))
        if (snap.empty && constraints !== draftAttemptConstraints[draftAttemptConstraints.length - 1]) {
          continue
        }
        for (const d of snap.docs) {
          items.push(draftDocToPost(d.id, d.data() as NewsDocument))
        }
        draftLastDoc = snap.docs[snap.docs.length - 1] ?? null
        draftDocCount = snap.docs.length
        break
      } catch (err) {
        console.warn('[adminNewsService] pending_review attempt failed:', err)
      }
    }

    if (items.length < PAGE_SIZE) {
      const legacyAttempts: QueryConstraint[][] = [
        [where('status', '==', 'pending'), orderBy('updatedAt', 'desc'), limit(PAGE_SIZE - items.length)],
        [where('status', '==', 'pending'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE - items.length)],
        [where('status', '==', 'pending'), limit(PAGE_SIZE - items.length)],
      ]
      for (const constraints of legacyAttempts) {
        try {
          const legacySnap = await getDocs(query(collection(db, VIDEO_FEED_COLLECTION), ...constraints))
          if (legacySnap.empty && constraints !== legacyAttempts[legacyAttempts.length - 1]) continue
          for (const d of legacySnap.docs) {
            const data = d.data() as NewsDocument
            items.push(withSocialFlags(adminNewsDocToPost(d.id, data), data as Record<string, unknown>, 'news'))
          }
          break
        } catch (err) {
          console.warn('[adminNewsService] legacy pending attempt failed:', err)
        }
      }
    }

    return {
      posts: items,
      lastDoc: draftLastDoc,
      hasMore: draftDocCount === PAGE_SIZE,
    }
  } catch (error) {
    console.warn('[adminNewsService] pending queue failed:', error)
    const snap = await getDocs(
      query(collection(db, Collections.NEWS_DRAFTS), where('draftStatus', '==', 'pending_review'), limit(PAGE_SIZE))
    )
    return {
      posts: snap.docs.map((d) => draftDocToPost(d.id, d.data() as NewsDocument)),
      lastDoc: null,
      hasMore: false,
    }
  }
}
