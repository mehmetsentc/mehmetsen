/**
 * Faz A3 Task 2 / Task 16 — Canonical Hafıza Kapsamı (coverage probe).
 *
 * READ ONLY. Answers "how much historical content is available in
 * Postgres canonical news?" so the admin can tell BAD MATCHING apart from
 * an EMPTY CANONICAL ARCHIVE when the "Geçmişi Ara" panel returns few or no
 * results.
 *
 * This intentionally does NOT query Firestore and does NOT create a second
 * monitoring subsystem — it reuses the same canonicalPublishedWhere()
 * predicate already used by the sitemap/article-detail canonical reads
 * (A2 Bölüm 3), aggregated instead of row-by-row.
 *
 * The dev shell used for earlier phases of this audit has no network
 * access to Postgres (established since A1), so this query has never run
 * outside of production. It is designed to run server-side, inside the
 * existing CMS-authenticated admin API route, in production — exactly the
 * fallback this task's own brief anticipates.
 */

import { sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { canonicalPublishedWhere } from '@/lib/canonical/canonicalEligibility'
import type { CanonicalMemoryCoverageStats } from './editorialMemoryTypes'

const EMPTY: CanonicalMemoryCoverageStats = {
  hasDatabaseUrl: false,
  total: 0,
  oldestPublishedAt: null,
  newestPublishedAt: null,
  last7d: 0,
  last30d: 0,
  last90d: 0,
  last365d: 0,
  olderThan365d: 0,
  topCities: [],
  topCategories: [],
}

export async function getCanonicalMemoryCoverage(): Promise<CanonicalMemoryCoverageStats> {
  if (!hasDatabaseUrl()) return { ...EMPTY }

  const db = getDb()
  const where = canonicalPublishedWhere()

  try {
    const [{ total, oldest, newest }] = await db
      .select({
        total: sql<number>`count(*)`,
        oldest: sql<Date | null>`min(${news.publishedAt})`,
        newest: sql<Date | null>`max(${news.publishedAt})`,
      })
      .from(news)
      .where(where)

    const [buckets] = await db
      .select({
        last7d: sql<number>`count(*) filter (where ${news.publishedAt} >= now() - interval '7 days')`,
        last30d: sql<number>`count(*) filter (where ${news.publishedAt} >= now() - interval '30 days')`,
        last90d: sql<number>`count(*) filter (where ${news.publishedAt} >= now() - interval '90 days')`,
        last365d: sql<number>`count(*) filter (where ${news.publishedAt} >= now() - interval '365 days')`,
        olderThan365d: sql<number>`count(*) filter (where ${news.publishedAt} < now() - interval '365 days')`,
      })
      .from(news)
      .where(where)

    const cityRows = await db
      .select({ citySlug: news.citySlug, count: sql<number>`count(*)` })
      .from(news)
      .where(sql`${where} AND ${news.citySlug} IS NOT NULL`)
      .groupBy(news.citySlug)
      .orderBy(sql`count(*) desc`)
      .limit(5)

    const categoryRows = await db
      .select({ categoryId: news.categoryId, count: sql<number>`count(*)` })
      .from(news)
      .where(sql`${where} AND ${news.categoryId} IS NOT NULL`)
      .groupBy(news.categoryId)
      .orderBy(sql`count(*) desc`)
      .limit(5)

    return {
      hasDatabaseUrl: true,
      total: Number(total ?? 0),
      oldestPublishedAt: oldest ? new Date(oldest).toISOString() : null,
      newestPublishedAt: newest ? new Date(newest).toISOString() : null,
      last7d: Number(buckets?.last7d ?? 0),
      last30d: Number(buckets?.last30d ?? 0),
      last90d: Number(buckets?.last90d ?? 0),
      last365d: Number(buckets?.last365d ?? 0),
      olderThan365d: Number(buckets?.olderThan365d ?? 0),
      topCities: cityRows
        .filter((r): r is { citySlug: string; count: number } => Boolean(r.citySlug))
        .map((r) => ({ citySlug: r.citySlug, count: Number(r.count) })),
      topCategories: categoryRows
        .filter((r): r is { categoryId: string; count: number } => Boolean(r.categoryId))
        .map((r) => ({ categoryId: r.categoryId, count: Number(r.count) })),
    }
  } catch (error) {
    console.warn('[editorialMemoryCoverage] query error:', error)
    return {
      ...EMPTY,
      hasDatabaseUrl: true,
      queryError: error instanceof Error ? error.message : String(error),
    }
  }
}
