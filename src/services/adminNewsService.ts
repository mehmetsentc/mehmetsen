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

export type AdminNewsFilter = 'all' | 'published' | 'pending' | 'draft' | 'removed'

export type AdminNewsSource = 'news' | 'newsDrafts'

export interface AdminNewsItem extends Post {
  adminSource: AdminNewsSource
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
  return { ...post, status: 'pending', adminSource: 'newsDrafts' }
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
    coverImageUrl: data.thumbnail?.trim() || null,
    status: (data.status as PostStatus) ?? 'draft',
    visibility: 'public',
    likesCount: data.likesCount ?? 0,
    commentsCount: data.commentCount ?? data.commentsCount ?? 0,
    savesCount: data.savesCount ?? 0,
    sharesCount: data.sharesCount ?? 0,
    viewsCount: data.viewsCount ?? 0,
    isEditorPick: false,
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

function docCreatedAtMs(data: NewsDocument): number {
  const raw = data.createdAt
  if (typeof raw === 'number') {
    return raw < 1_000_000_000_000 ? raw * 1000 : raw
  }
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  if (raw && typeof raw === 'object' && 'toMillis' in raw && typeof raw.toMillis === 'function') {
    return raw.toMillis()
  }
  if (raw && typeof raw === 'object' && 'seconds' in raw) {
    return Number((raw as { seconds: number }).seconds) * 1000
  }
  const published = data.publishedAt
  if (typeof published === 'number') {
    return published < 1_000_000_000_000 ? published * 1000 : published
  }
  return 0
}

function mapAdminNewsDocs(
  docs: QueryDocumentSnapshot[],
  filter: AdminNewsFilter
): AdminNewsItem[] {
  const sorted = [...docs].sort(
    (a, b) =>
      docCreatedAtMs(b.data() as NewsDocument) - docCreatedAtMs(a.data() as NewsDocument)
  )

  let posts: AdminNewsItem[] = sorted.map((d) => ({
    ...adminNewsDocToPost(d.id, d.data() as NewsDocument),
    adminSource: 'news' as const,
  }))

  if (filter === 'removed') {
    posts = posts.filter((p) => p.status === 'archived' || p.status === 'banned')
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
    limitOverride?: number
  ): Promise<{ posts: AdminNewsItem[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
    const pageSize = limitOverride ?? PAGE_SIZE
    if (filter === 'pending') {
      return listPendingQueue(lastDoc)
    }

    const status = statusConstraint(filter)
    const filterConstraints: QueryConstraint[] = []
    if (status) filterConstraints.push(where('status', '==', status))
    if (categoryId) filterConstraints.push(where('categoryId', '==', categoryId))

    const queryAttempts: QueryConstraint[][] = [
      [...filterConstraints, orderBy('createdAt', 'desc'), ...(lastDoc ? [startAfter(lastDoc)] : []), limit(pageSize)],
      [...filterConstraints, orderBy('publishedAt', 'desc'), limit(pageSize)],
      [...filterConstraints, limit(pageSize * 2)],
      [limit(Math.max(pageSize * 3, 150))],
    ]

    let lastError: unknown = null
    for (const constraints of queryAttempts) {
      try {
        const snap = await fetchAdminNewsSnap(constraints)
        const posts = mapAdminNewsDocs(snap.docs, filter).slice(0, pageSize)
        return {
          posts,
          lastDoc: snap.docs[snap.docs.length - 1] ?? null,
          hasMore: snap.docs.length >= pageSize,
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
    if (!snap.exists()) return null
    return adminNewsDocToPost(snap.id, snap.data() as NewsDocument)
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
    category?: string
    city?: string
    thumbnail?: string
    videoUrl?: string
    mediaItems?: MediaItem[]
    draftId?: string | null
    tags?: string[]
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
      status: 'published',
      type: 'news',
      spot: data.spot,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
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
              results.push({
                ...adminNewsDocToPost(d.id, d.data() as NewsDocument),
                adminSource: 'news' as const,
              })
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
    const statuses = ['published', 'pending', 'draft', 'archived', 'banned'] as const
    const counts: Record<string, number> = { total: 0 }

    try {
      const snap = await getDocs(query(collection(db, VIDEO_FEED_COLLECTION), limit(500)))
      counts.total = snap.size
      for (const status of statuses) counts[status] = 0
      for (const d of snap.docs) {
        const s = (d.data() as NewsDocument).status ?? 'published'
        counts[s] = (counts[s] ?? 0) + 1
      }
    } catch {
      counts.total = 0
    }
    try {
      const draftSnap = await getDocs(
        query(
          collection(db, Collections.NEWS_DRAFTS),
          where('draftStatus', '==', 'pending_review'),
          limit(200)
        )
      )
      counts.pending_review = draftSnap.size
      counts.pending = (counts.pending ?? 0) + draftSnap.size
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
    const draftConstraints: QueryConstraint[] = [
      where('draftStatus', '==', 'pending_review'),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    ]
    if (lastDoc) draftConstraints.push(startAfter(lastDoc))

    const draftSnap = await getDocs(query(collection(db, Collections.NEWS_DRAFTS), ...draftConstraints))

    for (const d of draftSnap.docs) {
      items.push(draftDocToPost(d.id, d.data() as NewsDocument))
    }

    if (items.length < PAGE_SIZE) {
      const legacySnap = await getDocs(
        query(
          collection(db, VIDEO_FEED_COLLECTION),
          where('status', '==', 'pending'),
          orderBy('createdAt', 'desc'),
          limit(PAGE_SIZE - items.length)
        )
      )
      for (const d of legacySnap.docs) {
        items.push({
          ...adminNewsDocToPost(d.id, d.data() as NewsDocument),
          adminSource: 'news',
        })
      }
    }

    return {
      posts: items,
      lastDoc: draftSnap.docs[draftSnap.docs.length - 1] ?? null,
      hasMore: draftSnap.docs.length === PAGE_SIZE,
    }
  } catch (error) {
    console.warn('[adminNewsService] pending queue failed:', error)
    const snap = await getDocs(
      query(collection(db, Collections.NEWS_DRAFTS), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
    )
    return {
      posts: snap.docs.map((d) => draftDocToPost(d.id, d.data() as NewsDocument)),
      lastDoc: null,
      hasMore: false,
    }
  }
}
