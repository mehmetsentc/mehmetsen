import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { MemoryCrawlerStore } from '../store/memory'
import { dispatchCrawlerArticleToNewsroom, isCrawlerAiDispatchEnabled, crawlerAiDispatchDryRunStatus } from '../dispatch'
import { isLegacyDirectAiEnabled } from '../legacyFlags'
import { runClusterBulk } from './bulk'
import { authorizeCrawlerBulk } from './rbac'
import {
  ARTICLE_BULK_CAP_ERROR,
  approvedAiStatus,
  BULK_EVENT_CAP,
  CLUSTER_BULK_CAP_ERROR,
  eventAgeHours,
  requiresStaleSecondConfirm,
  sourceDiversityLabel,
  staleWarning,
} from './controlPlane'
import { matchesClusterQuery, paginateSlice } from './query'
import { estimateDispatchCost } from '../aiDispatch/cost'
import { isCrawlerAiProviderWired } from '../aiDispatch/flags'
import type { InsertRawArticleInput } from '../store/types'
import type { CmsRole } from '@/types/cms'
import type { NewsSourceRecord } from '../types'

const NOW = new Date('2026-08-19T12:00:00Z')
const editor: { uid: string; role: CmsRole; email: string } = {
  uid: 'ed_1',
  role: 'editor',
  email: 'editor@nahaber.com',
}

async function seedSource(store: MemoryCrawlerStore, name = 'AA', city = 'İzmir') {
  return store.insertSource({
    name,
    domain: `${name.toLowerCase()}.test`,
    baseUrl: `https://${name.toLowerCase()}.test`,
    countryCode: 'TR',
    language: 'tr',
    city,
    status: name === 'PAUSED_SRC' ? 'PAUSED' : 'ACTIVE',
  })
}

async function seedArticle(
  store: MemoryCrawlerStore,
  source: NewsSourceRecord,
  title: string,
  opts?: Partial<InsertRawArticleInput>
) {
  return store.insertRawArticle({
    sourceId: source.id,
    discoveredUrlId: null,
    originalUrl: `https://${source.domain}/${title}`,
    normalizedUrl: `https://${source.domain}/${title}`,
    canonicalUrl: `https://${source.domain}/${title}`,
    urlHash: title,
    title,
    description: title,
    articleBodyText: title.repeat(20),
    articleBodyHtml: `<p>${title}</p>`,
    author: null,
    publishedAt: NOW,
    modifiedAt: null,
    language: 'tr',
    countryCode: 'TR',
    region: null,
    city: source.city,
    district: null,
    mainImageUrl: null,
    imageUrls: [],
    videoUrls: [],
    wordCount: 40,
    charCount: 200,
    paragraphCount: 1,
    contentHash: `h-${title}`,
    titleHash: `t-${title}`,
    simhash: null,
    extractionMethod: 'semantic-html',
    extractionConfidence: 0.9,
    httpStatus: 200,
    fetchDurationMs: 10,
    fetchedAt: NOW,
    ...opts,
  })
}

async function seedEvent(store: MemoryCrawlerStore, src: NewsSourceRecord, topic: string, patch?: Record<string, unknown>) {
  const article = await seedArticle(store, src, topic)
  const cluster = await store.insertCluster({
    representativeArticleId: article.id,
    normalizedTopic: topic,
    countryCode: 'TR',
    city: src.city,
  })
  await store.insertMembership({
    clusterId: cluster.id,
    articleId: article.id,
    sourceId: src.id,
    similarityScore: 1,
    matchBand: 'HIGH',
  })
  if (patch) await store.updateCluster(cluster.id, patch)
  return store.getCluster(cluster.id)
}

describe('phase 4A.2 editorial control plane', () => {
  it('D single event approval does not dispatch or overwrite scores', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const cluster = await seedEvent(store, src, 'single', { aiEligibility: 'ELIGIBLE', importanceScore: 77 })
    const result = await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      ids: [cluster!.id],
      editorialPriority: 'NORMAL',
      approvalSource: 'cms_single',
      selectionMode: 'single',
    })
    if ('error' in result) throw new Error(result.error)
    const after = await store.getCluster(cluster!.id)
    expect(after?.editorialDecision).toBe('APPROVED_FOR_AI')
    expect(after?.approvalSource).toBe('cms_single')
    expect(after?.editorialPriority).toBe('NORMAL')
    expect(after?.aiEligibility).toBe('ELIGIBLE')
    expect(after?.importanceScore).toBe(77)
    expect(result.aiRequests).toBe(0)
    expect(result.dispatchAttempted).toBe(false)
  })

  it('E bulk approval with priorities L/M', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const a = await seedEvent(store, src, 'a', { aiEligibility: 'ELIGIBLE' })
    const b = await seedEvent(store, src, 'b', { aiEligibility: 'HIGH_PRIORITY' })
    const high = await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      ids: [a!.id],
      editorialPriority: 'HIGH',
      approvalSource: 'cms_bulk',
    })
    const breaking = await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      ids: [b!.id],
      editorialPriority: 'BREAKING',
    })
    if ('error' in high || 'error' in breaking) throw new Error('bulk failed')
    expect((await store.getCluster(a!.id))?.editorialPriority).toBe('HIGH')
    expect((await store.getCluster(b!.id))?.editorialPriority).toBe('BREAKING')
  })

  it('F G current page vs all matching; I filter preservation', async () => {
    const store = new MemoryCrawlerStore()
    const izmir = await seedSource(store, 'IZ', 'İzmir')
    const ankara = await seedSource(store, 'ANK', 'Ankara')
    await seedEvent(store, izmir, 'i1', { aiEligibility: 'ELIGIBLE' })
    await seedEvent(store, izmir, 'i2', { aiEligibility: 'ELIGIBLE' })
    await seedEvent(store, ankara, 'a1', { aiEligibility: 'ELIGIBLE' })
    const matching = await store.listClustersMatching({ city: 'İzmir', eligibility: 'ELIGIBLE' })
    expect(matching).toHaveLength(2)
    const result = await runClusterBulk({
      store,
      actor: editor,
      op: 'watch',
      matchFilter: true,
      filter: { city: 'İzmir', eligibility: 'ELIGIBLE' },
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.affected).toBe(2)
    expect((await store.getCluster(matching[0].id))?.editorialDecision).toBe('WATCHING')
    expect((await store.listClustersMatching({ city: 'Ankara' }))[0].editorialDecision).toBe('NONE')
  })

  it('H 500 cap errors instead of silent first-500', async () => {
    expect(BULK_EVENT_CAP).toBe(500)
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const ids: string[] = []
    for (let i = 0; i < 501; i += 1) ids.push(`cl_${i}`)
    const result = await runClusterBulk({ store, actor: editor, op: 'watch', ids })
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error).toBe(CLUSTER_BULK_CAP_ERROR)
    expect(ARTICLE_BULK_CAP_ERROR).toContain('500')
  })

  it('J approved tab query + AI status waiting while dispatch closed', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const cluster = await seedEvent(store, src, 'ok', { aiEligibility: 'ELIGIBLE' })
    await runClusterBulk({ store, actor: editor, op: 'approve_for_ai', ids: [cluster!.id] })
    const approved = await store.listClustersMatching({ tab: 'approved' })
    expect(approved).toHaveLength(1)
    expect(approvedAiStatus({ dispatchEnabled: false })).toBe('BEKLİYOR — AI DISPATCH KAPALI')
    expect(approvedAiStatus({ dispatchEnabled: false, jobStatus: 'PROCESSING' })).toBe('PROCESSING')
  })

  it('N O algorithmic importance and eligibility preserved', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const cluster = await seedEvent(store, src, 'keep', {
      aiEligibility: 'HIGH_PRIORITY',
      importanceScore: 91,
    })
    await runClusterBulk({ store, actor: editor, op: 'approve_for_ai', ids: [cluster!.id], editorialPriority: 'BREAKING' })
    const after = await store.getCluster(cluster!.id)
    expect(after?.importanceScore).toBe(91)
    expect(after?.aiEligibility).toBe('HIGH_PRIORITY')
    expect(after?.editorialPriority).toBe('BREAKING')
  })

  it('P watching does not call AI', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const cluster = await seedEvent(store, src, 'watch')
    const result = await runClusterBulk({ store, actor: editor, op: 'watch', ids: [cluster!.id] })
    if ('error' in result) throw new Error(result.error)
    expect(result.aiRequests).toBe(0)
    expect((await store.getCluster(cluster!.id))?.editorialDecision).toBe('WATCHING')
  })

  it('Q reject reuses codes and does not delete', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const cluster = await seedEvent(store, src, 'rej')
    const result = await runClusterBulk({
      store,
      actor: editor,
      op: 'reject',
      ids: [cluster!.id],
      reason: 'DUPLICATE',
      note: 'aynı olay',
    })
    if ('error' in result) throw new Error(result.error)
    const after = await store.getCluster(cluster!.id)
    expect(after).toBeTruthy()
    expect(after?.editorialDecision).toBe('REJECTED')
    expect(after?.editorialDecisionReason).toBe('DUPLICATE')
  })

  it('R archive is soft', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const cluster = await seedEvent(store, src, 'arc')
    await runClusterBulk({ store, actor: editor, op: 'archive', ids: [cluster!.id] })
    expect(await store.getCluster(cluster!.id)).toBeTruthy()
    expect((await store.getCluster(cluster!.id))?.editorialDecision).toBe('ARCHIVED')
  })

  it('S T restore rejected/archived goes to NONE not APPROVED_FOR_AI', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const rejected = await seedEvent(store, src, 'rj')
    const archived = await seedEvent(store, src, 'ar')
    await runClusterBulk({ store, actor: editor, op: 'reject', ids: [rejected!.id], reason: 'STALE' })
    await runClusterBulk({ store, actor: editor, op: 'archive', ids: [archived!.id] })
    await runClusterBulk({ store, actor: editor, op: 'restore', ids: [rejected!.id, archived!.id] })
    expect((await store.getCluster(rejected!.id))?.editorialDecision).toBe('NONE')
    expect((await store.getCluster(archived!.id))?.editorialDecision).toBe('NONE')
  })

  it('U V stale warning and 72h second confirm', async () => {
    expect(staleWarning(25, 24)).toBe(true)
    expect(requiresStaleSecondConfirm(79)).toBe(true)
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const cluster = await seedEvent(store, src, 'old')
    await store.updateCluster(cluster!.id, { firstSeenAt: new Date(NOW.getTime() - 80 * 3600 * 1000) })
    const blocked = await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      ids: [cluster!.id],
      confirmStale: false,
    })
    expect('error' in blocked).toBe(true)
    const ok = await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      ids: [cluster!.id],
      confirmStale: true,
    })
    if ('error' in ok) throw new Error(ok.error)
    expect(ok.affected).toBe(1)
    expect(eventAgeHours((await store.getCluster(cluster!.id))!, NOW)).toBeGreaterThan(72)
  })

  it('W X Y evidence helpers and source diversity', () => {
    expect(sourceDiversityLabel(3, 1)).toBe('3 haber / 1 kaynak')
    expect(sourceDiversityLabel(3, 3)).toBe('3 kaynak')
  })

  it('Z audit records actor entity prev/new priority selection mode', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const cluster = await seedEvent(store, src, 'aud')
    await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      ids: [cluster!.id],
      editorialPriority: 'HIGH',
      selectionMode: 'single',
    })
    const audits = await store.listEditorialAudits()
    const row = audits.find((a) => a.entityId === cluster!.id)
    expect(row).toBeTruthy()
    expect(row?.actorId).toBe(editor.uid)
    expect(row?.previousState).toBe('NONE')
    expect(row?.newState).toBe('APPROVED_FOR_AI')
    expect(row?.editorialPriority).toBe('HIGH')
    expect(row?.selectionMode).toBe('single')
  })

  it('AA RBAC uses news:edit / news:bulk_action', () => {
    expect(authorizeCrawlerBulk('editor', 'approve_for_ai').ok).toBe(true)
    expect(authorizeCrawlerBulk('author', 'approve_for_ai').ok).toBe(false)
    expect(authorizeCrawlerBulk('video_editor', 'restore').ok).toBe(false)
  })

  it('AB concurrency partial success', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const a = await seedEvent(store, src, 'c1')
    const b = await seedEvent(store, src, 'c2')
    await store.updateCluster(b!.id, { editorialDecision: 'WATCHING' })
    const result = await runClusterBulk({
      store,
      actor: editor,
      op: 'watch',
      ids: [a!.id, b!.id, 'missing'],
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.affected).toBe(1)
    expect(result.skipped).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('AC pagination 25/50/100', () => {
    const items = Array.from({ length: 60 }, (_, i) => i)
    const p1 = paginateSlice(items, 1, 25)
    expect(p1.items).toHaveLength(25)
    expect(p1.total).toBe(60)
    expect(p1.totalPages).toBe(3)
    expect(paginateSlice(items, 1, 50).items).toHaveLength(50)
    expect(paginateSlice(items, 1, 100).items).toHaveLength(60)
  })

  it('AD AE AF all/paused/local sources remain listable', async () => {
    const store = new MemoryCrawlerStore()
    await seedSource(store, 'PAUSED_SRC', 'Çanakkale')
    await seedSource(store, 'LOCAL', 'Çanakkale')
    const sources = await store.listSources()
    expect(sources.some((s) => s.status === 'PAUSED')).toBe(true)
    expect(sources.some((s) => s.city === 'Çanakkale')).toBe(true)
    expect(matchesClusterQuery).toBeTypeOf('function')
  })

  it('AG-AJ provider isolation: approval does not fetch paid providers', async () => {
    const hits: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      hits.push(String(input))
      throw new Error('network should not run')
    }) as typeof fetch
    try {
      const store = new MemoryCrawlerStore()
      const src = await seedSource(store)
      const cluster = await seedEvent(store, src, 'noai')
      await runClusterBulk({ store, actor: editor, op: 'approve_for_ai', ids: [cluster!.id] })
      expect(hits.some((h) => /deepseek|googleapis|groq|openrouter/i.test(h))).toBe(false)
      expect(isCrawlerAiProviderWired()).toBe(false)
    } finally {
      globalThis.fetch = original
    }
  })

  it('AK-AN no jobs, no publish, kill switches stay false', async () => {
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
    expect(isLegacyDirectAiEnabled()).toBe(false)
    const gate = dispatchCrawlerArticleToNewsroom()
    expect(gate.aiRequests).toBe(0)
    expect(gate.dispatched).toBe(false)
  })

  it('AO COST_UNKNOWN preserved; dry-run missing is TANIMSIZ', () => {
    const cost = estimateDispatchCost({
      estimatedInputTokens: 800,
      estimatedOutputTokens: 200,
      estimatedTotalTokens: 1000,
    })
    expect(cost.known).toBe(false)
    expect(cost.reason).toBe('COST_UNKNOWN')
    expect(cost.estimatedCostUsd).toBeNull()
    const prev = process.env.CRAWLER_AI_DISPATCH_DRY_RUN
    delete process.env.CRAWLER_AI_DISPATCH_DRY_RUN
    expect(crawlerAiDispatchDryRunStatus()).toBe('TANIMSIZ')
    if (prev == null) delete process.env.CRAWLER_AI_DISPATCH_DRY_RUN
    else process.env.CRAWLER_AI_DISPATCH_DRY_RUN = prev
  })

  it('B C 0006/0007/0008 additive SQL', () => {
    const sql6 = readFileSync('src/db/migrations/0006_crawler_phase4a_ai_dispatch.sql', 'utf8')
    const sql7 = readFileSync('src/db/migrations/0007_crawler_phase4a1_editorial_bulk.sql', 'utf8')
    const sql8 = readFileSync('src/db/migrations/0008_crawler_phase4a2_editorial_control.sql', 'utf8')
    for (const sql of [sql6, sql7, sql8]) {
      expect(sql.toUpperCase()).not.toMatch(/\bDROP TABLE\b/)
      expect(sql.toUpperCase()).not.toMatch(/\bDROP COLUMN\b/)
      expect(sql.toUpperCase()).not.toMatch(/\bTRUNCATE\b/)
    }
  })
})
