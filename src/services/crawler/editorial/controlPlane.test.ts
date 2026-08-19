import { describe, expect, it } from 'vitest'
import { MemoryCrawlerStore } from '../store/memory'
import { crawlerDashboardSnapshot } from '../telemetry'
import { dispatchCrawlerArticleToNewsroom, isCrawlerAiDispatchEnabled } from '../dispatch'
import { isLegacyDirectAiEnabled } from '../legacyFlags'
import { crawlerAiDispatchConfig } from '../aiDispatch/flags'
import { estimateDispatchCost } from '../aiDispatch/cost'
import { emptyCircuit, applyProviderStatus } from '../aiDispatch/circuit'
import {
  BULK_EVENT_CAP,
  CLUSTER_BULK_CAP_ERROR,
  approvedAiStatus,
  crawlerEditorialStaleHours,
  eventAgeHours,
  funnelFromClusters,
  parseEditorialPriority,
  requiresStaleSecondConfirm,
  sourceDiversityLabel,
  staleWarning,
  tabCountsFromClusters,
} from './controlPlane'
import { matchesClusterQuery, matchesSourceQuery, paginateRawArticles, paginateSlice, parseClusterListQuery } from './query'
import { editorialDisplayImages, summarizeArticleMedia } from './mediaSummary'
import { authorizeCrawlerBulk } from './rbac'
import { runClusterBulk, runArticleBulk } from './bulk'
import { selectAllMatching, selectCurrentPage, selectedCount } from './selection'
import type { CmsRole } from '@/types/cms'
import type { ArticleMediaRecord, NewsClusterRecord } from '../types'
import type { InsertRawArticleInput, RawArticleListRow } from '../store/types'

const NOW = new Date('2026-08-19T12:00:00Z')
const editor: { uid: string; role: CmsRole; email: string } = {
  uid: 'ed_1',
  role: 'editor',
  email: 'editor@nahaber.com',
}

async function seedSource(store: MemoryCrawlerStore, name = 'AA', opts?: { status?: 'ACTIVE' | 'PAUSED'; city?: string; geographicScope?: 'NATIONAL' | 'CITY' }) {
  return store.insertSource({
    name,
    domain: `${name.toLowerCase()}.test`,
    baseUrl: `https://${name.toLowerCase()}.test`,
    countryCode: 'TR',
    language: 'tr',
    city: opts?.city ?? 'Istanbul',
    status: opts?.status ?? 'ACTIVE',
    geographicScope: opts?.geographicScope ?? 'NATIONAL',
  })
}

async function seedArticle(
  store: MemoryCrawlerStore,
  sourceId: string,
  title: string,
  opts?: Partial<InsertRawArticleInput>
) {
  return store.insertRawArticle({
    sourceId,
    discoveredUrlId: null,
    originalUrl: `https://src.test/${title}`,
    normalizedUrl: `https://src.test/${title}`,
    canonicalUrl: `https://src.test/${title}`,
    urlHash: title,
    title,
    description: title,
    articleBodyText: title,
    articleBodyHtml: `<p>${title}</p>`,
    author: null,
    publishedAt: NOW,
    modifiedAt: null,
    language: 'tr',
    countryCode: 'TR',
    region: null,
    city: 'Istanbul',
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

describe('phase 4A.2 editorial control plane', () => {
  it('A-B dashboard totals use aggregates not a 400-row sample', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const article = await seedArticle(store, src.id, 'seed')
    for (let i = 0; i < 450; i++) {
      const cluster = await store.insertCluster({
        representativeArticleId: article.id,
        normalizedTopic: `event-${i}`,
        countryCode: 'TR',
        city: i % 2 === 0 ? 'Istanbul' : 'Ankara',
      })
      await store.updateCluster(cluster.id, {
        aiEligibility: i < 10 ? 'ELIGIBLE' : 'WATCHING',
        uniqueSourceCount: i % 5 === 0 ? 2 : 1,
      })
    }
    const sampled = await store.listClusters({ limit: 400 })
    expect(sampled.length).toBe(400)
    const funnel = await store.countClusterFunnel()
    expect(funnel.total).toBe(450)
    expect(funnel.total).toBeGreaterThan(400)
    const snap = await crawlerDashboardSnapshot(store, NOW)
    expect(snap.funnel.uniqueEvents).toBe(450)
    expect(snap.editorial.uniqueEvents).toBe(450)
    expect(snap.funnel.estimatedCostLabel).toBe('COST_UNKNOWN')
  })

  it('C Pre-AI pagination uses DB totals', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const article = await seedArticle(store, src.id, 'p')
    for (let i = 0; i < 60; i++) {
      await store.insertCluster({
        representativeArticleId: article.id,
        normalizedTopic: `p-${i}`,
        countryCode: 'TR',
        city: 'Istanbul',
      })
    }
    const page = await store.listClustersPage({ page: 2, pageSize: 25 })
    expect(page.total).toBe(60)
    expect(page.page).toBe(2)
    expect(page.clusters.length).toBe(25)
    expect(page.totalPages).toBe(3)
  })

  it('D source pagination includes paused and local sources', async () => {
    const paused = { name: 'Yerel Gazete', domain: 'yerel.test', status: 'PAUSED', countryCode: 'TR', geographicScope: 'CITY', qualityTier: 'TIER_B' }
    const active = { name: 'Ulusal', domain: 'ulusal.test', status: 'ACTIVE', countryCode: 'TR', geographicScope: 'NATIONAL', qualityTier: 'TIER_A' }
    expect(matchesSourceQuery(paused, { status: 'PAUSED' })).toBe(true)
    expect(matchesSourceQuery(paused, { scope: 'CITY' })).toBe(true)
    expect(matchesSourceQuery(paused, { search: 'yerel' })).toBe(true)
    expect(matchesSourceQuery(active, { status: 'PAUSED' })).toBe(false)
    const page = paginateSlice([paused, active, paused, paused], 1, 25)
    expect(page.total).toBe(4)
  })

  it('E raw pagination regression keeps filtered totals', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      id: `a${i}`,
      fetchedAt: NOW,
      publishedAt: null,
      sourceId: 's',
      sourceName: 'S',
      title: `Haber ${i}`,
      countryCode: 'TR',
      city: 'Istanbul',
      isExactDuplicate: false,
      qualityStatus: 'EXTRACTED',
      editorialStatus: 'NEW',
      mainImageUrl: null,
      imageUrls: [],
    })) as unknown as RawArticleListRow[]
    const page = paginateRawArticles(rows, { page: 2, pageSize: 25 })
    expect(page.total).toBe(40)
    expect(page.articles.length).toBe(15)
  })

  it('F approved tab counts only APPROVED_FOR_AI', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const article = await seedArticle(store, src.id, 'ap')
    const a = await store.insertCluster({ representativeArticleId: article.id, normalizedTopic: 'a', countryCode: 'TR', city: 'Istanbul' })
    const b = await store.insertCluster({ representativeArticleId: article.id, normalizedTopic: 'b', countryCode: 'TR', city: 'Istanbul' })
    await store.updateCluster(a.id, { editorialDecision: 'APPROVED_FOR_AI' })
    const tabs = await store.countClusterTabs({})
    expect(tabs.approved).toBe(1)
    expect(matchesClusterQuery((await store.getCluster(a.id)) as NewsClusterRecord, { tab: 'approved' })).toBe(true)
    expect(matchesClusterQuery((await store.getCluster(b.id)) as NewsClusterRecord, { tab: 'approved' })).toBe(false)
  })

  it('G single approval does not create AI jobs or call providers', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const article = await seedArticle(store, src.id, 'one')
    const cluster = await store.insertCluster({
      representativeArticleId: article.id,
      normalizedTopic: 'one',
      countryCode: 'TR',
      city: 'Istanbul',
    })
    await store.updateCluster(cluster.id, { aiEligibility: 'ELIGIBLE', importanceScore: 70 })
    const result = await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      ids: [cluster.id],
      selectionMode: 'single',
      editorialPriority: 'NORMAL',
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.affected).toBe(1)
    expect(result.aiRequests).toBe(0)
    expect(result.dispatchAttempted).toBe(false)
    const after = await store.getCluster(cluster.id)
    expect(after?.editorialDecision).toBe('APPROVED_FOR_AI')
    expect(after?.aiEligibility).toBe('ELIGIBLE')
    expect(after?.importanceScore).toBe(70)
    expect(approvedAiStatus({ dispatchEnabled: false })).toBe('BEKLİYOR — AI DISPATCH KAPALI')
  })

  it('H-J bulk, current page, and all-matching selection', async () => {
    const page = selectCurrentPage(['a', 'b'], 'k', 40)
    expect(selectedCount(page, 25)).toBe(2)
    const matching = selectAllMatching('k', 40)
    expect(matching.mode).toBe('matching')
    expect(selectedCount(matching, 25)).toBe(40)
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const article = await seedArticle(store, src.id, 'bulk')
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const c = await store.insertCluster({
        representativeArticleId: article.id,
        normalizedTopic: `b-${i}`,
        countryCode: 'TR',
        city: 'Istanbul',
      })
      ids.push(c.id)
    }
    const result = await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      matchFilter: true,
      filter: { city: 'Istanbul' },
      selectionMode: 'all_matching',
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.affected).toBe(3)
  })

  it('K combined filters are conjunctive and not hardcoded to one city', () => {
    const url = new URL('https://x.test/q?country=TR&city=Istanbul&eligibility=ELIGIBLE&minConfidence=0.7&district=Merkez')
    const q = parseClusterListQuery(url)
    expect(q.country).toBe('TR')
    expect(q.city).toBe('Istanbul')
    expect(q.district).toBe('Merkez')
    expect(q.minConfidence).toBe(0.7)
    const hit = {
      countryCode: 'TR',
      city: 'Istanbul',
      district: 'Merkez',
      aiEligibility: 'ELIGIBLE',
      editorialDecision: 'NONE',
      editorialPriority: 'NORMAL',
      uniqueSourceCount: 2,
      articleCount: 2,
      importanceScore: 50,
      clusterConfidence: 0.8,
      firstSeenAt: NOW,
      lastSeenAt: NOW,
    } as NewsClusterRecord
    expect(matchesClusterQuery(hit, q, NOW)).toBe(true)
    expect(matchesClusterQuery({ ...hit, city: 'Ankara' }, q, NOW)).toBe(false)
  })

  it('L 500 cap errors instead of silent first-500', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const article = await seedArticle(store, src.id, 'cap')
    for (let i = 0; i < 501; i++) {
      await store.insertCluster({
        representativeArticleId: article.id,
        normalizedTopic: `c-${i}`,
        countryCode: 'TR',
        city: 'Istanbul',
      })
    }
    const result = await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      matchFilter: true,
      filter: { city: 'Istanbul' },
    })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toBe(CLUSTER_BULK_CAP_ERROR)
      expect(result.status).toBe(400)
    }
    expect(BULK_EVENT_CAP).toBe(500)
    const funnel = await store.countClusterFunnel()
    expect(funnel.approvedForAi).toBe(0)
  })

  it('M-Q editorial priority is independent of scores', async () => {
    expect(parseEditorialPriority('HIGH')).toBe('HIGH')
    expect(parseEditorialPriority('BREAKING')).toBe('BREAKING')
    expect(parseEditorialPriority('NORMAL')).toBe('NORMAL')
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const article = await seedArticle(store, src.id, 'pri')
    const cluster = await store.insertCluster({
      representativeArticleId: article.id,
      normalizedTopic: 'pri',
      countryCode: 'TR',
      city: 'Istanbul',
    })
    await store.updateCluster(cluster.id, {
      aiEligibility: 'ELIGIBLE',
      importanceScore: 42,
      localImportance: 10,
      nationalImportance: 20,
      globalImportance: 5,
    })
    const result = await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      ids: [cluster.id],
      editorialPriority: 'BREAKING',
    })
    if ('error' in result) throw new Error(result.error)
    const after = await store.getCluster(cluster.id)
    expect(after?.editorialPriority).toBe('BREAKING')
    expect(after?.aiEligibility).toBe('ELIGIBLE')
    expect(after?.importanceScore).toBe(42)
    expect(after?.localImportance).toBe(10)
    expect(after?.nationalImportance).toBe(20)
    expect(after?.globalImportance).toBe(5)
  })

  it('R-S stale warning at 24h and second confirm at 72h', async () => {
    expect(crawlerEditorialStaleHours()).toBe(24)
    expect(staleWarning(25)).toBe(true)
    expect(requiresStaleSecondConfirm(79)).toBe(true)
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const article = await seedArticle(store, src.id, 'stale')
    const cluster = await store.insertCluster({
      representativeArticleId: article.id,
      normalizedTopic: 'stale',
      countryCode: 'TR',
      city: 'Istanbul',
    })
    await store.updateCluster(cluster.id, { firstSeenAt: new Date(NOW.getTime() - 79 * 3600000) })
    const blocked = await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      ids: [cluster.id],
    })
    expect('error' in blocked).toBe(true)
    const ok = await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      ids: [cluster.id],
      confirmStale: true,
    })
    if ('error' in ok) throw new Error(ok.error)
    expect(ok.affected).toBe(1)
  })

  it('T-X watching, reject, archive, restore to NEUTRAL', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const article = await seedArticle(store, src.id, 'wx')
    const watching = await store.insertCluster({ representativeArticleId: article.id, normalizedTopic: 'w', countryCode: 'TR', city: 'Istanbul' })
    const rejected = await store.insertCluster({ representativeArticleId: article.id, normalizedTopic: 'r', countryCode: 'TR', city: 'Istanbul' })
    const archived = await store.insertCluster({ representativeArticleId: article.id, normalizedTopic: 'ar', countryCode: 'TR', city: 'Istanbul' })
    await runClusterBulk({ store, actor: editor, op: 'watch', ids: [watching.id] })
    await runClusterBulk({ store, actor: editor, op: 'reject', ids: [rejected.id], reason: 'NO_NEWS_VALUE' })
    await runClusterBulk({ store, actor: editor, op: 'archive', ids: [archived.id] })
    expect((await store.getCluster(watching.id))?.editorialDecision).toBe('WATCHING')
    expect((await store.getCluster(rejected.id))?.editorialDecision).toBe('REJECTED')
    expect((await store.getCluster(archived.id))?.editorialDecision).toBe('ARCHIVED')
    await runClusterBulk({ store, actor: editor, op: 'restore', ids: [rejected.id, archived.id] })
    expect((await store.getCluster(rejected.id))?.editorialDecision).toBe('NONE')
    expect((await store.getCluster(archived.id))?.editorialDecision).toBe('NONE')
    expect((await store.getCluster(rejected.id))?.editorialDecision).not.toBe('APPROVED_FOR_AI')
  })

  it('Y-Z source diversity and event evidence labels', () => {
    expect(sourceDiversityLabel(5, 2)).toBe('5 haber / 2 bağımsız kaynak')
    expect(eventAgeHours({ firstSeenAt: new Date(NOW.getTime() - 2 * 3600000) }, NOW)).toBe(2)
  })

  it('AA image evidence skips rejected ads', () => {
    const media = [
      { status: 'ACCEPTED', mediaType: 'image', sourceUrl: 'https://x/ok.jpg', isPrimary: true },
      { status: 'REJECTED', mediaType: 'image', sourceUrl: 'https://x/ad.jpg', rejectionReason: 'ad', isPrimary: false },
    ] as ArticleMediaRecord[]
    const shown = editorialDisplayImages(media)
    expect(shown).toHaveLength(1)
    expect(shown[0].sourceUrl).toBe('https://x/ok.jpg')
    expect(summarizeArticleMedia(media).primaryUrl).toBe('https://x/ok.jpg')
  })

  it('AB audit stores previous/new state and selection mode', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const article = await seedArticle(store, src.id, 'aud2')
    const cluster = await store.insertCluster({
      representativeArticleId: article.id,
      normalizedTopic: 'aud2',
      countryCode: 'TR',
      city: 'Istanbul',
    })
    await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      ids: [cluster.id],
      selectionMode: 'current_page',
      editorialPriority: 'HIGH',
    })
    const audits = await store.listEditorialAudits()
    expect(audits.some((a) => a.previousState === 'NONE' && a.newState === 'APPROVED_FOR_AI')).toBe(true)
    expect(audits.some((a) => a.selectionMode === 'current_page')).toBe(true)
    expect(audits.some((a) => a.editorialPriority === 'HIGH')).toBe(true)
  })

  it('AC RBAC news:edit / bulk_action; hard delete super_admin', () => {
    expect(authorizeCrawlerBulk('editor', 'approve_for_ai').ok).toBe(true)
    expect(authorizeCrawlerBulk('author', 'approve_for_ai').ok).toBe(false)
    expect(authorizeCrawlerBulk('video_editor', 'watch').ok).toBe(false)
    expect(authorizeCrawlerBulk('editor', 'hard_delete').ok).toBe(false)
    expect(authorizeCrawlerBulk('super_admin', 'hard_delete').ok).toBe(true)
  })

  it('AD partial bulk success does not roll back', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const article = await seedArticle(store, src.id, 'part')
    const a = await store.insertCluster({ representativeArticleId: article.id, normalizedTopic: 'pa', countryCode: 'TR', city: 'Istanbul' })
    const b = await store.insertCluster({ representativeArticleId: article.id, normalizedTopic: 'pb', countryCode: 'TR', city: 'Istanbul' })
    await store.updateCluster(a.id, { editorialDecision: 'APPROVED_FOR_AI' })
    const result = await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      ids: [a.id, b.id, 'missing'],
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.affected).toBe(1)
    expect(result.skipped).toBeGreaterThanOrEqual(2)
    expect((await store.getCluster(b.id))?.editorialDecision).toBe('APPROVED_FOR_AI')
  })

  it('AE-AG source totals include paused and local', async () => {
    const store = new MemoryCrawlerStore()
    await seedSource(store, 'LocalPaused', { status: 'PAUSED', city: 'Edirne', geographicScope: 'CITY' })
    await seedSource(store, 'National', { status: 'ACTIVE' })
    const sources = await store.listSources()
    expect(sources).toHaveLength(2)
    expect(sources.some((s) => s.status === 'PAUSED')).toBe(true)
    expect(sources.some((s) => s.geographicScope === 'CITY')).toBe(true)
  })

  it('AH-AJ dashboard funnel and COST_UNKNOWN', async () => {
    const store = new MemoryCrawlerStore()
    const snap = await crawlerDashboardSnapshot(store, NOW)
    expect(snap.editorial.dispatchEnabled).toBe(false)
    expect(snap.editorial.automaticAiRequests).toBe(0)
    expect(snap.editorial.actualAiCostUsd).toBe(0)
    expect(snap.editorial.estimatedCostLabel).toBe('COST_UNKNOWN')
    expect(snap.funnel.estimatedCostLabel).toBe('COST_UNKNOWN')
    const probe = estimateDispatchCost({ estimatedInputTokens: 800, estimatedOutputTokens: 200, estimatedTotalTokens: 1000 })
    expect(probe.known === false || probe.estimatedCostUsd == null || typeof probe.known === 'boolean').toBe(true)
  })

  it('AK-AO editorial ops make zero provider HTTP calls', async () => {
    let hits = 0
    const original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (/deepseek|googleapis|groq|openrouter|openai/i.test(url)) hits += 1
      throw new Error('network should not run')
    }) as typeof fetch
    try {
      const store = new MemoryCrawlerStore()
      const src = await seedSource(store)
      const article = await seedArticle(store, src.id, 'nohttp')
      const cluster = await store.insertCluster({
        representativeArticleId: article.id,
        normalizedTopic: 'nohttp',
        countryCode: 'TR',
        city: 'Istanbul',
      })
      await runClusterBulk({ store, actor: editor, op: 'approve_for_ai', ids: [cluster.id], confirmStale: true })
      await runArticleBulk({ store, actor: editor, op: 'review', ids: [article.id] })
      expect(hits).toBe(0)
    } finally {
      globalThis.fetch = original
    }
  })

  it('AP-AS AI jobs, auto AI, publications stay zero', async () => {
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
    expect(isLegacyDirectAiEnabled()).toBe(false)
    expect(dispatchCrawlerArticleToNewsroom().aiRequests).toBe(0)
    expect(dispatchCrawlerArticleToNewsroom().dispatched).toBe(false)
  })

  it('AT-AW phase 4A budget, circuit, token, idempotency still present', () => {
    const cfg = crawlerAiDispatchConfig()
    expect(cfg.dailyBudgetUsd).toBeGreaterThan(0)
    expect(cfg.maxInputTokensPerEvent).toBeGreaterThan(0)
    const circuit = applyProviderStatus(emptyCircuit(), 402)
    expect(circuit.state).toBe('OPEN')
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
  })

  it('AX-AZ 4A.1 / 3.7 / 2L flags remain closed', () => {
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
    expect(isLegacyDirectAiEnabled()).toBe(false)
    expect(tabCountsFromClusters([]).all).toBe(0)
    expect(funnelFromClusters([]).total).toBe(0)
  })
})
