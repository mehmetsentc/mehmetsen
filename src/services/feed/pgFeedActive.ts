import 'server-only'
import { and, gte, sql } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { canonicalPublishedWhere } from '@/lib/canonical/canonicalEligibility'

/**
 * FinOps 3 Oct: the smart feed asks Postgres first, but the PG canonical table has
 * had no new published story since 4 Sep (5 published rows in total), so every
 * request paid a PG round-trip (keeping Neon awake) and then fell back to Firestore
 * anyway ("pg_empty"). Check once per 30 minutes (shared data cache) whether PG has
 * any published story from the last 14 days; when it does not, the feed goes
 * straight to the Firestore path it already ended up on.
 */
const PG_FEED_RECENT_DAYS = 14

const loadPgFeedActive = unstable_cache(
  async (): Promise<boolean> => {
    if (!hasDatabaseUrl()) return false
    try {
      const rows = await getDb()
        .select({ id: news.id })
        .from(news)
        .where(
          and(
            canonicalPublishedWhere(),
            gte(news.publishedAt, sql`now() - (${PG_FEED_RECENT_DAYS} || ' days')::interval`)
          )
        )
        .limit(1)
      return rows.length > 0
    } catch {
      return true
    }
  },
  ['pg-feed-active-v1'],
  { revalidate: 1800, tags: ['canonical-news'] }
)

/** True when the PG primary feed path can return anything. Errors keep the PG path. */
const PG_FEED_ACTIVE_MEMO_MS = 30 * 60 * 1000
let pgFeedActiveMemo: { at: number; value: boolean } | null = null

export async function isPgFeedActive(): Promise<boolean> {
  if (!hasDatabaseUrl()) return false
  const now = Date.now()
  if (pgFeedActiveMemo && now - pgFeedActiveMemo.at < PG_FEED_ACTIVE_MEMO_MS) {
    return pgFeedActiveMemo.value
  }
  try {
    const value = await loadPgFeedActive()
    pgFeedActiveMemo = { at: now, value }
    return value
  } catch {
    return true
  }
}
