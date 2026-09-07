import 'server-only'

import { eq, inArray } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { newsClusters, clusterMemberships, rawArticles, newsSources } from '@/db/schema/crawler'

/**
 * P16.2B — Canonical multi-source provenance bridge (read-only).
 *
 * Reuses the EXISTING crawler provenance model:
 *   news.id → news_clusters.publishedNewsId → cluster_memberships → raw_articles → news_sources
 *
 * Does NOT create a new provenance subsystem, table, or role vocabulary.
 * PRIMARY / SUPPORTING come directly from cluster_memberships.membershipRole.
 *
 * Never writes. Never reads/derives rightsStatus, rightsBasis,
 * publicationAuthority, or editorialBlocker. Visibility of a source here
 * NEVER implies rights clearance.
 *
 * Fail-safe: any missing lineage, missing membership, DB error, or absent
 * DATABASE_URL resolves to `[]`. Callers MUST treat `[]` as "no multi-source
 * lineage" and fall back to the existing single `news.source` / `news.sourceUrl`
 * display — this bridge must never become a hard dependency for rendering an
 * article, and an empty/zero source list must never be treated as a
 * publication-gate rejection reason.
 */

export type CanonicalSourceRole = 'PRIMARY' | 'SUPPORTING'

export interface CanonicalSourceRef {
  /** Publisher/source display name (news_sources.name). */
  name: string
  /** Original/canonical article URL for this source, or null if unsafe/missing. */
  url: string | null
  /** Straight from cluster_memberships.membershipRole — no new vocabulary. */
  role: CanonicalSourceRole
  /** raw_articles.publishedAt, ISO string, if known. */
  publishedAt: string | null
}

function isSafeHttpUrl(raw: string | null | undefined): raw is string {
  if (!raw) return false
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Resolve the real (deduped) source list for a canonical `news.id`, if a
 * cluster lineage exists. Returns `[]` when there is nothing to show —
 * that is the fallback signal, not an error.
 */
export async function resolveCanonicalNewsSources(
  newsId: string | null | undefined
): Promise<CanonicalSourceRef[]> {
  const id = newsId?.trim()
  if (!id || !hasDatabaseUrl()) return []

  try {
    const db = getDb()

    const clusters = await db
      .select({ id: newsClusters.id })
      .from(newsClusters)
      .where(eq(newsClusters.publishedNewsId, id))
      .limit(1)

    const cluster = clusters[0]
    if (!cluster) return []

    const memberships = await db
      .select({
        membershipRole: clusterMemberships.membershipRole,
        createdAt: clusterMemberships.createdAt,
        sourceId: clusterMemberships.sourceId,
        articleId: clusterMemberships.articleId,
      })
      .from(clusterMemberships)
      .where(eq(clusterMemberships.clusterId, cluster.id))

    if (memberships.length === 0) return []

    const sourceIds = Array.from(
      new Set(memberships.map((m) => m.sourceId).filter((v): v is string => Boolean(v)))
    )
    const articleIds = Array.from(
      new Set(memberships.map((m) => m.articleId).filter((v): v is string => Boolean(v)))
    )
    if (sourceIds.length === 0) return []

    const [sourceRows, articleRows] = await Promise.all([
      db
        .select({ id: newsSources.id, name: newsSources.name })
        .from(newsSources)
        .where(inArray(newsSources.id, sourceIds)),
      articleIds.length > 0
        ? db
            .select({
              id: rawArticles.id,
              canonicalUrl: rawArticles.canonicalUrl,
              originalUrl: rawArticles.originalUrl,
              publishedAt: rawArticles.publishedAt,
            })
            .from(rawArticles)
            .where(inArray(rawArticles.id, articleIds))
        : Promise.resolve([]),
    ])

    const sourceById = new Map(sourceRows.map((s) => [s.id, s]))
    const articleById = new Map(articleRows.map((a) => [a.id, a]))

    // Deterministic ordering: PRIMARY first, then earliest membership —
    // so dedup below always keeps the "best" occurrence of a real source.
    const ordered = [...memberships].sort((a, b) => {
      const roleRank = (r: string | null) => (r === 'PRIMARY' ? 0 : 1)
      const ra = roleRank(a.membershipRole)
      const rb = roleRank(b.membershipRole)
      if (ra !== rb) return ra - rb
      const ta = a.createdAt ? new Date(a.createdAt as unknown as string).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt as unknown as string).getTime() : 0
      return ta - tb
    })

    // Dedup by real source identity (news_sources.id) — never show the same
    // publisher twice even if it contributed more than one clustered article.
    const seenSourceIds = new Set<string>()
    const result: CanonicalSourceRef[] = []

    for (const m of ordered) {
      if (!m.sourceId || seenSourceIds.has(m.sourceId)) continue
      const source = sourceById.get(m.sourceId)
      if (!source) continue // unresolved FK target — skip rather than show a blank name

      const article = m.articleId ? articleById.get(m.articleId) : undefined
      const rawUrl = article?.canonicalUrl || article?.originalUrl || null

      seenSourceIds.add(m.sourceId)
      result.push({
        name: source.name,
        url: isSafeHttpUrl(rawUrl) ? rawUrl : null,
        role: m.membershipRole === 'PRIMARY' ? 'PRIMARY' : 'SUPPORTING',
        publishedAt: article?.publishedAt ? new Date(article.publishedAt as unknown as string).toISOString() : null,
      })
    }

    return result
  } catch (error) {
    console.warn('[canonicalSourceProvenance] resolveCanonicalNewsSources error:', error)
    return []
  }
}
