import 'server-only'

import { and, eq, gte, isNull, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { newsClusters, clusterMemberships, rawArticles, newsSources } from '@/db/schema/crawler'
import { evaluateEventSeo } from '@/lib/seo/seoEligibility'
import { deriveEventSlug, eventSlugCandidates } from '@/lib/seo/eventSlug'

export { deriveEventSlug, eventSlugCandidates } from '@/lib/seo/eventSlug'

export interface PublicEventPage {
  id: string
  slug: string
  canonicalTitle: string
  summary: string | null
  sourceCount: number
  uniqueSourceCount: number
  clusterConfidence: number
  eventStatus: string
  aiEligibility: string
  firstSeenAt: Date
  lastSeenAt: Date
  latestArticleAt: Date | null
  city: string | null
  region: string | null
  category: string | null
  representativeArticleId: string | null
  representativeSlug: string | null
  timeline: Array<{
    articleId: string
    title: string
    sourceName: string | null
    publishedAt: Date | null
    url: string | null
  }>
}

export class EventPageService {
  /**
   * Persist seo_slug once (stable forever). Idempotent: never overwrites an existing slug.
   */
  async ensureSeoSlug(cluster: {
    id: string
    seoSlug: string | null
    canonicalTitle: string | null
    eventKey: string | null
  }): Promise<string> {
    if (cluster.seoSlug?.trim()) return cluster.seoSlug.trim().toLowerCase()
    if (!hasDatabaseUrl()) {
      return deriveEventSlug(cluster.canonicalTitle, cluster.eventKey, cluster.id)
    }

    const db = getDb()
    const base = deriveEventSlug(cluster.canonicalTitle, cluster.eventKey, cluster.id)

    for (const candidate of eventSlugCandidates(base, cluster.id)) {
      const [taken] = await db
        .select({ id: newsClusters.id })
        .from(newsClusters)
        .where(eq(newsClusters.seoSlug, candidate))
        .limit(1)

      if (taken && taken.id !== cluster.id) continue

      try {
        await db
          .update(newsClusters)
          .set({ seoSlug: candidate })
          .where(and(eq(newsClusters.id, cluster.id), isNull(newsClusters.seoSlug)))

        const [fresh] = await db
          .select({ seoSlug: newsClusters.seoSlug })
          .from(newsClusters)
          .where(eq(newsClusters.id, cluster.id))
          .limit(1)

        if (fresh?.seoSlug) return fresh.seoSlug
      } catch {
        // unique race — try next candidate
        continue
      }
    }

    return deriveEventSlug(cluster.canonicalTitle, cluster.eventKey, cluster.id)
  }

  async getBySlug(slug: string): Promise<PublicEventPage | null> {
    if (!hasDatabaseUrl()) return null
    const db = getDb()
    const normalized = slug.trim().toLowerCase()

    const [bySeoSlug] = await db
      .select()
      .from(newsClusters)
      .where(eq(newsClusters.seoSlug, normalized))
      .limit(1)

    let cluster = bySeoSlug ?? null

    if (!cluster) {
      const [byEventKey] = await db
        .select()
        .from(newsClusters)
        .where(eq(newsClusters.eventKey, normalized))
        .limit(1)
      cluster = byEventKey ?? null
    }

    if (!cluster) {
      const [byId] = await db.select().from(newsClusters).where(eq(newsClusters.id, normalized)).limit(1)
      cluster = byId ?? null
    }

    if (!cluster) return null

    const eligibility = evaluateEventSeo({
      canonicalTitle: cluster.canonicalTitle,
      sourceCount: cluster.uniqueSourceCount ?? cluster.sourceCount,
      clusterConfidence: cluster.clusterConfidence ?? 0,
      eventStatus: cluster.eventStatus,
      aiEligibility: cluster.aiEligibility,
    })

    if (!eligibility.indexable) return null

    const members = await db
      .select({
        articleId: rawArticles.id,
        title: rawArticles.title,
        sourceName: newsSources.name,
        publishedAt: rawArticles.publishedAt,
        url: rawArticles.originalUrl,
      })
      .from(clusterMemberships)
      .innerJoin(rawArticles, eq(clusterMemberships.articleId, rawArticles.id))
      .innerJoin(newsSources, eq(clusterMemberships.sourceId, newsSources.id))
      .where(eq(clusterMemberships.clusterId, cluster.id))
      .orderBy(sql`${rawArticles.publishedAt} DESC NULLS LAST`)
      .limit(30)

    const eventSlug = await this.ensureSeoSlug(cluster)

    return {
      id: cluster.id,
      slug: eventSlug,
      canonicalTitle: cluster.canonicalTitle ?? 'Olay',
      summary: cluster.materialUpdateReason ?? null,
      sourceCount: cluster.sourceCount,
      uniqueSourceCount: cluster.uniqueSourceCount,
      clusterConfidence: cluster.clusterConfidence,
      eventStatus: cluster.eventStatus,
      aiEligibility: cluster.aiEligibility,
      firstSeenAt: cluster.firstSeenAt,
      lastSeenAt: cluster.lastSeenAt,
      latestArticleAt: cluster.latestArticleAt,
      city: cluster.city,
      region: cluster.region,
      category: cluster.category ?? cluster.categoryHint,
      representativeArticleId: cluster.representativeArticleId,
      representativeSlug: null,
      timeline: members.map((m) => ({
        articleId: m.articleId,
        title: m.title ?? 'Kaynak haber',
        sourceName: m.sourceName,
        publishedAt: m.publishedAt,
        url: m.url,
      })),
    }
  }

  async listIndexable(limit = 500, offset = 0): Promise<Array<{ slug: string; lastmod: Date }>> {
    if (!hasDatabaseUrl()) return []
    const db = getDb()
    const rows = await db
      .select({
        id: newsClusters.id,
        seoSlug: newsClusters.seoSlug,
        eventKey: newsClusters.eventKey,
        canonicalTitle: newsClusters.canonicalTitle,
        lastSeenAt: newsClusters.lastSeenAt,
        uniqueSourceCount: newsClusters.uniqueSourceCount,
        sourceCount: newsClusters.sourceCount,
        clusterConfidence: newsClusters.clusterConfidence,
        eventStatus: newsClusters.eventStatus,
        aiEligibility: newsClusters.aiEligibility,
      })
      .from(newsClusters)
      .where(
        and(
          gte(newsClusters.uniqueSourceCount, 2),
          gte(newsClusters.clusterConfidence, 0.55),
          sql`${newsClusters.canonicalTitle} IS NOT NULL AND length(trim(${newsClusters.canonicalTitle})) > 0`
        )
      )
      .orderBy(sql`${newsClusters.lastSeenAt} DESC`)
      .limit(limit)
      .offset(offset)

    const out: Array<{ slug: string; lastmod: Date }> = []
    for (const r of rows) {
      const ok = evaluateEventSeo({
        canonicalTitle: r.canonicalTitle,
        sourceCount: r.uniqueSourceCount ?? r.sourceCount,
        clusterConfidence: r.clusterConfidence ?? 0,
        eventStatus: r.eventStatus,
        aiEligibility: r.aiEligibility,
      }).indexable
      if (!ok) continue
      const slug = await this.ensureSeoSlug(r)
      out.push({ slug, lastmod: r.lastSeenAt })
    }
    return out
  }
}

export const eventPageService = new EventPageService()
