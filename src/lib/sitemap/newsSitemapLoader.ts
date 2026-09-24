import 'server-only'

/**
 * SEO-2B — data layer for the Google News sitemap.
 * Bounded 48h queries (Firestore + PG), projection, paging, raw cap, 5 min data cache.
 * Errors propagate (never cached as an empty sitemap).
 */
import { unstable_cache } from 'next/cache'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  canonicalRowToPost,
  getCanonicalPublishedIdentityKeys,
  getCanonicalPublishedNewsForSitemap,
} from '@/lib/canonical/canonicalEligibility'
import { ARTICLE_SITEMAP_FIRESTORE_FIELDS } from '@/lib/sitemap/articleSitemap'
import type { FirestoreSitemapCandidate } from '@/lib/sitemap/articleSitemapEntries'
import { recordSitemapGeneration } from '@/lib/seo/observability'
import {
  buildNewsSitemapEntries,
  NEWS_SITEMAP_RAW_CAP,
  NEWS_SITEMAP_REVALIDATE_S,
  NEWS_SITEMAP_WINDOW_MS,
  NewsSitemapCapExceededError,
  type NewsSitemapEntry,
} from '@/lib/sitemap/newsSitemap'

const FIRESTORE_PAGE_SIZE = 1000

export async function loadFirestoreNewsWindow(nowMs: number): Promise<FirestoreSitemapCandidate[]> {
  const fromMs = nowMs - NEWS_SITEMAP_WINDOW_MS
  const db = getAdminFirestore()
  const out: FirestoreSitemapCandidate[] = []
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined

  for (;;) {
    let query = db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('publishedAt', '>=', fromMs)
      .where('publishedAt', '<=', nowMs)
      .orderBy('publishedAt', 'desc')
      .select(...ARTICLE_SITEMAP_FIRESTORE_FIELDS)
      .limit(FIRESTORE_PAGE_SIZE)
    if (cursor) query = query.startAfter(cursor)

    const snap = await query.get()
    for (const doc of snap.docs) {
      out.push({ id: doc.id, data: doc.data() as Record<string, unknown> })
    }
    if (out.length > NEWS_SITEMAP_RAW_CAP) {
      throw new NewsSitemapCapExceededError('firestore', out.length)
    }
    if (snap.docs.length < FIRESTORE_PAGE_SIZE) break
    cursor = snap.docs[snap.docs.length - 1]
  }
  return out
}

export async function loadNewsSitemapEntries(nowMs: number): Promise<NewsSitemapEntry[]> {
  const [firestore, pgRows, pgIdentityKeys] = await Promise.all([
    loadFirestoreNewsWindow(nowMs),
    getCanonicalPublishedNewsForSitemap({
      from: new Date(nowMs - NEWS_SITEMAP_WINDOW_MS),
      to: new Date(nowMs + 1),
      limit: NEWS_SITEMAP_RAW_CAP + 1,
      throwOnError: true,
    }),
    getCanonicalPublishedIdentityKeys(),
  ])
  if (pgRows.length > NEWS_SITEMAP_RAW_CAP) {
    throw new NewsSitemapCapExceededError('pg', pgRows.length)
  }
  const entries = buildNewsSitemapEntries({
    nowMs,
    firestore,
    pg: pgRows.map((row) => ({
      post: canonicalRowToPost(row),
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      title: row.title,
    })),
    pgIdentityKeys,
  })
  recordSitemapGeneration('news', entries.length)
  return entries
}

const getNewsSitemapEntriesCached = unstable_cache(
  async () => loadNewsSitemapEntries(Date.now()),
  ['seo2b-news-sitemap-v1'],
  { revalidate: NEWS_SITEMAP_REVALIDATE_S, tags: ['news-sitemap'] }
)

export async function getNewsSitemapEntries(): Promise<NewsSitemapEntry[]> {
  return getNewsSitemapEntriesCached()
}
