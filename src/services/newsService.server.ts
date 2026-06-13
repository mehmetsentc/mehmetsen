import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { filterPostsByFeedSource, type FeedSource } from '@/lib/feedSource'
import { isPubliclyVisibleStatus } from '@/lib/postUtils'
import { NEWS_COLLECTION } from '@/lib/newsQueries'
import { newsDocToPost, type NewsDocument } from '@/lib/newsMapper'
import type { Post } from '@/types/post'
import type { FeedSliderItem } from '@/types/feedSlider'

export type { FeedSliderItem }

function mapSliderItem(id: string, data: NewsDocument): FeedSliderItem | null {
  const title = data.title?.trim()
  if (!title) return null

  const raw =
    data.coverImageUrl?.trim() ||
    data.thumbnail?.trim() ||
    null

  return {
    id,
    title,
    slug: data.slug?.trim() || id,
    imageUrl: raw && raw.length > 5 ? raw : null,
    categoryId: data.categoryId?.trim() || data.category?.trim() || '',
    publishedAt: Number(data.publishedAt ?? 0),
    sourceUrl: data.sourceUrl?.trim() || null,
  }
}

async function queryPublishedByCategory(
  categoryId: string,
  itemLimit: number
): Promise<QueryDocumentSnapshot[]> {
  const db = getAdminFirestore()

  try {
    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('categoryId', '==', categoryId)
      .orderBy('publishedAt', 'desc')
      .limit(itemLimit)
      .get()
    return snap.docs
  } catch (error) {
    // RESOURCE_EXHAUSTED (Firestore kota doldu) veya başka Firestore hatası —
    // fallback query yapmak kotayı daha da zorlar, boş dizi döndür.
    const code = (error as { code?: number }).code
    if (code === 8) {
      console.warn('[newsService.server] Firestore quota exceeded (RESOURCE_EXHAUSTED) — returning []')
      return []
    }
    console.warn('[newsService.server] category query failed — returning []:', error)
    return []
  }
}

export async function getFeedSliderItems(
  categoryId: string,
  itemLimit = 5
): Promise<FeedSliderItem[]> {
  const docs = await queryPublishedByCategory(categoryId, itemLimit + 8)
  return docs
    .map((doc) => mapSliderItem(doc.id, doc.data() as NewsDocument))
    .filter((item): item is FeedSliderItem => item !== null)
    .filter((item) => item.categoryId !== 'son-dakika')
    .slice(0, itemLimit)
}

export async function getFeedTimelinePosts(
  categoryId: string,
  itemLimit = 10,
  feedSource: FeedSource = 'nahaber'
): Promise<Post[]> {
  const docs = await queryPublishedByCategory(categoryId, itemLimit + 5)
  const posts = docs
    .map((doc) => newsDocToPost(doc.id, doc.data() as NewsDocument))
    .filter((post): post is Post => post !== null)
    .filter((post) => isPubliclyVisibleStatus(post.status))

  return filterPostsByFeedSource(posts, feedSource).slice(0, itemLimit)
}

export async function getNewsById(id: string): Promise<Post | null> {
  try {
    const snap = await getAdminFirestore().collection(NEWS_COLLECTION).doc(id).get()
    if (!snap.exists) return null
    return newsDocToPost(snap.id, snap.data() as NewsDocument)
  } catch (error) {
    console.warn('[newsService.server] getNewsById failed:', error)
    return null
  }
}

export async function getNewsBySlug(slug: string): Promise<Post | null> {
  const normalized = slug.trim()
  if (!normalized) return null

  try {
    const snap = await getAdminFirestore()
      .collection(NEWS_COLLECTION)
      .where('slug', '==', normalized)
      .limit(1)
      .get()

    if (!snap.empty) {
      const doc = snap.docs[0]!
      return newsDocToPost(doc.id, doc.data() as NewsDocument)
    }
  } catch (error) {
    console.warn('[newsService.server] getNewsBySlug query failed:', error)
  }

  return getNewsById(normalized)
}
