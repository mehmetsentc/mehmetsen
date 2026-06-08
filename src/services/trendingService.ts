import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { db, VIDEO_FEED_COLLECTION } from '@/lib/firebase/firestore'
import { mapNewsSnapshot } from '@/lib/newsMapper'
import { isPubliclyVisibleStatus } from '@/lib/postUtils'
import { withTimeout } from '@/lib/asyncUtils'
import { sortByEngagement } from '@/lib/engagementScore'
import {
  buildTopTagsFromPosts,
  buildTrendingFromPosts,
  SEED_TRENDING_TAGS,
  type TrendingTopic,
} from '@/lib/trendingUtils'
import type { Post } from '@/types/post'

const TRENDING_POOL = 200
const QUERY_TIMEOUT_MS = 12_000

async function fetchRecentPosts(): Promise<Post[]> {
  try {
    const snap = await withTimeout(
      getDocs(
        query(
          collection(db, VIDEO_FEED_COLLECTION),
          orderBy('createdAt', 'desc'),
          limit(TRENDING_POOL)
        )
      ),
      QUERY_TIMEOUT_MS,
      'trending-posts'
    )
    return sortByEngagement(
      mapNewsSnapshot(snap.docs).filter((p) => isPubliclyVisibleStatus(p.status))
    )
  } catch {
    const snap = await withTimeout(
      getDocs(query(collection(db, VIDEO_FEED_COLLECTION), limit(TRENDING_POOL))),
      QUERY_TIMEOUT_MS,
      'trending-posts-fallback'
    )
    return sortByEngagement(
      mapNewsSnapshot(snap.docs).filter((p) => isPubliclyVisibleStatus(p.status))
    )
  }
}

export const trendingService = {
  async getTrendingTopics(): Promise<TrendingTopic[]> {
    const posts = await fetchRecentPosts()
    const dynamic = buildTopTagsFromPosts(posts, 4)

    if (dynamic.length >= 4) return dynamic

    const seeded = buildTrendingFromPosts(posts, SEED_TRENDING_TAGS)
    const merged = new Map<string, number>()

    for (const item of seeded) merged.set(item.tag, item.count)
    for (const item of dynamic) {
      merged.set(item.tag, Math.max(merged.get(item.tag) ?? 0, item.count))
    }

    return [...merged.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr-TR'))
      .slice(0, 4)
      .map(([tag, count]) => ({ tag, count }))
  },
}
