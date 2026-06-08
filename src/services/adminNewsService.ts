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
} from 'firebase/firestore'
import { cityCategoryId, slugifyCity, toFirestoreLocation, type PostLocation } from '@/lib/location'
import { auth } from '@/lib/firebase/auth'
import { Collections, db, VIDEO_FEED_COLLECTION } from '@/lib/firebase/firestore'
import { enqueueFirestoreRead } from '@/lib/firestoreQueue'
import { withTimeout } from '@/lib/asyncUtils'
import { buildFeedTeaser } from '@/lib/newsContentCleanup'
import { mapNewsSnapshot, type NewsDocument } from '@/lib/newsMapper'
import { postService } from '@/services/postService'
import type { Post, PostStatus } from '@/types/post'

const PAGE_SIZE = 20
const QUERY_TIMEOUT_MS = 15_000

export type AdminNewsFilter = 'all' | 'published' | 'pending' | 'draft' | 'removed'

export type AdminNewsSource = 'news' | 'newsDrafts'

export interface AdminNewsItem extends Post {
  adminSource: AdminNewsSource
}

async function adminFetch(path: string, method: 'POST', body?: object): Promise<void> {
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
  const content = data.description?.trim() ?? ''
  const summary = data.summary?.trim() || content.slice(0, 280)
  return {
    id,
    title,
    slug: id,
    content,
    summary,
    feedTeaser: buildFeedTeaser(title, summary, content),
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

export const adminNewsService = {
  async list(
    filter: AdminNewsFilter = 'all',
    lastDoc?: QueryDocumentSnapshot
  ): Promise<{ posts: AdminNewsItem[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
    if (filter === 'pending') {
      return listPendingQueue(lastDoc)
    }

    const constraints: Parameters<typeof query>[1][] = []

    const status = statusConstraint(filter)
    if (status) {
      constraints.push(where('status', '==', status))
    }

    constraints.push(orderBy('createdAt', 'desc'))
    if (lastDoc) constraints.push(startAfter(lastDoc))
    constraints.push(limit(PAGE_SIZE))

    try {
      const q = query(collection(db, VIDEO_FEED_COLLECTION), ...constraints)
      const snap = await withTimeout(
        enqueueFirestoreRead(() => getDocs(q)),
        QUERY_TIMEOUT_MS,
        'admin-news-list'
      )

      let posts: AdminNewsItem[] = snap.docs.map((d) => ({
        ...adminNewsDocToPost(d.id, d.data() as NewsDocument),
        adminSource: 'news' as const,
      }))

      if (filter === 'removed') {
        posts = posts.filter((p) => p.status === 'archived' || p.status === 'banned')
      } else if (filter === 'all') {
        // no extra filter
      }

      return {
        posts,
        lastDoc: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: snap.docs.length === PAGE_SIZE,
      }
    } catch (error) {
      console.warn('[adminNewsService] list failed, fallback:', error)
      const q = query(
        collection(db, VIDEO_FEED_COLLECTION),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE * 2)
      )
      const snap = await getDocs(q)
      let posts: AdminNewsItem[] = snap.docs.map((d) => ({
        ...adminNewsDocToPost(d.id, d.data() as NewsDocument),
        adminSource: 'news' as const,
      }))

      if (filter === 'published') posts = posts.filter((p) => p.status === 'published')
      else if (filter === 'draft') posts = posts.filter((p) => p.status === 'draft')
      else if (filter === 'removed') posts = posts.filter((p) => p.status === 'archived' || p.status === 'banned')

      return { posts: posts.slice(0, PAGE_SIZE), lastDoc: null, hasMore: false }
    }
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

  async remove(id: string, reason?: string): Promise<void> {
    const now = Date.now()
    await updateDoc(doc(db, VIDEO_FEED_COLLECTION, id), {
      status: 'archived',
      publishedAt: null,
      updatedAt: now,
      moderationNote: reason?.trim() || 'Admin tarafından kaldırıldı',
    })
  },

  async createAdminNews(data: {
    title: string
    description: string
    category?: string
    city?: string
    thumbnail?: string
    videoUrl?: string
    tags?: string[]
    authorId: string
    authorUsername: string
  }): Promise<string> {
    const location: PostLocation | null = data.city?.trim()
      ? { city: data.city.trim(), country: 'Türkiye', lat: 0, lng: 0 }
      : null

    return postService.createNews({
      title: data.title,
      description: data.description,
      author: 'nahaber',
      authorId: data.authorId,
      thumbnail: data.thumbnail,
      videoUrl: data.videoUrl,
      category: data.category,
      tags: data.tags,
      location,
      status: 'published',
      type: 'news',
    })
  },

  async updateAdminNews(
    id: string,
    data: {
      title: string
      description: string
      category?: string
      city?: string
      thumbnail?: string
      videoUrl?: string
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

    await updateDoc(doc(db, VIDEO_FEED_COLLECTION, id), {
      title: data.title.trim(),
      description: data.description.trim(),
      thumbnail: data.thumbnail ?? '',
      videoUrl: data.videoUrl ?? '',
      category: topicCategory || cityCategory,
      categoryId: topicCategory || cityCategory,
      city: location?.city ?? '',
      citySlug,
      location,
      tags: data.tags ?? [],
      status,
      publishedAt: status === 'published' ? now : null,
      updatedAt: now,
    })
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
    const draftConstraints: Parameters<typeof query>[1][] = [
      where('draftStatus', '==', 'pending_review'),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    ]
    if (lastDoc) draftConstraints.push(startAfter(lastDoc))

    const draftSnap = await withTimeout(
      enqueueFirestoreRead(() =>
        getDocs(query(collection(db, Collections.NEWS_DRAFTS), ...draftConstraints))
      ),
      QUERY_TIMEOUT_MS,
      'admin-drafts-list'
    )

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
