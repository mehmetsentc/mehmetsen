import 'server-only'

import { and, desc, inArray, isNotNull, lte, or, sql } from 'drizzle-orm'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { Collections } from '@/lib/firebase/collections'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { getSubcategories } from '@/constants/config'
import {
  FEED_V2_CATEGORY_FALLBACK_ORDER,
  FEED_V2_TRACKED_CATEGORY_IDS,
  feedV2CategoryDisplayName,
  feedV2CategoryParentBucket,
} from '@/lib/feed/feedV2CategoryBuckets'
import {
  canAppearInSmartFeed,
  classifyPublicRead,
  publicReadMetaFromFirestoreDoc,
} from '@/services/editorial/publicReadPolicy'

export type FeedCategoryActivity = {
  categoryId: string
  displayName: string
  latestEligiblePublishedAt: string | null
  articleId: string | null
}

export {
  FEED_V2_CATEGORY_FALLBACK_ORDER,
  feedV2CategoryParentBucket,
} from '@/lib/feed/feedV2CategoryBuckets'

type BucketHit = {
  categoryId: string
  publishedAtMs: number
  articleId: string
}

const CACHE_TTL_MS = 90_000
let cache: { at: number; order: string[]; activity: FeedCategoryActivity[] } | null = null

function considerHit(best: Map<string, BucketHit>, hit: BucketHit) {
  const prev = best.get(hit.categoryId)
  if (!prev || hit.publishedAtMs > prev.publishedAtMs) {
    best.set(hit.categoryId, hit)
    return
  }
  if (hit.publishedAtMs === prev.publishedAtMs && hit.articleId.localeCompare(prev.articleId) < 0) {
    best.set(hit.categoryId, hit)
  }
}

function orderFromBest(best: Map<string, BucketHit>): {
  order: string[]
  activity: FeedCategoryActivity[]
} {
  const ranked = Array.from(best.values()).sort((a, b) => {
    const dt = b.publishedAtMs - a.publishedAtMs
    if (dt !== 0) return dt
    const ia = FEED_V2_CATEGORY_FALLBACK_ORDER.indexOf(a.categoryId)
    const ib = FEED_V2_CATEGORY_FALLBACK_ORDER.indexOf(b.categoryId)
    if (ia !== ib) {
      if (ia < 0) return 1
      if (ib < 0) return -1
      return ia - ib
    }
    return a.categoryId.localeCompare(b.categoryId)
  })

  const order = ranked.map((r) => r.categoryId)
  const seen = new Set(order)
  for (const id of FEED_V2_CATEGORY_FALLBACK_ORDER) {
    if (!seen.has(id)) {
      order.push(id)
      seen.add(id)
    }
  }

  const activity: FeedCategoryActivity[] = order.map((id) => {
    const hit = best.get(id)
    return {
      categoryId: id,
      displayName: feedV2CategoryDisplayName(id),
      latestEligiblePublishedAt: hit ? new Date(hit.publishedAtMs).toISOString() : null,
      articleId: hit?.articleId ?? null,
    }
  })

  return { order, activity }
}

async function collectFromPostgres(best: Map<string, BucketHit>): Promise<void> {
  if (!hasDatabaseUrl()) return
  const db = getDb()
  const leafIds = new Set<string>()
  for (const id of FEED_V2_TRACKED_CATEGORY_IDS) {
    leafIds.add(id === 'yerel-haber' ? 'yerel-haber' : id)
    for (const kid of getSubcategories(id === 'yerel' ? 'yerel-haber' : id)) {
      leafIds.add(kid.id)
    }
  }
  leafIds.add('yerel-haber')
  leafIds.add('son-dakika')

  const rows = await db
    .select({
      id: news.id,
      categoryId: news.categoryId,
      publishedAt: news.publishedAt,
      status: news.status,
      slug: news.slug,
      publicationAuthority: news.publicationAuthority,
      isBreaking: news.isBreaking,
      title: news.title,
    })
    .from(news)
    .where(
      and(
        or(
          inArray(news.status, ['published']),
          sql`lower(${news.status}::text) in ('published', 'active')`
        ),
        isNotNull(news.publishedAt),
        lte(news.publishedAt, sql`NOW()`),
        inArray(news.categoryId, Array.from(leafIds))
      )
    )
    .orderBy(desc(news.publishedAt))
    .limit(500)

  for (const row of rows) {
    const cls = classifyPublicRead({
      id: row.id,
      title: row.title,
      status: row.status,
      slug: row.slug,
      publicationAuthority: row.publicationAuthority,
      fromCanonicalPg: true,
    })
    if (!canAppearInSmartFeed(cls)) continue
    if (!row.publishedAt) continue
    const breaking = Boolean(row.isBreaking) || row.categoryId === 'son-dakika'
    const bucket = feedV2CategoryParentBucket(row.categoryId, breaking)
    if (!bucket) continue
    considerHit(best, {
      categoryId: bucket,
      publishedAtMs: row.publishedAt.getTime(),
      articleId: row.id,
    })
  }
}

async function collectFromFirestore(best: Map<string, BucketHit>): Promise<void> {
  const db = getAdminFirestore()
  let lastDoc: QueryDocumentSnapshot | undefined
  const maxBatches = 8
  const batchSize = 80

  for (let attempt = 0; attempt < maxBatches; attempt++) {
    let q = db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .limit(batchSize)
    if (lastDoc) q = q.startAfter(lastDoc)
    const snap = await q.get()
    if (snap.empty) break
    lastDoc = snap.docs[snap.docs.length - 1]

    for (const doc of snap.docs) {
      const data = doc.data()
      const cls = classifyPublicRead(
        publicReadMetaFromFirestoreDoc(doc.id, data as Record<string, unknown>)
      )
      if (!canAppearInSmartFeed(cls)) continue

      const publishedAt =
        typeof (data.publishedAt as { toDate?: () => Date } | undefined)?.toDate === 'function'
          ? (data.publishedAt as { toDate: () => Date }).toDate()
          : data.publishedAt
            ? new Date(data.publishedAt as string | number | Date)
            : null
      if (!publishedAt || Number.isNaN(publishedAt.getTime())) continue
      if (publishedAt.getTime() > Date.now()) continue

      const leaf = String(data.categoryId || data.category || '')
        .trim()
        .toLowerCase()
      const breaking =
        data.isBreaking === true || data.breaking === true || leaf === 'son-dakika'
      const bucket = feedV2CategoryParentBucket(leaf || null, breaking)
      if (!bucket) continue

      considerHit(best, {
        categoryId: bucket,
        publishedAtMs: publishedAt.getTime(),
        articleId: doc.id,
      })
    }

    if (snap.size < batchSize) break
  }
}

/**
 * Single source of truth for Feed V2 dynamic category chip ordering.
 * Merges thin PG + Firestore LEGACY_ALLOWED/CANONICAL recent window.
 * Cache TTL: 90s in-process. API Cache-Control private max-age=60.
 */
export async function getFeedCategoryActivity(): Promise<{
  order: string[]
  activity: FeedCategoryActivity[]
  cacheHit: boolean
}> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return { order: cache.order, activity: cache.activity, cacheHit: true }
  }

  try {
    const best = new Map<string, BucketHit>()
    await Promise.all([collectFromPostgres(best), collectFromFirestore(best)])
    const { order, activity } = orderFromBest(best)
    cache = { at: now, order, activity }
    return { order, activity, cacheHit: false }
  } catch (err) {
    console.warn('[feed] category activity failed; using fallback order', err)
    const order = [...FEED_V2_CATEGORY_FALLBACK_ORDER]
    const activity: FeedCategoryActivity[] = order.map((id) => ({
      categoryId: id,
      displayName: feedV2CategoryDisplayName(id),
      latestEligiblePublishedAt: null,
      articleId: null,
    }))
    return { order, activity, cacheHit: false }
  }
}

export async function getCategoryFreshnessOrder(): Promise<string[]> {
  const { order } = await getFeedCategoryActivity()
  return order
}

export function __resetFeedCategoryActivityCacheForTests() {
  cache = null
}
