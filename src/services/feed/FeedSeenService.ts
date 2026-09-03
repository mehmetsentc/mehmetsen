import 'server-only'

import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { getDb, hasDatabaseUrl } from '@/db'
import { userContentImpressions } from '@/db/schema/smartFeed'
import { newsClusters } from '@/db/schema/crawler'
import { news } from '@/db/schema/news'
import { FEED_SEEN_LOOKBACK_DAYS, FEED_SEEN_QUERY_LIMIT } from '@/lib/feed/config'

function requireDb() {
  if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
  return getDb()
}

function lookbackCutoff(now = new Date()): Date {
  return new Date(now.getTime() - FEED_SEEN_LOOKBACK_DAYS * 24 * 3_600_000)
}

export type FeedSeenItem = {
  articleId: string
  clusterId?: string | null
  publisherId?: string | null
  feedType?: string
}

export class FeedSeenService {
  /**
   * Expand article IDs across PG id ↔ legacyFirestoreId so the same logical story
   * is suppressed regardless of which identity layer served it.
   */
  async expandArticleIdentities(ids: Set<string>): Promise<Set<string>> {
    if (!ids.size || !hasDatabaseUrl()) return new Set(ids)
    const list = [...ids].slice(0, FEED_SEEN_QUERY_LIMIT)
    try {
      const db = requireDb()
      const rows = await db
        .select({ id: news.id, legacyFirestoreId: news.legacyFirestoreId, slug: news.slug })
        .from(news)
        .where(or(inArray(news.id, list), inArray(news.legacyFirestoreId, list), inArray(news.slug, list)))
        .limit(FEED_SEEN_QUERY_LIMIT)

      const out = new Set(ids)
      for (const row of rows) {
        if (row.id) out.add(row.id)
        if (row.legacyFirestoreId) out.add(row.legacyFirestoreId)
        if (row.slug) out.add(row.slug)
      }
      return out
    } catch {
      return new Set(ids)
    }
  }

  /**
   * Durable consumed identities for hard exclusion (qualified impressions OR article opens).
   * Cross-mode for authenticated users: a story read in Sana Özel stays suppressed in other modes.
   * Guest session rows remain session-scoped.
   */
  async getSeenArticleIds(userId: string | null, sessionId: string | null, feedType: string): Promise<Set<string>> {
    if (!hasDatabaseUrl()) return new Set()
    if (!userId && !sessionId) return new Set()

    const db = requireDb()
    const since = lookbackCutoff()
    const where = userId
      ? and(eq(userContentImpressions.userId, userId), gte(userContentImpressions.lastSeenAt, since))
      : and(
          eq(userContentImpressions.sessionId, sessionId!),
          eq(userContentImpressions.feedType, feedType),
          gte(userContentImpressions.lastSeenAt, since)
        )

    const rows = await db
      .select({ articleId: userContentImpressions.articleId })
      .from(userContentImpressions)
      .where(where)
      .orderBy(desc(userContentImpressions.lastSeenAt))
      .limit(FEED_SEEN_QUERY_LIMIT)

    const raw = new Set(rows.map((r) => r.articleId))
    return this.expandArticleIdentities(raw)
  }

  async getSeenClusterIds(userId: string | null, sessionId: string | null): Promise<Set<string>> {
    if (!hasDatabaseUrl()) return new Set()
    if (!userId && !sessionId) return new Set()

    const db = requireDb()
    const since = lookbackCutoff()
    const where = userId
      ? and(
          eq(userContentImpressions.userId, userId),
          sql`${userContentImpressions.clusterId} IS NOT NULL`,
          gte(userContentImpressions.lastSeenAt, since)
        )
      : and(
          eq(userContentImpressions.sessionId, sessionId!),
          sql`${userContentImpressions.clusterId} IS NOT NULL`,
          gte(userContentImpressions.lastSeenAt, since)
        )

    const rows = await db
      .select({ clusterId: userContentImpressions.clusterId })
      .from(userContentImpressions)
      .where(where)
      .orderBy(desc(userContentImpressions.lastSeenAt))
      .limit(FEED_SEEN_QUERY_LIMIT)

    return new Set(rows.map((r) => r.clusterId).filter((id): id is string => Boolean(id)))
  }

  /** Material update clusters re-eligible even if cluster was seen. */
  async getMaterialUpdateClusterIds(clusterIds: string[]): Promise<Set<string>> {
    if (!clusterIds.length || !hasDatabaseUrl()) return new Set()
    const db = requireDb()
    const rows = await db
      .select({ id: newsClusters.id })
      .from(newsClusters)
      .where(and(inArray(newsClusters.id, clusterIds), eq(newsClusters.hasMaterialUpdate, 1)))
    return new Set(rows.map((r) => r.id))
  }

  async filterSuppressible(
    userId: string | null,
    sessionId: string | null,
    feedType: string,
    clusterIds: string[]
  ): Promise<{ seenArticles: Set<string>; seenClusters: Set<string> }> {
    const [seenArticles, seenClusters] = await Promise.all([
      this.getSeenArticleIds(userId, sessionId, feedType),
      this.getSeenClusterIds(userId, sessionId),
    ])

    const materialUpdates = await this.getMaterialUpdateClusterIds(clusterIds)
    for (const cid of materialUpdates) seenClusters.delete(cid)

    return { seenArticles, seenClusters }
  }

  /**
   * Qualified feed impression (>=60% / >=750ms). Increments impression_count.
   * Do not call this for Haberi Oku — use recordArticleOpens.
   */
  async recordImpressions(
    userId: string | null,
    sessionId: string | null,
    feedType: string,
    items: FeedSeenItem[]
  ): Promise<void> {
    if (!hasDatabaseUrl() || !items.length) return
    if (!userId && !sessionId) return

    const db = requireDb()
    for (const item of items) {
      if (!item.articleId) continue
      try {
        const existing = await db
          .select({ id: userContentImpressions.id, impressionCount: userContentImpressions.impressionCount })
          .from(userContentImpressions)
          .where(
            and(
              eq(userContentImpressions.articleId, item.articleId),
              eq(userContentImpressions.feedType, feedType),
              userId
                ? eq(userContentImpressions.userId, userId)
                : eq(userContentImpressions.sessionId, sessionId!)
            )
          )
          .limit(1)

        if (existing.length) {
          await db
            .update(userContentImpressions)
            .set({
              lastSeenAt: new Date(),
              impressionCount: Math.max(1, existing[0].impressionCount + 1),
              clusterId: item.clusterId ?? null,
              publisherId: item.publisherId ?? null,
            })
            .where(eq(userContentImpressions.id, existing[0].id))
        } else {
          await db.insert(userContentImpressions).values({
            id: randomUUID(),
            userId,
            sessionId,
            articleId: item.articleId,
            clusterId: item.clusterId ?? null,
            publisherId: item.publisherId ?? null,
            feedType,
            impressionCount: 1,
          })
        }
      } catch (err) {
        console.warn('[feed-seen] recordImpressions failed', {
          articleId: item.articleId,
          err: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  /**
   * Strong read signal from Haberi Oku / article detail open.
   * Persists durable exclusion WITHOUT counting as a qualified feed impression
   * (new rows use impression_count=0; existing counts are left unchanged).
   */
  async recordArticleOpens(
    userId: string | null,
    sessionId: string | null,
    feedType: string,
    items: FeedSeenItem[]
  ): Promise<void> {
    if (!hasDatabaseUrl() || !items.length) return
    if (!userId && !sessionId) return

    const db = requireDb()
    for (const item of items) {
      if (!item.articleId) continue
      const type = item.feedType?.trim() || feedType
      try {
        const existing = await db
          .select({ id: userContentImpressions.id })
          .from(userContentImpressions)
          .where(
            and(
              eq(userContentImpressions.articleId, item.articleId),
              eq(userContentImpressions.feedType, type),
              userId
                ? eq(userContentImpressions.userId, userId)
                : eq(userContentImpressions.sessionId, sessionId!)
            )
          )
          .limit(1)

        if (existing.length) {
          await db
            .update(userContentImpressions)
            .set({
              lastSeenAt: new Date(),
              clusterId: item.clusterId ?? null,
              publisherId: item.publisherId ?? null,
            })
            .where(eq(userContentImpressions.id, existing[0].id))
        } else {
          await db.insert(userContentImpressions).values({
            id: randomUUID(),
            userId,
            sessionId,
            articleId: item.articleId,
            clusterId: item.clusterId ?? null,
            publisherId: item.publisherId ?? null,
            feedType: type,
            impressionCount: 0,
          })
        }
      } catch (err) {
        console.warn('[feed-seen] recordArticleOpens failed', {
          articleId: item.articleId,
          err: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }
}

export const feedSeenService = new FeedSeenService()
