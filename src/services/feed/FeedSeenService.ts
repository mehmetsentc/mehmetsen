import 'server-only'

import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { getDb, hasDatabaseUrl } from '@/db'
import { userContentImpressions } from '@/db/schema/smartFeed'
import { newsClusters } from '@/db/schema/crawler'
import { news } from '@/db/schema/news'

function requireDb() {
  if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
  return getDb()
}

export class FeedSeenService {
  /**
   * Expand article IDs across PG id ↔ legacyFirestoreId so the same logical story
   * is suppressed regardless of which identity layer served it.
   */
  async expandArticleIdentities(ids: Set<string>): Promise<Set<string>> {
    if (!ids.size || !hasDatabaseUrl()) return new Set(ids)
    const list = [...ids].slice(0, 500)
    try {
      const db = requireDb()
      const rows = await db
        .select({ id: news.id, legacyFirestoreId: news.legacyFirestoreId, slug: news.slug })
        .from(news)
        .where(or(inArray(news.id, list), inArray(news.legacyFirestoreId, list), inArray(news.slug, list)))
        .limit(500)

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

  async getSeenArticleIds(userId: string | null, sessionId: string | null, feedType: string): Promise<Set<string>> {
    if (!hasDatabaseUrl()) return new Set()
    if (!userId && !sessionId) return new Set()

    const db = requireDb()
    const where = userId
      ? and(eq(userContentImpressions.userId, userId), eq(userContentImpressions.feedType, feedType))
      : and(eq(userContentImpressions.sessionId, sessionId!), eq(userContentImpressions.feedType, feedType))

    const rows = await db
      .select({ articleId: userContentImpressions.articleId })
      .from(userContentImpressions)
      .where(where)
      .limit(500)

    const raw = new Set(rows.map((r) => r.articleId))
    return this.expandArticleIdentities(raw)
  }

  async getSeenClusterIds(userId: string | null, sessionId: string | null): Promise<Set<string>> {
    if (!hasDatabaseUrl()) return new Set()
    if (!userId && !sessionId) return new Set()

    const db = requireDb()
    const where = userId
      ? and(eq(userContentImpressions.userId, userId), sql`${userContentImpressions.clusterId} IS NOT NULL`)
      : and(eq(userContentImpressions.sessionId, sessionId!), sql`${userContentImpressions.clusterId} IS NOT NULL`)

    const rows = await db
      .select({ clusterId: userContentImpressions.clusterId })
      .from(userContentImpressions)
      .where(where)
      .limit(500)

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

  async recordImpressions(
    userId: string | null,
    sessionId: string | null,
    feedType: string,
    items: Array<{ articleId: string; clusterId?: string | null; publisherId?: string | null }>
  ): Promise<void> {
    if (!hasDatabaseUrl() || !items.length) return
    if (!userId && !sessionId) return

    const db = requireDb()
    for (const item of items) {
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
            impressionCount: existing[0].impressionCount + 1,
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
        })
      }
    }
  }
}

export const feedSeenService = new FeedSeenService()
