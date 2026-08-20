/**
 * Phase 4B — event-first newsroom local verification suite.
 * AI dispatch stays OFF. No provider calls. No cleanup/reset.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { buildEventFingerprint } from './cluster/fingerprint'
import { scoreClusterMatch, conflictingExclusivePlaces } from './cluster/score'
import { futureAiUnitsForEvent, independentSourceCount, assignMembershipRole } from './cluster/roles'
import { sameEventBadgeLabel, toEventDeskRow } from './editorial/eventDesk'
import { nextSortState, parseSortOrder, parseQueueTab, clampPageSize } from './editorial/query'
import { runClusterBulk, assertNoAiDispatch, BULK_ID_CAP } from './editorial/bulk'
import { BULK_EVENT_CAP, CLUSTER_BULK_CAP_ERROR } from './editorial/controlPlane'
import { cmsLabel } from '@/services/cms/uiLabels'
import { analyticsCostReport, estimateAnalyticsCost } from '@/services/analytics/costModel'
import { isAnalyticsNeonIngestEnabled } from '@/services/analytics/neonAnalytics'
import { isCrawlerAiDispatchEnabled } from './dispatch'
import { isLegacyDirectAiEnabled } from './legacyFlags'
import { isCrawlerAiProviderWired } from './aiDispatch/flags'
import { buildEventAiPack } from './aiDispatch/pack'
import { buildCrawlerCronSummaries, cronStatusTr, CRON_LANE_ORDER } from './ops/cronSummary'
import { PUBLISHED_BLOCKS_FOLLOWUP } from './ops/publishedBlocksFollowup'
import { turkishAdminApiError, DB_UNAVAILABLE_TR } from '@/lib/adminApiError'
import { MemoryCrawlerStore } from './store/memory'
import type { NewsSourceRecord, RawArticleRecord } from './types'

const NOW = new Date('2026-08-20T12:00:00.000Z')

async function seedSource(store: MemoryCrawlerStore, name: string, domain: string, extra: Partial<NewsSourceRecord> = {}) {
  return store.insertSource({
    name,
    domain,
    baseUrl: `https://${domain}`,
    countryCode: 'TR',
    language: 'tr',
    discoveryMethod: 'RSS',
    ...extra,
  } as never)
}

async function seedArticle(
  store: MemoryCrawlerStore,
  source: NewsSourceRecord,
  title: string,
  extra: Partial<RawArticleRecord> = {}
) {
  return store.insertRawArticle({
    sourceId: source.id,
    originalUrl: `https://${source.domain}/${encodeURIComponent(title).slice(0, 40)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    language: 'tr',
    countryCode: 'TR',
    publishedAt: NOW,
    fetchedAt: NOW,
    wordCount: 220,
    extractionConfidence: 0.9,
    qualityStatus: 'GOOD',
    editorialStatus: 'NEW',
    clusterStatus: 'PENDING',
    ...extra,
  } as never)
}

describe('phase 4B event-first contracts', () => {
  it('exposes event desk fields for admin', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store, 'A', 'a.test')
    const art = await seedArticle(store, src, "Manisa'da makilik alanda yangın")
    const cluster = await store.insertCluster({
      representativeArticleId: art.id,
      normalizedTopic: 'manisa yangin',
      canonicalTitle: "Manisa'da makilik alanda yangın",
      countryCode: 'TR',
      city: 'Manisa',
      categoryHint: 'yerel',
    })
    await store.updateCluster(cluster.id, {
      articleCount: 3,
      uniqueSourceCount: 2,
      clusterConfidence: 0.88,
      importanceScore: 70,
      primarySourceName: 'A',
      primaryImageUrl: 'https://cdn.test/img.jpg',
    })
    const desk = toEventDeskRow((await store.getCluster(cluster.id))!)
    expect(desk.title).toContain('Manisa')
    expect(desk.independentSourceCount).toBe(2)
    expect(desk.articleCount).toBe(3)
    expect(desk.bestMediaUrl).toContain('cdn.test')
    expect(desk.futureAiJobs).toBe(1)
    expect(desk.category).toBe('yerel')
    expect(sameEventBadgeLabel(3, 2)).toBe('AYNI OLAY · 3 HABER · 2 KAYNAK')
  })
})

describe('phase 4B deterministic grouping precision', () => {
  it('same event two sources → HIGH match', () => {
    const a = buildEventFingerprint({
      title: "Manisa'da makilik alanda yangın",
      language: 'tr',
      countryCode: 'TR',
      city: 'manisa',
      publishedAt: NOW,
    })
    const scored = scoreClusterMatch(a, { fingerprint: a, lastSeenAt: NOW, firstSeenAt: NOW }, NOW)
    expect(scored.band).toBe('HIGH')
  })

  it('Soma vs Akhisar stay separate even without district fields', () => {
    const scored = scoreClusterMatch(
      buildEventFingerprint({
        title: "Manisa Soma'da makilik alanda yangın",
        language: 'tr',
        countryCode: 'TR',
        city: 'manisa',
        publishedAt: NOW,
      }),
      {
        fingerprint: buildEventFingerprint({
          title: "Manisa Akhisar'da makilik alanda yangın",
          language: 'tr',
          countryCode: 'TR',
          city: 'manisa',
          publishedAt: NOW,
        }),
        lastSeenAt: NOW,
        firstSeenAt: NOW,
      },
      NOW
    )
    expect(scored.blockedReason).toBe('place_entity_conflict')
    expect(scored.band).not.toBe('HIGH')
    expect(
      conflictingExclusivePlaces(
        buildEventFingerprint({ title: "Manisa Soma'da yangın", language: 'tr', city: 'manisa' }),
        buildEventFingerprint({ title: "Manisa Akhisar'da yangın", language: 'tr', city: 'manisa' })
      )
    ).toBe(true)
  })

  it('weak keywords alone (yangın / Galatasaray) do not force merge', () => {
    const a = buildEventFingerprint({
      title: 'İstanbul’da yangın çıktı',
      language: 'tr',
      countryCode: 'TR',
      city: 'istanbul',
      publishedAt: NOW,
    })
    const b = buildEventFingerprint({
      title: 'Ankara’da yangın çıktı',
      language: 'tr',
      countryCode: 'TR',
      city: 'ankara',
      publishedAt: NOW,
    })
    const scored = scoreClusterMatch(a, { fingerprint: b, lastSeenAt: NOW, firstSeenAt: NOW }, NOW)
    expect(scored.blockedReason).toBe('geography_mismatch')
    expect(scored.band).not.toBe('HIGH')

    const clubA = buildEventFingerprint({ title: 'Galatasaray transfer haberi', language: 'tr', publishedAt: NOW })
    const clubB = buildEventFingerprint({ title: 'Galatasaray maç özeti', language: 'tr', publishedAt: NOW })
    const clubScore = scoreClusterMatch(clubA, { fingerprint: clubB, lastSeenAt: NOW, firstSeenAt: NOW }, NOW)
    expect(clubScore.band).not.toBe('HIGH')
  })
})

describe('phase 4B primary + supporting + AI unit', () => {
  it('primary by quality; supporting preserved; one event → one future AI job', async () => {
    const store = new MemoryCrawlerStore()
    const weak = await seedSource(store, 'Weak', 'weak.test', { healthScore: 20, qualityTier: 'TIER_C' })
    const strong = await seedSource(store, 'Strong', 'strong.test', { healthScore: 95, qualityTier: 'TIER_A' })
    const a = await seedArticle(store, weak, "Manisa'da yangın", { extractionConfidence: 0.4, wordCount: 40 })
    const b = await seedArticle(store, strong, "Manisa'da yangın", { extractionConfidence: 0.95, wordCount: 400 })
    expect(assignMembershipRole({ isPrimary: true, isExactDuplicate: false, qualityStatus: 'GOOD', isMaterialUpdate: false })).toBe(
      'PRIMARY'
    )
    expect(assignMembershipRole({ isPrimary: false, isExactDuplicate: false, qualityStatus: 'GOOD', isMaterialUpdate: false })).toBe(
      'SUPPORTING'
    )
    const indep = independentSourceCount([
      { article: a, source: weak },
      { article: b, source: strong },
    ])
    expect(indep).toBe(2)
    const units = futureAiUnitsForEvent(10)
    expect(units.futureAiJobs).toBe(1)
    expect(units.providerRequests).toBe(0)

    const pack = buildEventAiPack(
      {
        id: 'evt_1',
        eventKey: 'manisa-fire',
        canonicalTitle: "Manisa'da yangın",
        normalizedTopic: 'manisa yangin',
        countryCode: 'TR',
        region: null,
        city: 'Manisa',
        district: null,
        aiEligibility: 'ELIGIBLE',
        importanceScore: 80,
        localImportance: 40,
        nationalImportance: 30,
        globalImportance: 10,
        uniqueSourceCount: 2,
        freshnessScore: 0.8,
        hasMaterialUpdate: false,
      },
      [
        {
          articleId: b.id,
          sourceId: strong.id,
          sourceName: strong.name,
          qualityTier: strong.qualityTier || 'TIER_A',
          healthScore: strong.healthScore || 95,
          extractionConfidence: b.extractionConfidence,
          publishedAt: b.publishedAt,
          fetchedAt: b.fetchedAt,
          title: b.title,
          body: b.articleBodyText || 'Ekipler bölgede. '.repeat(20),
          description: b.description,
          contentHash: b.contentHash,
          wordCount: b.wordCount,
          isExactDuplicate: false,
          editorialStatus: b.editorialStatus,
          editorialNewsId: null,
          sourceStatus: strong.status,
        },
        {
          articleId: a.id,
          sourceId: weak.id,
          sourceName: weak.name,
          qualityTier: weak.qualityTier || 'TIER_C',
          healthScore: weak.healthScore || 20,
          extractionConfidence: a.extractionConfidence,
          publishedAt: a.publishedAt,
          fetchedAt: a.fetchedAt,
          title: a.title,
          body: a.articleBodyText || 'Kısa.',
          description: a.description,
          contentHash: a.contentHash,
          wordCount: a.wordCount,
          isExactDuplicate: false,
          editorialStatus: a.editorialStatus,
          editorialNewsId: null,
          sourceStatus: weak.status,
        },
      ]
    )
    expect(pack.futureAiJobs).toBe(1)
  })
})

describe('phase 4B editorial ops + AI gate', () => {
  const editor = { uid: 'ed1', role: 'editor' as const, email: 'ed@test' }

  beforeEach(() => {
    delete process.env.CRAWLER_AI_DISPATCH_ENABLED
    delete process.env.LEGACY_DIRECT_AI_ENABLED
  })
  afterEach(() => {
    delete process.env.CRAWLER_AI_DISPATCH_ENABLED
    delete process.env.LEGACY_DIRECT_AI_ENABLED
  })

  it('approve/reject/watch/archive/restore/review audited; AI stays off', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store, 'S', 's.test')
    const art = await seedArticle(store, src, 'Olay')
    const cluster = await store.insertCluster({
      representativeArticleId: art.id,
      normalizedTopic: 'olay',
      countryCode: 'TR',
      city: 'Istanbul',
    })
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
    expect(isLegacyDirectAiEnabled()).toBe(false)
    expect(isCrawlerAiProviderWired()).toBe(false)
    expect(assertNoAiDispatch().aiRequests).toBe(0)

    await runClusterBulk({ store, actor: editor, op: 'review', ids: [cluster.id] })
    expect((await store.getCluster(cluster.id))?.editorialDecision).toBe('NONE')

    await runClusterBulk({ store, actor: editor, op: 'watch', ids: [cluster.id] })
    expect((await store.getCluster(cluster.id))?.editorialDecision).toBe('WATCHING')

    await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      ids: [cluster.id],
      confirmStale: true,
    })
    expect((await store.getCluster(cluster.id))?.editorialDecision).toBe('APPROVED_FOR_AI')
    expect(assertNoAiDispatch().dispatchEnabled).toBe(false)

    await runClusterBulk({ store, actor: editor, op: 'reject', ids: [cluster.id], reason: 'NO_NEWS_VALUE' })
    expect((await store.getCluster(cluster.id))?.editorialDecision).toBe('REJECTED')

    await runClusterBulk({ store, actor: editor, op: 'restore', ids: [cluster.id] })
    expect((await store.getCluster(cluster.id))?.editorialDecision).toBe('NONE')

    await runClusterBulk({ store, actor: editor, op: 'archive', ids: [cluster.id] })
    expect((await store.getCluster(cluster.id))?.editorialDecision).toBe('ARCHIVED')
  })

  it('all-matching respects bulk cap message', () => {
    expect(BULK_ID_CAP).toBe(BULK_EVENT_CAP)
    expect(CLUSTER_BULK_CAP_ERROR).toContain('500')
  })
})

describe('phase 4B sort + queue + cms labels', () => {
  it('sort ASC/DESC cycles for date/words/confidence/source', () => {
    expect(nextSortState(null, null, 'fetchedAt')).toEqual({ sort: 'fetchedAt', order: 'desc' })
    expect(nextSortState('fetchedAt', 'desc', 'fetchedAt')).toEqual({ sort: 'fetchedAt', order: 'asc' })
    expect(nextSortState('wordCount', 'asc', 'wordCount')).toEqual({ sort: null, order: null })
    expect(parseSortOrder('asc')).toBe('asc')
    expect(parseSortOrder('desc')).toBe('desc')
    expect(parseQueueTab(null)).toBe('active')
    expect(parseQueueTab('published')).toBe('published')
    expect(clampPageSize(700)).toBe(25)
    expect(cmsLabel('draft')).toBe('Taslak')
    expect(cmsLabel('algorithmic')).toBe('Algoritmik')
    expect(cmsLabel('PAUSED')).toBe('Duraklatıldı')
    expect(cmsLabel('COST_UNKNOWN')).toBe('Maliyet bilinmiyor')
  })
})

describe('phase 4B cron idle ≠ failure + analytics + publishedBlocks', () => {
  it('cron lanes include CRAWLER / RSS RADAR / LEGACY / AI DISPATCH; idle is not failed', () => {
    expect(CRON_LANE_ORDER).toEqual(['CRAWLER', 'RSS RADAR', 'LEGACY', 'AI DISPATCH'])
    const jobs = buildCrawlerCronSummaries({
      enabled: true,
      metrics: {},
      lastDiscoveryAt: null,
      lastExtractionAt: null,
      aiDispatchEnabled: false,
      legacyAiEnabled: false,
    })
    expect(jobs.some((j) => j.lane === 'CRAWLER' && j.status === 'Boşta')).toBe(true)
    expect(jobs.find((j) => j.lane === 'AI DISPATCH')?.status).toBe('Devre Dışı')
    expect(cronStatusTr('idle')).toBe('Boşta')
    expect(cronStatusTr('failed')).toBe('Başarısız')
  })

  it('analytics ingest off; cost model COST_UNKNOWN without pricing; 10k/100k/1m', () => {
    expect(isAnalyticsNeonIngestEnabled()).toBe(false)
    const report = analyticsCostReport()
    expect(report.ingestEnabled).toBe(false)
    expect(report['10k'].writesPerDay).toBeGreaterThan(10_000)
    expect(report['100k'].writesPerDay).toBeGreaterThan(100_000)
    expect(report['1m'].writesPerDay).toBeGreaterThan(1_000_000)
    expect(estimateAnalyticsCost(10_000).estimatedUsdPerDay).toBe('COST_UNKNOWN')
  })

  it('publishedBlocks not wired in 4B', () => {
    expect(PUBLISHED_BLOCKS_FOLLOWUP.publishedBlocksWired).toBe(false)
    expect(PUBLISHED_BLOCKS_FOLLOWUP.phase4bWired).toBe(false)
  })

  it('DB outage UX never implies empty success', () => {
    expect(turkishAdminApiError(503, 'DATABASE_URL missing')).toBe(DB_UNAVAILABLE_TR)
    expect(turkishAdminApiError(500)).toContain('bilinmiyor')
  })
})
