import { unstable_cache } from 'next/cache'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { NEWS_COLLECTION } from '@/lib/newsQueries'
import type { Post } from '@/types/post'

async function fetchInfluencerPosts(limitCount: number): Promise<Post[]> {
  try {
    const db = getAdminFirestore()
    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('categoryId', '==', 'influencer')
      .orderBy('publishedAt', 'desc')
      .limit(limitCount)
      .get()

    return snap.docs.map((doc) => {
      const d = doc.data()
      return {
        id: doc.id,
        title: String(d.title ?? ''),
        slug: String(d.slug ?? doc.id),
        summary: String(d.summary ?? d.spot ?? ''),
        content: '',
        categoryId: 'influencer',
        coverImageUrl: String(d.coverImageUrl ?? d.thumbnail ?? d.imageUrl ?? ''),
        publishedAt: typeof d.publishedAt === 'number' ? d.publishedAt : Date.now(),
        createdAt: typeof d.createdAt === 'number' ? d.createdAt : Date.now(),
        likesCount: typeof d.likesCount === 'number' ? d.likesCount : 0,
        commentsCount:
          typeof d.commentCount === 'number'
            ? d.commentCount
            : typeof d.commentsCount === 'number'
              ? d.commentsCount
              : 0,
        source: String(d.sourceLabel ?? d.source ?? ''),
        tags: Array.isArray(d.tags) ? d.tags : [],
        status: 'published',
        authorId: String(d.authorId ?? ''),
        authorUsername: String(d.authorUsername ?? ''),
      } as unknown as Post
    })
  } catch (error) {
    console.warn('[influencer] SSR prefetch failed:', error)
    return []
  }
}

export const getInfluencerPostsCached = unstable_cache(
  async () => fetchInfluencerPosts(24),
  ['influencer-posts-v1'],
  { revalidate: 120, tags: ['influencer'] }
)
