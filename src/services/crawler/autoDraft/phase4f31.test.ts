/**
 * Phase 4F.3.1 — unique shadow economics + DB-global concurrency (local, $0 paid AI).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  aggregateUniqueEconomicMetrics,
  classifyShadowRevisionKind,
  compareRawVsUniqueEconomics,
  PRESPEND_GATE_VERSION_4F31,
} from './shadowUniqueEconomics'
import { buildShadowDecision } from './shadowEconomics'
import { atomicReserveAutoDraftBudget, releaseAutoDraftReservation } from './concurrency'
import { runControlledAutoDraftTick } from './pipeline'
import { blocksAutomaticRepay } from './lease'
import { autoDraftMayPublish } from './eligibility'
import {
  createSharedAiDispatchState,
  MemoryAiDispatchStore,
} from '../aiDispatch/store'
import { MemoryCrawlerStore } from '../store/memory'
import { autoDraftBudgetLimits } from './budgetLimits'
import type { CrawlerAiJobRecord } from '../aiDispatch/types'
import { EDITORIAL_OUTPUT_TARGET } from '../aiDispatch/types'

function pricingOn() {
  vi.stubEnv('DEEPSEEK_INPUT_COST_PER_1M', '0.44')
  vi.stubEnv('DEEPSEEK_OUTPUT_COST_PER_1M', '1.32')
}

function resetEnv() {
  vi.unstubAllEnvs()
  for (const k of [
    'CRAWLER_AI_DISPATCH_ENABLED',
    'CRAWLER_AI_MODE',
    'CRAWLER_AI_PROVIDER_ENABLED',
    'CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER',
    'CRAWLER_AI_MAX_EVENTS_PER_TICK',
    'CRAWLER_AI_ACCEPTANCE_MAX_EVENTS',
    'CRAWLER_AI_ACCEPTANCE_MAX_REQUESTS',
    'CRAWLER_AI_MAX_CONCURRENT_JOBS',
    'LEGACY_DIRECT_AI_ENABLED',
    'AI_MAX_COST_PER_EVENT_USD',
    'AI_MAX_DRAFTS_PER_HOUR',
    'AI_MAX_DRAFTS_PER_DAY',
    'AI_MAX_DAILY_COST_USD',
    'AI_MAX_MONTHLY_COST_USD',
    'AI_MAX_HOURLY_COST_USD',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_INPUT_COST_PER_1M',
    'DEEPSEEK_OUTPUT_COST_PER_1M',
  ]) {
    delete process.env[k]
  }
}

afterEach(() => resetEnv())

const CUTOFF = new Date('2026-08-21T10:00:00.000Z')
const NOW = new Date('2026-08-21T12:00:00.000Z')
const RICH =
  'Manisa merkezde makilik alanda yangın çıktı. Ekipler havadan ve karadan müdahale ediyor. ' +
  'Vatandaşlar bölgeden uzaklaştırıldı. Rüzgar etkisiyle alevler yayıldı. Yetkililer soğutma çalışması başlattı. '.repeat(
    12
  )

function armControlled(opts?: {
  concurrent?: string
  perHour?: string
  perDay?: string
  dailyCost?: string
  perTick?: string
}) {
  pricingOn()
  process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
  process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
  process.env.CRAWLER_AI_PROVIDER_ENABLED = 'false'
  process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = CUTOFF.toISOString()
  process.env.AI_MAX_COST_PER_EVENT_USD = '0.01'
  process.env.AI_MAX_DRAFTS_PER_HOUR = opts?.perHour ?? '6'
  process.env.AI_MAX_DRAFTS_PER_DAY = opts?.perDay ?? '6'
  process.env.AI_MAX_DAILY_COST_USD = opts?.dailyCost ?? '0.05'
  process.env.AI_MAX_MONTHLY_COST_USD = '5'
  process.env.CRAWLER_AI_MAX_CONCURRENT_JOBS = opts?.concurrent ?? '1'
  process.env.CRAWLER_AI_MAX_EVENTS_PER_TICK = opts?.perTick ?? '2'
  process.env.CRAWLER_AI_ACCEPTANCE_MAX_EVENTS = '5'
  process.env.CRAWLER_AI_ACCEPTANCE_MAX_REQUESTS = '10'
}

async function seedEventLike(
  crawler: MemoryCrawlerStore,
  opts: { title: string; uniqueSources?: number }
) {
  const n = opts.uniqueSources ?? 2
  const sources = []
  for (let i = 0; i < n; i++) {
    sources.push(
      await crawler.insertSource({
        name: `Src${i}-${Math.random().toString(36).slice(2, 6)}`,
        domain: `src${i}-${Math.random().toString(36).slice(2, 6)}.example`,
        baseUrl: `https://src${i}.example`,
        homepageUrl: `https://src${i}.example`,
        countryCode: 'TR',
        language: 'tr',
        discoveryMethod: 'RSS',
        healthScore: 90,
        qualityTier: 'TIER_A',
      } as never)
    )
  }
  const articles = []
  for (let i = 0; i < n; i++) {
    articles.push(
      await crawler.insertRawArticle({
        sourceId: sources[i].id,
        originalUrl: `https://src${i}.example/${Math.random().toString(36).slice(2, 8)}`,
        title: opts.title,
        articleBodyText: RICH,
        language: 'tr',
        countryCode: 'TR',
        wordCount: RICH.split(/\s+/).length,
        extractionConfidence: 0.92,
        publishedAt: NOW,
        fetchedAt: NOW,
        qualityStatus: 'GOOD',
      } as never)
    )
  }
  const cluster = await crawler.insertCluster({
    representativeArticleId: articles[0].id,
    normalizedTopic: opts.title.toLowerCase().slice(0, 40),
    countryCode: 'TR',
    city: 'Manisa',
    eventKey: `ek-${Math.random().toString(36).slice(2, 8)}`,
    canonicalTitle: opts.title,
  })
  for (let i = 0; i < n; i++) {
    await crawler.insertMembership({
      clusterId: cluster.id,
      articleId: articles[i].id,
      sourceId: sources[i].id,
      similarityScore: 1,
      matchBand: 'HIGH',
      isCanonical: i === 0,
    })
  }
  await crawler.updateCluster(cluster.id, {
    editorialDecision: 'NONE' as never,
    aiEligibility: 'ELIGIBLE' as never,
    uniqueSourceCount: n,
    articleCount: n,
    importanceScore: 70,
    clusterConfidence: 0.9,
    publishedNewsId: null,
    latestArticleAt: NOW,
    lastSeenAt: NOW,
    firstSeenAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  })
  return cluster
}

function jobStub(partial: Partial<CrawlerAiJobRecord> & { id: string; clusterId: string }): CrawlerAiJobRecord {
  return {
    eventKey: 'e',
    status: 'PENDING',
    dispatchType: 'INITIAL',
    priority: 1,
    eligibilityStatus: 'AUTO_DRAFT_ELIGIBLE',
    estimatedInputTokens: 100,
    estimatedOutputTokens: 50,
    estimatedTotalTokens: 150,
    estimatedCostUsd: 0.001,
    actualInputTokens: null,
    actualOutputTokens: null,
    actualCostUsd: null,
    model: null,
    provider: null,
    attemptCount: 0,
    maxAttempts: 2,
    reservedAt: null,
    startedAt: null,
    completedAt: null,
    blockedReason: null,
    failureReason: null,
    failureCode: null,
    editorialNewsId: null,
    outputTarget: EDITORIAL_OUTPUT_TARGET,
    selectedSourceCount: 2,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastHeartbeatAt: null,
    executionId: null,
    eventRevision: null,
    draftSnapshot: null,
    validationSnapshot: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  }
}

describe('Phase 4F.3.1 unique shadow economics', () => {
  it('same cluster + fingerprint ×10 ticks → 10 evaluations, 1 economic decision', async () => {
    pricingOn()
    process.env.CRAWLER_AI_MODE = 'SHADOW_AUTO_DRAFT'
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'false'
    process.env.CRAWLER_AI_PROVIDER_ENABLED = 'false'
    process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = CUTOFF.toISOString()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEventLike(crawler, { title: 'Yangın dedup shadow', uniqueSources: 2 })
    for (let i = 0; i < 10; i++) {
      await runControlledAutoDraftTick({
        crawlerStore: crawler,
        aiStore: ai,
        now: new Date(NOW.getTime() + i * 60_000),
        limit: 1,
      })
    }
    expect((await ai.listShadowDecisions()).length).toBe(10)
    expect((await ai.listShadowEconomicDecisions()).length).toBe(1)
    expect(ai.shadowEconomicDecisions.values().next().value?.evaluationCount).toBe(10)
    expect((await ai.listJobs()).length).toBe(0)
  })

  it('same cluster + new fingerprint → new economic decision (MATERIAL_UPDATE)', async () => {
    pricingOn()
    process.env.CRAWLER_AI_MODE = 'SHADOW_AUTO_DRAFT'
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'false'
    process.env.CRAWLER_AI_PROVIDER_ENABLED = 'false'
    process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = CUTOFF.toISOString()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const cluster = await seedEventLike(crawler, { title: 'Yangın revizyon', uniqueSources: 2 })
    await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW, limit: 1 })
    // Material change: add another article/source → fingerprint changes
    const src = await crawler.insertSource({
      name: 'Extra',
      domain: `extra-${Math.random().toString(36).slice(2, 6)}.example`,
      baseUrl: 'https://extra.example',
      homepageUrl: 'https://extra.example',
      countryCode: 'TR',
      language: 'tr',
      discoveryMethod: 'RSS',
      healthScore: 90,
      qualityTier: 'TIER_A',
    } as never)
    const art = await crawler.insertRawArticle({
      sourceId: src.id,
      originalUrl: `https://extra.example/${Math.random().toString(36).slice(2, 8)}`,
      title: 'Yangın revizyon ek kaynak',
      articleBodyText: RICH + ' Ek destekleyici kaynak metni.',
      language: 'tr',
      countryCode: 'TR',
      wordCount: RICH.split(/\s+/).length + 5,
      extractionConfidence: 0.92,
      publishedAt: NOW,
      fetchedAt: NOW,
      qualityStatus: 'GOOD',
    } as never)
    await crawler.insertMembership({
      clusterId: cluster.id,
      articleId: art.id,
      sourceId: src.id,
      similarityScore: 1,
      matchBand: 'HIGH',
      isCanonical: false,
    })
    await crawler.updateCluster(cluster.id, {
      uniqueSourceCount: 3,
      articleCount: 3,
      updatedAt: NOW,
    })
    await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: new Date(NOW.getTime() + 60_000),
      limit: 1,
    })
    const econ = await ai.listShadowEconomicDecisions()
    expect(econ.length).toBe(2)
    expect(econ.some((e) => e.revisionKind === 'NEW_EVENT')).toBe(true)
    expect(econ.some((e) => e.revisionKind === 'MATERIAL_UPDATE')).toBe(true)
  })

  it('same fingerprint + new policy version → separate economic decision', async () => {
    const ai = new MemoryAiDispatchStore()
    const base = {
      clusterId: 'c1',
      contentFingerprint: 'fp-same',
      eventKey: 'e',
      canonicalTitle: 't',
      firstEvaluatedAt: NOW,
      lastEvaluatedAt: NOW,
      evaluationCount: 1,
      machineEligibility: 'AUTO_DRAFT_ELIGIBLE',
      prespendOutcome: 'PRESPEND_READY',
      economicTier: 'A',
      action: 'WOULD_DISPATCH',
      blockReason: null,
      estimatedInputTokens: 100,
      estimatedOutputTokens: 50,
      estimatedCostUsd: 0.001,
      costKnown: true,
      rankScore: 1,
      independentSourceCount: 2,
      usableSourceWords: 400,
      editorialDecisionSnapshot: 'NONE',
      meta: null,
    }
    const a = await ai.tryInsertShadowEconomicDecision!({
      ...base,
      id: 'she1',
      prespendGateVersion: '4F3.1',
      revisionKind: 'NEW_EVENT',
    })
    const b = await ai.tryInsertShadowEconomicDecision!({
      ...base,
      id: 'she2',
      prespendGateVersion: '4F3.2',
      revisionKind: 'NEW_EVENT',
    })
    const dup = await ai.tryInsertShadowEconomicDecision!({
      ...base,
      id: 'she3',
      prespendGateVersion: '4F3.1',
      revisionKind: 'NEW_EVENT',
    })
    expect(a.inserted).toBe(true)
    expect(b.inserted).toBe(true)
    expect(dup.inserted).toBe(false)
    expect((await ai.listShadowEconomicDecisions()).length).toBe(2)
  })

  it('classifyShadowRevisionKind labels correctly', () => {
    expect(
      classifyShadowRevisionKind({ clusterHadAnyPriorDecision: false, sameFingerprintAndGateExists: false })
    ).toBe('NEW_EVENT')
    expect(
      classifyShadowRevisionKind({ clusterHadAnyPriorDecision: true, sameFingerprintAndGateExists: false })
    ).toBe('MATERIAL_UPDATE')
    expect(
      classifyShadowRevisionKind({ clusterHadAnyPriorDecision: true, sameFingerprintAndGateExists: true })
    ).toBe('DUPLICATE_EVAL')
  })

  it('raw vs unique economics: repeated ticks do not inflate unique spend', () => {
    const rows = Array.from({ length: 10 }, () => ({
      clusterId: 'c1',
      contentFingerprint: 'fp1',
      prespendGateVersion: PRESPEND_GATE_VERSION_4F31,
      action: 'WOULD_BLOCK',
      blockReason: 'TOO_THIN',
      economicTier: 'D',
      estimatedCostUsd: 0.002,
      costKnown: true,
      prespendOutcome: 'TOO_THIN',
    }))
    const { oldRepeatedEstimate, newUniqueEstimate } = compareRawVsUniqueEconomics(rows)
    expect(oldRepeatedEstimate.uniqueEventRevisions).toBe(10)
    expect(oldRepeatedEstimate.estimatedSpendPreventedUsd).toBeCloseTo(0.02)
    expect(newUniqueEstimate.uniqueEventRevisions).toBe(1)
    expect(newUniqueEstimate.estimatedSpendPreventedUsd).toBeCloseTo(0.002)
  })

  it('buildShadowDecision carries gate version 4F3.1', () => {
    const d = buildShadowDecision({
      clusterId: 'c',
      eventKey: null,
      canonicalTitle: null,
      machineEligibility: 'X',
      prespendOutcome: 'TOO_THIN',
      readyToSpend: false,
      tier: 'D',
      shadowDispatchAllowed: false,
      blockReason: 'TOO_THIN',
      estimatedInputTokens: 1,
      estimatedOutputTokens: 1,
      estimatedCostUsd: 0.0001,
      costKnown: true,
      rankScore: 0,
      independentSourceCount: 1,
      usableSourceWords: 10,
      editorialDecisionSnapshot: 'NONE',
      contentFingerprint: 'fp',
    })
    expect(d.prespendGateVersion).toBe('4F3.1')
  })
})

describe('Phase 4F.3.1 DB-global concurrency (no shared mutex)', () => {
  it('two independent stores sharing only DB state → one RESERVED slot', async () => {
    pricingOn()
    process.env.AI_MAX_DRAFTS_PER_HOUR = '1'
    process.env.AI_MAX_DRAFTS_PER_DAY = '6'
    process.env.AI_MAX_DAILY_COST_USD = '0.05'
    process.env.AI_MAX_MONTHLY_COST_USD = '5'
    process.env.CRAWLER_AI_MAX_CONCURRENT_JOBS = '2'
    const shared = createSharedAiDispatchState()
    const a = new MemoryAiDispatchStore({ shared, useMemoryLock: false })
    const b = new MemoryAiDispatchStore({ shared, useMemoryLock: false })
    const limits = autoDraftBudgetLimits()
    const [ra, rb] = await Promise.all([
      atomicReserveAutoDraftBudget({ aiStore: a, costUsd: 0.004, limits, now: NOW }),
      atomicReserveAutoDraftBudget({ aiStore: b, costUsd: 0.004, limits, now: NOW }),
    ])
    expect([ra, rb].filter((r) => r.ok).length).toBe(1)
    expect([ra, rb].filter((r) => !r.ok).length).toBe(1)
  })

  it('two events race final hourly slot → one winner', async () => {
    armControlled({ concurrent: '4', perHour: '1', perTick: '2' })
    const shared = createSharedAiDispatchState()
    const crawler = new MemoryCrawlerStore()
    const a = new MemoryAiDispatchStore({ shared, useMemoryLock: false })
    const b = new MemoryAiDispatchStore({ shared, useMemoryLock: false })
    await seedEventLike(crawler, { title: 'Hour race A' })
    await seedEventLike(crawler, { title: 'Hour race B' })
    const [r1, r2] = await Promise.all([
      runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: a, now: NOW, limit: 2 }),
      runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: b, now: NOW, limit: 2 }),
    ])
    expect(r1.jobsCreated + r2.jobsCreated).toBe(1)
  })

  it('two events race final daily slot → one winner', async () => {
    armControlled({ concurrent: '4', perHour: '10', perDay: '1', perTick: '2' })
    const shared = createSharedAiDispatchState()
    const crawler = new MemoryCrawlerStore()
    const a = new MemoryAiDispatchStore({ shared, useMemoryLock: false })
    const b = new MemoryAiDispatchStore({ shared, useMemoryLock: false })
    await seedEventLike(crawler, { title: 'Day race A' })
    await seedEventLike(crawler, { title: 'Day race B' })
    const [r1, r2] = await Promise.all([
      runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: a, now: NOW, limit: 2 }),
      runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: b, now: NOW, limit: 2 }),
    ])
    expect(r1.jobsCreated + r2.jobsCreated).toBe(1)
  })

  it('two events race final cost budget → one winner', async () => {
    pricingOn()
    process.env.AI_MAX_DRAFTS_PER_HOUR = '10'
    process.env.AI_MAX_DRAFTS_PER_DAY = '10'
    process.env.AI_MAX_DAILY_COST_USD = '0.005'
    process.env.AI_MAX_MONTHLY_COST_USD = '5'
    process.env.CRAWLER_AI_MAX_CONCURRENT_JOBS = '4'
    const shared = createSharedAiDispatchState()
    const a = new MemoryAiDispatchStore({ shared, useMemoryLock: false })
    const b = new MemoryAiDispatchStore({ shared, useMemoryLock: false })
    const limits = autoDraftBudgetLimits()
    const [ra, rb] = await Promise.all([
      atomicReserveAutoDraftBudget({ aiStore: a, costUsd: 0.004, limits, now: NOW }),
      atomicReserveAutoDraftBudget({ aiStore: b, costUsd: 0.004, limits, now: NOW }),
    ])
    expect([ra, rb].filter((r) => r.ok).length).toBe(1)
    expect([ra, rb].filter((r) => !r.ok).length).toBe(1)
  })

  it('same event race → one INITIAL job', async () => {
    armControlled({ concurrent: '4', perHour: '6', perTick: '1' })
    const shared = createSharedAiDispatchState()
    const crawler = new MemoryCrawlerStore()
    const a = new MemoryAiDispatchStore({ shared, useMemoryLock: false })
    const b = new MemoryAiDispatchStore({ shared, useMemoryLock: false })
    await seedEventLike(crawler, { title: 'Same event race' })
    const [r1, r2] = await Promise.all([
      runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: a, now: NOW, limit: 1 }),
      runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: b, now: NOW, limit: 1 }),
    ])
    expect(r1.jobsCreated + r2.jobsCreated).toBe(1)
    expect((await a.listJobs()).filter((j) => j.dispatchType === 'INITIAL').length).toBe(1)
  })

  it('reservation then crash before job → capacity recoverable via release', async () => {
    pricingOn()
    process.env.AI_MAX_DRAFTS_PER_HOUR = '1'
    process.env.AI_MAX_DRAFTS_PER_DAY = '6'
    process.env.AI_MAX_DAILY_COST_USD = '0.05'
    process.env.AI_MAX_MONTHLY_COST_USD = '5'
    const store = new MemoryAiDispatchStore({ useMemoryLock: false })
    const limits = autoDraftBudgetLimits()
    const reserved = await atomicReserveAutoDraftBudget({
      aiStore: store,
      costUsd: 0.004,
      limits,
      now: NOW,
    })
    expect(reserved.ok).toBe(true)
    if (!reserved.ok) return
    // Simulate crash before job: release reservation (recoverable)
    await releaseAutoDraftReservation({
      aiStore: store,
      hour: reserved.hour,
      day: reserved.day,
      month: reserved.month,
      costUsd: reserved.costUsd,
    })
    const again = await atomicReserveAutoDraftBudget({
      aiStore: store,
      costUsd: 0.004,
      limits,
      now: NOW,
    })
    expect(again.ok).toBe(true)
  })

  it('job before provider crash → no unsafe spend (no ledger success)', async () => {
    const store = new MemoryAiDispatchStore()
    await store.insertJob(
      jobStub({
        id: 'j1',
        clusterId: 'c1',
        status: 'PROCESSING',
        executionId: null,
      })
    )
    expect(store.ledger.filter((l) => /success/i.test(l.status)).length).toBe(0)
    expect(
      blocksAutomaticRepay({
        failureCode: null,
        failureReason: null,
        hasSuccessfulLedger: false,
      })
    ).toBe(false)
  })

  it('provider success / finalize failure → no repay', () => {
    expect(
      blocksAutomaticRepay({
        failureCode: 'PROVIDER_SUCCEEDED_FINALIZE_FAILED',
        failureReason: 'provider_succeeded_finalize_failed',
        hasSuccessfulLedger: false,
      })
    ).toBe(true)
    expect(
      blocksAutomaticRepay({
        failureCode: null,
        failureReason: null,
        hasSuccessfulLedger: true,
      })
    ).toBe(true)
  })
})

describe('Phase 4F.3.1 shadow safety', () => {
  it('shadow: 0 provider / 0 jobs / 0 publish; editorial unchanged', async () => {
    pricingOn()
    process.env.CRAWLER_AI_MODE = 'SHADOW_AUTO_DRAFT'
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'false'
    process.env.CRAWLER_AI_PROVIDER_ENABLED = 'false'
    process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = CUTOFF.toISOString()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const cluster = await seedEventLike(crawler, { title: 'Shadow safety' })
    const before = (await crawler.getCluster(cluster.id))?.editorialDecision
    const r = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    expect(r.providerCalls).toBe(0)
    expect(r.jobsCreated).toBe(0)
    expect(autoDraftMayPublish()).toBe(false)
    expect((await ai.listJobs()).length).toBe(0)
    expect((await crawler.getCluster(cluster.id))?.editorialDecision).toBe(before)
    expect((await crawler.getCluster(cluster.id))?.editorialDecision).not.toBe('APPROVED_FOR_AI')
  })

  it('historical cutoff preserved — before cutoff not enqueued in controlled', async () => {
    armControlled({ perTick: '2' })
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const cluster = await seedEventLike(crawler, { title: 'Old backlog' })
    await crawler.updateCluster(cluster.id, {
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      firstSeenAt: new Date('2026-08-01T00:00:00.000Z'),
    })
    const r = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 2,
    })
    expect(r.jobsCreated).toBe(0)
    expect(r.historicalBlocked + r.backlogExcluded).toBeGreaterThan(0)
  })
})

describe('Phase 4F.3.1 unique aggregate helpers', () => {
  it('aggregateUniqueEconomicMetrics counts tiers and prevention', () => {
    const m = aggregateUniqueEconomicMetrics([
      {
        clusterId: 'a',
        contentFingerprint: 'f1',
        prespendGateVersion: '4F3.1',
        action: 'WOULD_DISPATCH',
        blockReason: null,
        economicTier: 'A',
        estimatedCostUsd: 0.01,
        costKnown: true,
        prespendOutcome: 'PRESPEND_READY',
      },
      {
        clusterId: 'b',
        contentFingerprint: 'f2',
        prespendGateVersion: '4F3.1',
        action: 'WOULD_BLOCK',
        blockReason: 'TOO_THIN',
        economicTier: 'D',
        estimatedCostUsd: 0.005,
        costKnown: true,
        prespendOutcome: 'TOO_THIN',
      },
    ])
    expect(m.uniqueWouldDispatch).toBe(1)
    expect(m.uniqueWouldBlock).toBe(1)
    expect(m.estimatedRequestsPrevented).toBe(1)
    expect(m.estimatedSpendPreventedUsd).toBeCloseTo(0.005)
    expect(m.byTier.A).toBe(1)
    expect(m.byTier.D).toBe(1)
  })
})
