import 'server-only'

/**
 * SEO-1C.1 — permanent monthly article sitemaps (data + cache layer).
 *
 * Sources (no new store, no crawler):
 *   A) Firestore `news` — status == 'published', publishedAt in [monthStart, nextMonthStart)
 *      (same field/index shape as the existing day feed: (status ASC, publishedAt DESC)).
 *   B) PostgreSQL canonical `news` — canonicalPublishedWhere() via
 *      getCanonicalPublishedNewsForSitemap({ from, to }).
 *
 * Cost safety:
 *   - bounded month range queries only, paged, field projection (`select`)
 *   - month data cached in the Next data cache: current month 1h, closed months 24h
 *   - month discovery walks the (status, publishedAt DESC) index with one
 *     `limit(1)` read per non-empty month (no collection scan, no hardcoded start)
 *   - errors throw (never cached as an empty month)
 */
import { unstable_cache } from 'next/cache'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  canonicalRowToPost,
  getCanonicalPublishedIdentityKeys,
  getCanonicalPublishedMonthKeysUtc,
  getCanonicalPublishedNewsForSitemap,
} from '@/lib/canonical/canonicalEligibility'
import { recordSitemapError, recordSitemapGeneration } from '@/lib/seo/observability'
import {
  articleShardPath,
  isClosedMonth,
  isMonthKey,
  monthBoundsUtc,
  monthKeyFromMs,
  type MonthKey,
} from '@/lib/sitemap/articleSitemapPartition'
import {
  buildArticleMonth,
  summarizeArticleMonth,
  type ArticleSitemapMonth,
  type FirestoreSitemapCandidate,
} from '@/lib/sitemap/articleSitemapEntries'

export const ARTICLE_MONTH_REVALIDATE_CURRENT_S = 3600
export const ARTICLE_MONTH_REVALIDATE_CLOSED_S = 86400

const FIRESTORE_PAGE_SIZE = 1000
/** Safety ceiling for one month's raw source rows. Exceeding it throws (no truncation). */
const MAX_MONTH_SOURCE_DOCS = 500_000
/** Sanity floor for month discovery (epoch-seconds values stored as ms land in 1970). */
const MIN_DISCOVERY_YEAR = 2000
const MAX_DISCOVERY_STEPS = 600
const INDEX_SUMMARY_CONCURRENCY = 4
const INDEX_SUMMARY_BUDGET_MS = 25_000

/** Fields needed by newsDocToPost / publicReadMetaFromFirestoreDoc / lastmod. */
export const ARTICLE_SITEMAP_FIRESTORE_FIELDS = [
  'slug',
  'status',
  'publishedAt',
  'updatedAt',
  'createdAt',
  'title',
  'description',
  'thumbnail',
  'videoUrl',
  'visibility',
  'publicationAuthority',
  'publishedBy',
  'approvedBy',
  'authorId',
  'aiAutoPublished',
  'needsReview',
  'needsAdminReview',
  'seoNoindex',
  'publisherType',
] as const

export async function loadFirestoreMonthDocs(
  month: MonthKey,
  nowMs: number
): Promise<FirestoreSitemapCandidate[]> {
  const { startMs, endMs } = monthBoundsUtc(month)
  const upperMs = Math.min(endMs, nowMs + 1)
  if (upperMs <= startMs) return []

  const db = getAdminFirestore()
  const out: FirestoreSitemapCandidate[] = []
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined

  for (;;) {
    let query = db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('publishedAt', '>=', startMs)
      .where('publishedAt', '<', upperMs)
      .orderBy('publishedAt', 'desc')
      .select(...ARTICLE_SITEMAP_FIRESTORE_FIELDS)
      .limit(FIRESTORE_PAGE_SIZE)
    if (cursor) query = query.startAfter(cursor)

    const snap = await query.get()
    for (const doc of snap.docs) {
      out.push({ id: doc.id, data: doc.data() as Record<string, unknown> })
    }
    if (out.length > MAX_MONTH_SOURCE_DOCS) {
      throw new Error(`article sitemap ${month}: firestore rows exceed ${MAX_MONTH_SOURCE_DOCS}`)
    }
    if (snap.docs.length < FIRESTORE_PAGE_SIZE) break
    cursor = snap.docs[snap.docs.length - 1]
  }
  return out
}

export async function loadArticleMonth(month: MonthKey, nowMs: number): Promise<ArticleSitemapMonth> {
  const { startMs, endMs } = monthBoundsUtc(month)
  const [firestore, pgRows, pgIdentityKeys] = await Promise.all([
    loadFirestoreMonthDocs(month, nowMs),
    getCanonicalPublishedNewsForSitemap({
      from: new Date(startMs),
      to: new Date(endMs),
      limit: MAX_MONTH_SOURCE_DOCS + 1,
      throwOnError: true,
    }),
    getCanonicalPublishedIdentityKeys(),
  ])
  if (pgRows.length > MAX_MONTH_SOURCE_DOCS) {
    throw new Error(`article sitemap ${month}: pg rows exceed ${MAX_MONTH_SOURCE_DOCS}`)
  }

  const result = buildArticleMonth({
    month,
    nowMs,
    firestore,
    pg: pgRows.map((row) => ({
      post: canonicalRowToPost(row),
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
    })),
    pgIdentityKeys,
  })
  recordSitemapGeneration(`articles-${month}`, result.entries.length)
  return result
}

const getCurrentMonthCached = unstable_cache(
  async (month: MonthKey) => loadArticleMonth(month, Date.now()),
  ['seo1c1-article-month-current-v1'],
  { revalidate: ARTICLE_MONTH_REVALIDATE_CURRENT_S, tags: ['article-sitemaps'] }
)

const getClosedMonthCached = unstable_cache(
  async (month: MonthKey) => loadArticleMonth(month, Date.now()),
  ['seo1c1-article-month-closed-v1'],
  { revalidate: ARTICLE_MONTH_REVALIDATE_CLOSED_S, tags: ['article-sitemaps'] }
)

export async function getArticleMonth(month: MonthKey, nowMs = Date.now()): Promise<ArticleSitemapMonth> {
  if (!isMonthKey(month)) throw new Error(`invalid month key: ${month}`)
  return isClosedMonth(month, nowMs) ? getClosedMonthCached(month) : getCurrentMonthCached(month)
}

/**
 * Non-empty Firestore months, newest first, discovered by walking the
 * (status, publishedAt DESC) index: each step reads the single newest doc
 * strictly before the previous month's start. Cost = 1 read per non-empty month.
 */
export async function discoverFirestoreMonths(nowMs: number): Promise<MonthKey[]> {
  const db = getAdminFirestore()
  const months: MonthKey[] = []
  let upperMs = nowMs + 1

  for (let step = 0; step < MAX_DISCOVERY_STEPS; step++) {
    const snap = await db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('publishedAt', '<', upperMs)
      .orderBy('publishedAt', 'desc')
      .select('publishedAt')
      .limit(1)
      .get()
    if (snap.empty) break
    const value = snap.docs[0]!.get('publishedAt')
    if (typeof value !== 'number' || !Number.isFinite(value)) break
    const month = monthKeyFromMs(value)
    if (Number(month.slice(0, 4)) < MIN_DISCOVERY_YEAR) break
    months.push(month)
    upperMs = monthBoundsUtc(month).startMs
  }
  return months
}

export async function discoverArticleMonths(nowMs: number): Promise<MonthKey[]> {
  const [fsMonths, pgMonths] = await Promise.all([
    discoverFirestoreMonths(nowMs),
    getCanonicalPublishedMonthKeysUtc(),
  ])
  const set = new Set<MonthKey>()
  for (const m of [...fsMonths, ...pgMonths]) {
    if (isMonthKey(m) && monthBoundsUtc(m).startMs <= nowMs) set.add(m)
  }
  return [...set].sort().reverse()
}

const getArticleMonthsCached = unstable_cache(
  async () => discoverArticleMonths(Date.now()),
  ['seo1c1-article-months-v1'],
  { revalidate: ARTICLE_MONTH_REVALIDATE_CURRENT_S, tags: ['article-sitemaps'] }
)

export type SitemapIndexItem = { loc: string; lastmod?: string }

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * Sitemap-index children for article shards. Months with zero eligible URLs
 * are omitted. If a month's summary fails or misses the time budget, the
 * month (known non-empty at source) is still listed, without lastmod.
 */
export async function getArticleSitemapIndexItems(
  base: string,
  deps: {
    listMonths?: () => Promise<MonthKey[]>
    getMonth?: (month: MonthKey) => Promise<ArticleSitemapMonth>
    budgetMs?: number
  } = {}
): Promise<SitemapIndexItem[]> {
  const listMonths = deps.listMonths ?? (() => getArticleMonthsCached())
  const getMonth = deps.getMonth ?? ((m: MonthKey) => getArticleMonth(m))
  const budgetMs = deps.budgetMs ?? INDEX_SUMMARY_BUDGET_MS
  const root = base.replace(/\/$/, '')

  const months = await listMonths()
  const pending = Symbol('pending')
  const settled = new Map<MonthKey, ArticleSitemapMonth | Error>()

  const work = mapWithConcurrency(months, INDEX_SUMMARY_CONCURRENCY, async (m) => {
    try {
      settled.set(m, await getMonth(m))
    } catch (err) {
      settled.set(m, err instanceof Error ? err : new Error(String(err)))
    }
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const outcome = await Promise.race([
    work.then(() => 'done' as const),
    new Promise<typeof pending>((resolve) => {
      timer = setTimeout(() => resolve(pending), budgetMs)
    }),
  ])
  if (timer) clearTimeout(timer)
  if (outcome === pending) recordSitemapError('articles-index', 'summary_budget_exceeded')

  const items: SitemapIndexItem[] = []
  for (const m of months) {
    const res = settled.get(m)
    if (res instanceof Error || res === undefined) {
      if (res instanceof Error) recordSitemapError(`articles-${m}`, res.message)
      items.push({ loc: `${root}${articleShardPath(m, 1)}` })
      continue
    }
    for (const part of summarizeArticleMonth(res)) {
      items.push({
        loc: `${root}${articleShardPath(m, part.part)}`,
        lastmod: new Date(part.lastmodMs).toISOString(),
      })
    }
  }
  return items
}
