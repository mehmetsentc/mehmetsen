import { eq, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { crawlerOpsState, discoveredArticleUrls, newsClusters, rawArticles } from '@/db/schema/crawler'
import { MemoryCrawlerStore } from '../store/memory'
import type { CrawlerStore } from '../store/types'
import {
  defaultOpsState,
  opsStateFromUnknown,
  patchMemoryOps,
  type CrawlerOpsState,
  type RebuildStatus,
} from './opsState'

function mapRow(row: typeof crawlerOpsState.$inferSelect): CrawlerOpsState {
  return {
    id: 'global',
    maintenanceMode: (row.maintenanceMode as CrawlerOpsState['maintenanceMode']) || 'IDLE',
    rebuildStatus: (row.rebuildStatus as RebuildStatus) || 'IDLE',
    rebuildWindowHours: row.rebuildWindowHours ?? 24,
    cutoffAt: row.cutoffAt,
    rebuildStartedAt: row.rebuildStartedAt,
    rebuildFinishedAt: row.rebuildFinishedAt,
    planHash: row.planHash,
    lastError: row.lastError,
    discovered: row.discovered ?? 0,
    pending: row.pending ?? 0,
    extracted: row.extracted ?? 0,
    failed: row.failed ?? 0,
    events: row.events ?? 0,
    multiSource: row.multiSource ?? 0,
    updatedAt: row.updatedAt,
  }
}

export async function readCrawlerOpsState(store?: CrawlerStore): Promise<CrawlerOpsState> {
  const memory = opsStateFromUnknown(store)
  if (memory) return memory
  if (!hasDatabaseUrl()) return defaultOpsState()
  try {
    const db = getDb()
    const rows = await db.select().from(crawlerOpsState).where(eq(crawlerOpsState.id, 'global')).limit(1)
    if (!rows[0]) {
      await db.insert(crawlerOpsState).values({ id: 'global' }).onConflictDoNothing()
      return defaultOpsState()
    }
    return mapRow(rows[0])
  } catch {
    return defaultOpsState()
  }
}

export async function writeCrawlerOpsState(
  patch: Partial<CrawlerOpsState>,
  store?: CrawlerStore
): Promise<CrawlerOpsState> {
  if (store instanceof MemoryCrawlerStore || opsStateFromUnknown(store)) {
    return patchMemoryOps(store, patch)
  }
  if (!hasDatabaseUrl()) return { ...defaultOpsState(), ...patch, updatedAt: new Date() }
  const db = getDb()
  const current = await readCrawlerOpsState()
  const next = { ...current, ...patch, updatedAt: new Date() }
  await db
    .insert(crawlerOpsState)
    .values({
      id: 'global',
      maintenanceMode: next.maintenanceMode,
      rebuildStatus: next.rebuildStatus,
      rebuildWindowHours: next.rebuildWindowHours,
      cutoffAt: next.cutoffAt,
      rebuildStartedAt: next.rebuildStartedAt,
      rebuildFinishedAt: next.rebuildFinishedAt,
      planHash: next.planHash,
      lastError: next.lastError,
      discovered: next.discovered,
      pending: next.pending,
      extracted: next.extracted,
      failed: next.failed,
      events: next.events,
      multiSource: next.multiSource,
      updatedAt: next.updatedAt,
    })
    .onConflictDoUpdate({
      target: crawlerOpsState.id,
      set: {
        maintenanceMode: next.maintenanceMode,
        rebuildStatus: next.rebuildStatus,
        rebuildWindowHours: next.rebuildWindowHours,
        cutoffAt: next.cutoffAt,
        rebuildStartedAt: next.rebuildStartedAt,
        rebuildFinishedAt: next.rebuildFinishedAt,
        planHash: next.planHash,
        lastError: next.lastError,
        discovered: next.discovered,
        pending: next.pending,
        extracted: next.extracted,
        failed: next.failed,
        events: next.events,
        multiSource: next.multiSource,
        updatedAt: next.updatedAt,
      },
    })
  return next
}

export async function refreshRebuildProgress(store?: CrawlerStore): Promise<CrawlerOpsState> {
  const ops = await readCrawlerOpsState(store)
  if (ops.rebuildStatus === 'IDLE' || ops.rebuildStatus === 'ERROR') return ops
  if (store instanceof MemoryCrawlerStore) {
    const pending = [...store.urls.values()].filter((u) => u.status === 'PENDING_FETCH' || u.status === 'FETCHING').length
    const extracted = [...store.articles.values()].length
    const failed = [...store.urls.values()].filter((u) => String(u.status).startsWith('FAILED')).length
    const events = store.clusters.size
    const multiSource = [...store.clusters.values()].filter((c) => (c.uniqueSourceCount || 0) >= 2).length
    let rebuildStatus = ops.rebuildStatus
    if (ops.rebuildStatus === 'REDISCOVERING' && (pending > 0 || store.urls.size > 0)) rebuildStatus = 'PROCESSING'
    return writeCrawlerOpsState(
      {
        discovered: store.urls.size,
        pending,
        extracted,
        failed,
        events,
        multiSource,
        rebuildStatus,
      },
      store
    )
  }
  if (!hasDatabaseUrl()) return ops
  const db = getDb()
  const [urlCounts] = await db
    .select({
      discovered: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${discoveredArticleUrls.status} in ('PENDING_FETCH','FETCHING'))::int`,
      failed: sql<number>`count(*) filter (where ${discoveredArticleUrls.status}::text like 'FAILED%')::int`,
    })
    .from(discoveredArticleUrls)
  const [rawCount] = await db.select({ n: sql<number>`count(*)::int` }).from(rawArticles)
  const [clusterCounts] = await db
    .select({
      events: sql<number>`count(*)::int`,
      multiSource: sql<number>`count(*) filter (where ${newsClusters.uniqueSourceCount} >= 2)::int`,
    })
    .from(newsClusters)
  const discovered = urlCounts?.discovered ?? 0
  const pending = urlCounts?.pending ?? 0
  const failed = urlCounts?.failed ?? 0
  const extracted = rawCount?.n ?? 0
  const events = clusterCounts?.events ?? 0
  const multiSource = clusterCounts?.multiSource ?? 0
  let rebuildStatus = ops.rebuildStatus
  if (ops.rebuildStatus === 'REDISCOVERING' && (pending > 0 || discovered > 0)) rebuildStatus = 'PROCESSING'
  return writeCrawlerOpsState({
    discovered,
    pending,
    extracted,
    failed,
    events,
    multiSource,
    rebuildStatus,
  })
}
