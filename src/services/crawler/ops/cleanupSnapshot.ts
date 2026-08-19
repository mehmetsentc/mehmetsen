import { eq, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import {
  clusterMemberships,
  crawlerAiCostLedger,
  crawlerAiJobs,
  crawlerArticleMedia,
  crawlerEditorialAudit,
  discoveredArticleUrls,
  newsClusters,
  newsSources,
  rawArticles,
} from '@/db/schema/crawler'
import { news } from '@/db/schema/news'
import { media } from '@/db/schema/media'
import { MemoryCrawlerStore } from '../store/memory'
import type { CrawlerStore } from '../store/types'
import type { CleanupSnapshot, CmsNewsRef } from './protectedSet'

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

export function snapshotFromMemory(store: MemoryCrawlerStore): CleanupSnapshot {
  return {
    raw: [...store.articles.values()].map((a) => ({
      id: a.id,
      editorialStatus: a.editorialStatus,
      editorialNewsId: a.editorialNewsId,
      clusterId: a.clusterId,
      discoveredUrlId: a.discoveredUrlId,
      originalUrl: a.originalUrl,
      normalizedUrl: a.normalizedUrl,
      canonicalUrl: a.canonicalUrl,
      mainImageUrl: a.mainImageUrl,
      imageUrls: a.imageUrls,
    })),
    clusters: [...store.clusters.values()].map((c) => ({
      id: c.id,
      publishedNewsId: c.publishedNewsId,
      editorialDecision: c.editorialDecision,
      representativeArticleId: c.representativeArticleId,
    })),
    memberships: [...store.memberships.values()].map((m) => ({
      id: m.id,
      clusterId: m.clusterId,
      articleId: m.articleId,
    })),
    media: [...store.media.values()].map((m) => ({
      id: m.id,
      articleId: m.articleId,
      sourceUrl: m.sourceUrl,
      normalizedUrl: m.normalizedUrl,
    })),
    urls: [...store.urls.values()].map((u) => ({
      id: u.id,
      url: u.url,
      normalizedUrl: u.normalizedUrl,
      canonicalUrl: u.canonicalUrl,
      urlHash: u.urlHash,
    })),
    sources: [...store.sources.values()].map((s) => ({ id: s.id, status: s.status })),
    audits: store.audits.map((a) => ({
      id: a.id,
      entityType: a.entityType,
      entityId: a.entityId,
      action: a.action,
    })),
    cmsNews: store.cmsNews,
    cmsMediaUrls: store.cmsNews.flatMap((n) => [n.coverImageUrl, n.thumbnailUrl].filter(Boolean) as string[]),
    aiJobs: store.aiJobCount,
    ledgerRows: store.ledgerRowCount,
    fetchingUrls: [...store.urls.values()].filter((u) => u.status === 'FETCHING').length,
  }
}

async function loadDrizzleSnapshot(): Promise<CleanupSnapshot> {
  const db = getDb()
  const [
    rawRows,
    clusterRows,
    membershipRows,
    mediaRows,
    urlRows,
    sourceRows,
    auditRows,
    newsRows,
    cmsMediaRows,
    jobCount,
    ledgerCount,
  ] = await Promise.all([
    db
      .select({
        id: rawArticles.id,
        editorialStatus: rawArticles.editorialStatus,
        editorialNewsId: rawArticles.editorialNewsId,
        clusterId: rawArticles.clusterId,
        discoveredUrlId: rawArticles.discoveredUrlId,
        originalUrl: rawArticles.originalUrl,
        normalizedUrl: rawArticles.normalizedUrl,
        canonicalUrl: rawArticles.canonicalUrl,
        mainImageUrl: rawArticles.mainImageUrl,
        imageUrls: rawArticles.imageUrls,
      })
      .from(rawArticles),
    db
      .select({
        id: newsClusters.id,
        publishedNewsId: newsClusters.publishedNewsId,
        editorialDecision: newsClusters.editorialDecision,
        representativeArticleId: newsClusters.representativeArticleId,
      })
      .from(newsClusters),
    db
      .select({
        id: clusterMemberships.id,
        clusterId: clusterMemberships.clusterId,
        articleId: clusterMemberships.articleId,
      })
      .from(clusterMemberships),
    db
      .select({
        id: crawlerArticleMedia.id,
        articleId: crawlerArticleMedia.articleId,
        sourceUrl: crawlerArticleMedia.sourceUrl,
        normalizedUrl: crawlerArticleMedia.normalizedUrl,
      })
      .from(crawlerArticleMedia),
    db
      .select({
        id: discoveredArticleUrls.id,
        url: discoveredArticleUrls.url,
        normalizedUrl: discoveredArticleUrls.normalizedUrl,
        canonicalUrl: discoveredArticleUrls.canonicalUrl,
        urlHash: discoveredArticleUrls.urlHash,
      })
      .from(discoveredArticleUrls),
    db.select({ id: newsSources.id, status: newsSources.status }).from(newsSources),
    db
      .select({
        id: crawlerEditorialAudit.id,
        entityType: crawlerEditorialAudit.entityType,
        entityId: crawlerEditorialAudit.entityId,
        action: crawlerEditorialAudit.action,
      })
      .from(crawlerEditorialAudit),
    db
      .select({
        id: news.id,
        status: news.status,
        sourceUrl: news.sourceUrl,
        coverImageUrl: news.coverImageUrl,
        thumbnailUrl: news.thumbnailUrl,
      })
      .from(news),
    db.select({ publicUrl: media.publicUrl, newsId: media.newsId }).from(media),
    db.select({ n: sql<number>`count(*)::int` }).from(crawlerAiJobs),
    db.select({ n: sql<number>`count(*)::int` }).from(crawlerAiCostLedger),
  ])

  const fetching = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(discoveredArticleUrls)
    .where(eq(discoveredArticleUrls.status, 'FETCHING'))

  const cmsNews: CmsNewsRef[] = newsRows.map((n) => ({
    id: n.id,
    status: n.status,
    sourceUrl: n.sourceUrl,
    coverImageUrl: n.coverImageUrl,
    thumbnailUrl: n.thumbnailUrl,
  }))
  const publishedIds = new Set(cmsNews.filter((n) => n.status === 'published').map((n) => n.id))

  return {
    raw: rawRows.map((r) => ({
      ...r,
      imageUrls: strings(r.imageUrls),
    })),
    clusters: clusterRows,
    memberships: membershipRows,
    media: mediaRows,
    urls: urlRows,
    sources: sourceRows,
    audits: auditRows,
    cmsNews,
    cmsMediaUrls: cmsMediaRows.filter((m) => m.newsId && publishedIds.has(m.newsId)).map((m) => m.publicUrl),
    aiJobs: jobCount[0]?.n ?? 0,
    ledgerRows: ledgerCount[0]?.n ?? 0,
    fetchingUrls: fetching[0]?.n ?? 0,
  }
}

export async function loadCleanupSnapshot(store: CrawlerStore): Promise<CleanupSnapshot> {
  if (store instanceof MemoryCrawlerStore) return snapshotFromMemory(store)
  if (!hasDatabaseUrl()) {
    return {
      raw: [],
      clusters: [],
      memberships: [],
      media: [],
      urls: [],
      sources: [],
      audits: [],
      cmsNews: [],
      cmsMediaUrls: [],
      aiJobs: 0,
      ledgerRows: 0,
      fetchingUrls: 0,
    }
  }
  return loadDrizzleSnapshot()
}
