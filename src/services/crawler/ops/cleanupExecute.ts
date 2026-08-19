import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import {
  clusterMemberships,
  crawlerAiDispatchShadow,
  crawlerArticleMedia,
  crawlerEditorialAudit,
  discoveredArticleUrls,
  newsClusters,
  newsSources,
  rawArticles,
} from '@/db/schema/crawler'
import { news } from '@/db/schema/news'
import { newCrawlerId } from '../store/types'
import { MemoryCrawlerStore } from '../store/memory'
import type { CrawlerStore } from '../store/types'
import { loadCleanupSnapshot } from './cleanupSnapshot'
import { writeCrawlerOpsState } from './opsPersist'
import { rebuildCutoffAt } from './rebuildWindow'
import {
  buildCleanupPlan,
  livePlanCompatible,
  type CleanupPlan,
} from './protectedSet'

const BATCH = 200
const PROTECTED_STATUS_SQL = sql`(
  editorial_status = 'PUBLISHED'
  OR editorial_news_id IS NOT NULL
  OR editorial_status IN ('DRAFT','EDITING','IN_REVIEW','AI_CANDIDATE')
)`

export type CleanupExecuteResult = {
  executed: boolean
  blocked?: boolean
  reason?: string
  dryRun: CleanupPlan
  livePlan?: CleanupPlan
  rawDeleted: number
  clusterDeleted: number
  membershipDeleted: number
  mediaDeleted: number
  urlDeleted: number
  sourcesAfter: number
  auditAfter: number
  publishedRawAfter: number
  publishedNewsAfter: number
  binaryObjectsDeleted: 0
  cutoffAt: string | null
  maintenanceReleased: boolean
  immutablePlan: {
    planHash: string
    rawEligible: number
    protectedRaw: number
    clusterEligible: number
    mediaEligible: number
    urlEligible: number
  }
}

function chunk<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function executeOnMemory(store: MemoryCrawlerStore, plan: CleanupPlan): CleanupExecuteResult {
  const protectedRaw = new Set(plan.protectedRawIds)
  const protectedCluster = new Set(plan.protectedClusterIds)
  const protectedMedia = new Set(plan.protectedMediaIds)
  const protectedUrl = new Set(plan.protectedUrlIds)
  let mediaDeleted = 0
  let membershipDeleted = 0
  let rawDeleted = 0
  let clusterDeleted = 0
  let urlDeleted = 0

  for (const id of plan.eligibleMediaIds) {
    const row = store.media.get(id)
    if (!row || protectedMedia.has(id) || protectedRaw.has(row.articleId)) continue
    const article = store.articles.get(row.articleId)
    if (article?.editorialStatus === 'PUBLISHED' || article?.editorialNewsId) continue
    store.media.delete(id)
    mediaDeleted += 1
  }
  for (const [id, m] of [...store.memberships.entries()]) {
    if (protectedCluster.has(m.clusterId) || protectedRaw.has(m.articleId)) continue
    if (!plan.eligibleRawIds.includes(m.articleId) && !plan.eligibleClusterIds.includes(m.clusterId)) continue
    store.memberships.delete(id)
    membershipDeleted += 1
  }
  for (const id of plan.eligibleRawIds) {
    const row = store.articles.get(id)
    if (!row || protectedRaw.has(id)) continue
    if (row.editorialStatus === 'PUBLISHED' || row.editorialNewsId) continue
    if (['DRAFT', 'EDITING', 'IN_REVIEW', 'AI_CANDIDATE'].includes(row.editorialStatus)) continue
    store.articles.delete(id)
    rawDeleted += 1
  }
  for (const id of plan.eligibleClusterIds) {
    if (protectedCluster.has(id)) continue
    const cluster = store.clusters.get(id)
    if (!cluster || cluster.publishedNewsId || cluster.editorialDecision === 'APPROVED_FOR_AI') continue
    const stillHasMember =
      [...store.articles.values()].some((a) => a.clusterId === id) ||
      [...store.memberships.values()].some((m) => m.clusterId === id)
    if (stillHasMember) continue
    store.clusters.delete(id)
    clusterDeleted += 1
  }
  for (const id of plan.eligibleUrlIds) {
    if (protectedUrl.has(id)) continue
    const linked = [...store.articles.values()].some((a) => a.discoveredUrlId === id)
    if (linked) continue
    const url = store.urls.get(id)
    if (!url) continue
    store.urls.delete(id)
    store.urlsByHash.delete(url.urlHash)
    urlDeleted += 1
  }

  return {
    executed: true,
    dryRun: plan,
    rawDeleted,
    clusterDeleted,
    membershipDeleted,
    mediaDeleted,
    urlDeleted,
    sourcesAfter: store.sources.size,
    auditAfter: store.audits.length,
    publishedRawAfter: [...store.articles.values()].filter((a) => a.editorialStatus === 'PUBLISHED').length,
    publishedNewsAfter: store.cmsNews.filter((n) => n.status === 'published').length,
    binaryObjectsDeleted: 0,
    cutoffAt: null,
    maintenanceReleased: true,
    immutablePlan: {
      planHash: plan.planHash,
      rawEligible: plan.rawEligible,
      protectedRaw: plan.protectedRawIds.length,
      clusterEligible: plan.clusterEligible,
      mediaEligible: plan.mediaEligible,
      urlEligible: plan.urlEligible,
    },
  }
}

export async function previewProtectedCleanup(store: CrawlerStore): Promise<CleanupPlan> {
  const snapshot = await loadCleanupSnapshot(store)
  return buildCleanupPlan(snapshot)
}

export async function executeProtectedCleanup(
  store: CrawlerStore,
  opts: { actorId: string; actorEmail?: string | null; actorRole: string; confirmedPlanHash?: string }
): Promise<CleanupExecuteResult> {
  const dryRun = await previewProtectedCleanup(store)
  const immutablePlan = {
    planHash: dryRun.planHash,
    rawEligible: dryRun.rawEligible,
    protectedRaw: dryRun.protectedRawIds.length,
    clusterEligible: dryRun.clusterEligible,
    mediaEligible: dryRun.mediaEligible,
    urlEligible: dryRun.urlEligible,
  }
  console.info('[crawler:4a5] immutable cleanup plan', immutablePlan)

  if (!dryRun.invariantOk) {
    return {
      executed: false,
      blocked: true,
      reason: 'PHASE 4A.5 BLOCKED — PROTECTION INVARIANT FAILED',
      dryRun,
      rawDeleted: 0,
      clusterDeleted: 0,
      membershipDeleted: 0,
      mediaDeleted: 0,
      urlDeleted: 0,
      sourcesAfter: dryRun.sourceCount,
      auditAfter: dryRun.auditRows,
      publishedRawAfter: dryRun.publishedRaw,
      publishedNewsAfter: dryRun.publishedNews,
      binaryObjectsDeleted: 0,
      cutoffAt: null,
      maintenanceReleased: true,
      immutablePlan,
    }
  }

  await writeCrawlerOpsState({ maintenanceMode: 'MAINTENANCE', rebuildStatus: 'CLEANING', planHash: dryRun.planHash }, store)

  const liveSnapshot = await loadCleanupSnapshot(store)
  if (liveSnapshot.fetchingUrls > 0) {
    await writeCrawlerOpsState(
      { maintenanceMode: 'IDLE', rebuildStatus: 'ERROR', lastError: 'active FETCHING urls' },
      store
    )
    return {
      executed: false,
      blocked: true,
      reason: 'PHASE 4A.5 BLOCKED — active crawler mutation (FETCHING)',
      dryRun,
      rawDeleted: 0,
      clusterDeleted: 0,
      membershipDeleted: 0,
      mediaDeleted: 0,
      urlDeleted: 0,
      sourcesAfter: dryRun.sourceCount,
      auditAfter: dryRun.auditRows,
      publishedRawAfter: dryRun.publishedRaw,
      publishedNewsAfter: dryRun.publishedNews,
      binaryObjectsDeleted: 0,
      cutoffAt: null,
      maintenanceReleased: true,
      immutablePlan,
    }
  }

  const livePlan = buildCleanupPlan(liveSnapshot)
  const compat = livePlanCompatible(dryRun, livePlan)
  if (!compat.ok) {
    await writeCrawlerOpsState({ maintenanceMode: 'IDLE', rebuildStatus: 'ERROR', lastError: compat.reason }, store)
    return {
      executed: false,
      blocked: true,
      reason: `PHASE 4A.5 BLOCKED — ${compat.reason}`,
      dryRun,
      livePlan,
      rawDeleted: 0,
      clusterDeleted: 0,
      membershipDeleted: 0,
      mediaDeleted: 0,
      urlDeleted: 0,
      sourcesAfter: dryRun.sourceCount,
      auditAfter: dryRun.auditRows,
      publishedRawAfter: dryRun.publishedRaw,
      publishedNewsAfter: dryRun.publishedNews,
      binaryObjectsDeleted: 0,
      cutoffAt: null,
      maintenanceReleased: true,
      immutablePlan,
    }
  }

  if (opts.confirmedPlanHash && opts.confirmedPlanHash !== livePlan.planHash && opts.confirmedPlanHash !== dryRun.planHash) {
    await writeCrawlerOpsState({ maintenanceMode: 'IDLE', rebuildStatus: 'ERROR', lastError: 'plan hash mismatch' }, store)
    return {
      executed: false,
      blocked: true,
      reason: 'PHASE 4A.5 BLOCKED — plan hash mismatch',
      dryRun,
      livePlan,
      rawDeleted: 0,
      clusterDeleted: 0,
      membershipDeleted: 0,
      mediaDeleted: 0,
      urlDeleted: 0,
      sourcesAfter: dryRun.sourceCount,
      auditAfter: dryRun.auditRows,
      publishedRawAfter: dryRun.publishedRaw,
      publishedNewsAfter: dryRun.publishedNews,
      binaryObjectsDeleted: 0,
      cutoffAt: null,
      maintenanceReleased: true,
      immutablePlan,
    }
  }

  const plan = livePlan
  let result: CleanupExecuteResult
  if (store instanceof MemoryCrawlerStore) {
    result = executeOnMemory(store, plan)
  } else {
    if (!hasDatabaseUrl()) {
      throw new Error('DATABASE_URL missing')
    }
    result = await executeOnDrizzle(plan)
  }

  await store.insertEditorialAudit({
    id: newCrawlerId('aud'),
    actorId: opts.actorId,
    actorEmail: opts.actorEmail ?? null,
    actorRole: opts.actorRole,
    action: 'PROTECTED_BACKLOG_CLEANUP',
    entityType: 'raw_article',
    entityId: null,
    affectedCount: result.rawDeleted,
    skippedCount: plan.protectedRawIds.length,
    failedCount: 0,
    reason: 'phase_4a5_protected_reset',
    note: `planHash=${plan.planHash} rawDeleted=${result.rawDeleted} binaryDeleted=0`,
    previousState: null,
    newState: 'RESET',
    editorialPriority: null,
    selectionMode: 'phase4a5',
    createdAt: new Date(),
  })

  const now = new Date()
  const cutoff = rebuildCutoffAt(now, 24)
  if (store instanceof MemoryCrawlerStore) {
    for (const source of store.sources.values()) {
      if (source.status === 'ACTIVE' || source.status === 'DEGRADED') {
        source.nextDiscoveryAt = now
      }
    }
  } else if (hasDatabaseUrl()) {
    const db = getDb()
    await db.execute(sql`
      UPDATE news_sources
      SET next_discovery_at = NOW(), updated_at = NOW()
      WHERE status IN ('ACTIVE','DEGRADED')
    `)
  }

  await writeCrawlerOpsState(
    {
      maintenanceMode: 'IDLE',
      rebuildStatus: 'REDISCOVERING',
      rebuildWindowHours: 24,
      cutoffAt: cutoff,
      rebuildStartedAt: now,
      rebuildFinishedAt: null,
      planHash: plan.planHash,
      lastError: null,
    },
    store
  )

  result.cutoffAt = cutoff.toISOString()
  result.maintenanceReleased = true
  result.livePlan = plan
  return result
}

async function executeOnDrizzle(plan: CleanupPlan): Promise<CleanupExecuteResult> {
  const db = getDb()
  const protectedRaw = plan.protectedRawIds.length ? plan.protectedRawIds : ['__none__']
  const protectedCluster = plan.protectedClusterIds.length ? plan.protectedClusterIds : ['__none__']
  const protectedMedia = plan.protectedMediaIds.length ? plan.protectedMediaIds : ['__none__']
  const protectedUrl = plan.protectedUrlIds.length ? plan.protectedUrlIds : ['__none__']

  let mediaDeleted = 0
  let membershipDeleted = 0
  let rawDeleted = 0
  let clusterDeleted = 0
  let urlDeleted = 0

  for (const ids of chunk(plan.eligibleMediaIds)) {
    if (!ids.length) continue
    const deleted = await db
      .delete(crawlerArticleMedia)
      .where(
        and(
          inArray(crawlerArticleMedia.id, ids),
          notInArray(crawlerArticleMedia.id, protectedMedia),
          notInArray(crawlerArticleMedia.articleId, protectedRaw),
          sql`${crawlerArticleMedia.articleId} NOT IN (
            SELECT id FROM raw_articles WHERE editorial_status = 'PUBLISHED' OR editorial_news_id IS NOT NULL
          )`
        )
      )
      .returning({ id: crawlerArticleMedia.id })
    mediaDeleted += deleted.length
  }

  for (const ids of chunk(plan.eligibleRawIds)) {
    if (!ids.length) continue
    const deletedM = await db
      .delete(clusterMemberships)
      .where(
        and(
          inArray(clusterMemberships.articleId, ids),
          notInArray(clusterMemberships.articleId, protectedRaw),
          notInArray(clusterMemberships.clusterId, protectedCluster)
        )
      )
      .returning({ id: clusterMemberships.id })
    membershipDeleted += deletedM.length
  }

  for (const ids of chunk(plan.eligibleRawIds)) {
    if (!ids.length) continue
    const deleted = await db
      .delete(rawArticles)
      .where(
        and(
          inArray(rawArticles.id, ids),
          notInArray(rawArticles.id, protectedRaw),
          sql`NOT ${PROTECTED_STATUS_SQL}`
        )
      )
      .returning({ id: rawArticles.id })
    rawDeleted += deleted.length
  }

  for (const ids of chunk(plan.eligibleClusterIds)) {
    if (!ids.length) continue
    await db.delete(crawlerAiDispatchShadow).where(
      and(inArray(crawlerAiDispatchShadow.clusterId, ids), notInArray(crawlerAiDispatchShadow.clusterId, protectedCluster))
    )
    const deleted = await db
      .delete(newsClusters)
      .where(
        and(
          inArray(newsClusters.id, ids),
          notInArray(newsClusters.id, protectedCluster),
          isNull(newsClusters.publishedNewsId),
          sql`${newsClusters.editorialDecision} <> 'APPROVED_FOR_AI'`,
          sql`NOT EXISTS (SELECT 1 FROM raw_articles r WHERE r.cluster_id = news_clusters.id)`,
          sql`NOT EXISTS (SELECT 1 FROM cluster_memberships m WHERE m.cluster_id = news_clusters.id)`
        )
      )
      .returning({ id: newsClusters.id })
    clusterDeleted += deleted.length
  }

  for (const ids of chunk(plan.eligibleUrlIds)) {
    if (!ids.length) continue
    const deleted = await db
      .delete(discoveredArticleUrls)
      .where(
        and(
          inArray(discoveredArticleUrls.id, ids),
          notInArray(discoveredArticleUrls.id, protectedUrl),
          sql`NOT EXISTS (SELECT 1 FROM raw_articles r WHERE r.discovered_url_id = discovered_article_urls.id)`
        )
      )
      .returning({ id: discoveredArticleUrls.id })
    urlDeleted += deleted.length
  }

  const [sourceCount] = await db.select({ n: sql<number>`count(*)::int` }).from(newsSources)
  const [auditCount] = await db.select({ n: sql<number>`count(*)::int` }).from(crawlerEditorialAudit)
  const [publishedRaw] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rawArticles)
    .where(eq(rawArticles.editorialStatus, 'PUBLISHED'))
  const [publishedNews] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(news)
    .where(eq(news.status, 'published'))

  return {
    executed: true,
    dryRun: plan,
    rawDeleted,
    clusterDeleted,
    membershipDeleted,
    mediaDeleted,
    urlDeleted,
    sourcesAfter: sourceCount.n ?? 0,
    auditAfter: auditCount.n ?? 0,
    publishedRawAfter: publishedRaw.n ?? 0,
    publishedNewsAfter: publishedNews.n ?? 0,
    binaryObjectsDeleted: 0,
    cutoffAt: null,
    maintenanceReleased: true,
    immutablePlan: {
      planHash: plan.planHash,
      rawEligible: plan.rawEligible,
      protectedRaw: plan.protectedRawIds.length,
      clusterEligible: plan.clusterEligible,
      mediaEligible: plan.mediaEligible,
      urlEligible: plan.urlEligible,
    },
  }
}
