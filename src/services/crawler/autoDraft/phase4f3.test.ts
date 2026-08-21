/**
 * Phase 4F.3 — concurrency + pre-spend + shadow economics (local, $0 paid AI).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluatePrespendGate, estimateBoilerplateRatio } from './preSpendGate'
import { classifyEconomicTier, dedupEconomicsMetrics } from './economicTiers'
import { aggregateShadowFunnel, buildShadowDecision } from './shadowEconomics'
import { atomicReserveAutoDraftBudget } from './concurrency'
import { runControlledAutoDraftTick } from './pipeline'
import { evaluateAutoDraftGate, autoDraftMayPublish } from './eligibility'
import { parseCrawlerAiMode, isShadowAutoDraftEnabled } from '../aiMode'
import { MemoryAiDispatchStore } from '../aiDispatch/store'
import { MemoryCrawlerStore } from '../store/memory'
import { autoDraftBudgetLimits } from './budgetLimits'

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

function armControlled(opts?: { concurrent?: string; perHour?: string; perTick?: string }) {
  pricingOn()
  process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
  process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
  process.env.CRAWLER_AI_PROVIDER_ENABLED = 'false'
  process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = CUTOFF.toISOString()
  process.env.AI_MAX_COST_PER_EVENT_USD = '0.01'
  process.env.AI_MAX_DRAFTS_PER_HOUR = opts?.perHour ?? '1'
  process.env.AI_MAX_DRAFTS_PER_DAY = '6'
  process.env.AI_MAX_DAILY_COST_USD = '0.05'
  process.env.AI_MAX_MONTHLY_COST_USD = '5'
  process.env.CRAWLER_AI_MAX_CONCURRENT_JOBS = opts?.concurrent ?? '1'
  process.env.CRAWLER_AI_MAX_EVENTS_PER_TICK = opts?.perTick ?? '2'
  process.env.CRAWLER_AI_ACCEPTANCE_MAX_EVENTS = '5'
  process.env.CRAWLER_AI_ACCEPTANCE_MAX_REQUESTS = '10'
}

async function seedEligibleCluster(
  crawler: MemoryCrawlerStore,
  title: string,
  uniqueSources = 2
) {
  return seedEventLike(crawler, { title, uniqueSources })
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

describe('Phase 4F.3 pre-spend gate', () => {
  it('blocks thin / low confidence / boilerplate before spend', () => {
    const gate = evaluateAutoDraftGate({
      clusterAiEligibility: 'ELIGIBLE',
      editorialDecision: 'NONE',
      publishedNewsId: null,
      hasActiveAiJob: false,
      hasCompletedDraft: false,
      hasMaterialUpdate: false,
      bestWordCount: 40,
      independentSourceCount: 2,
      uniqueSourceCount: 2,
      staleHours: 1,
      exactDuplicateOnly: false,
      avgHealth: 80,
      bestConfidence: 0.9,
      hasLocalGeography: true,
      importanceScore: 50,
    })
    const thin = evaluatePrespendGate({
      gate,
      bestWordCount: 40,
      bestConfidence: 0.9,
      avgHealth: 80,
      staleHours: 1,
      independentSourceCount: 2,
      usableSourceWords: 40,
      richness: 'insufficient',
      boilerplateRatio: 0,
      malformedExtraction: false,
      costUnknown: false,
      budgetBlocked: false,
      historicalBlocked: false,
      hasActiveAiJob: false,
      hasCompletedDraft: false,
      publishedNewsId: null,
      exactDuplicateOnly: false,
    })
    expect(thin.outcome).toBe('TOO_THIN')
    expect(thin.rejected).toBe(true)
    expect(thin.readyToSpend).toBe(false)
  })

  it('PRESPEND_READY for rich multi-source', () => {
    const gate = evaluateAutoDraftGate({
      clusterAiEligibility: 'ELIGIBLE',
      editorialDecision: 'NONE',
      publishedNewsId: null,
      hasActiveAiJob: false,
      hasCompletedDraft: false,
      hasMaterialUpdate: false,
      bestWordCount: 400,
      independentSourceCount: 2,
      uniqueSourceCount: 2,
      staleHours: 1,
      exactDuplicateOnly: false,
      avgHealth: 85,
      bestConfidence: 0.9,
      hasLocalGeography: true,
      importanceScore: 60,
    })
    const ok = evaluatePrespendGate({
      gate,
      bestWordCount: 400,
      bestConfidence: 0.9,
      avgHealth: 85,
      staleHours: 1,
      independentSourceCount: 2,
      usableSourceWords: 400,
      richness: 'rich',
      boilerplateRatio: 0.1,
      malformedExtraction: false,
      costUnknown: false,
      budgetBlocked: false,
      historicalBlocked: false,
      hasActiveAiJob: false,
      hasCompletedDraft: false,
      publishedNewsId: null,
      exactDuplicateOnly: false,
    })
    expect(ok.outcome).toBe('PRESPEND_READY')
    expect(ok.readyToSpend).toBe(true)
  })

  it('COST_UNKNOWN blocks', () => {
    const gate = evaluateAutoDraftGate({
      clusterAiEligibility: 'ELIGIBLE',
      editorialDecision: 'NONE',
      publishedNewsId: null,
      hasActiveAiJob: false,
      hasCompletedDraft: false,
      hasMaterialUpdate: false,
      bestWordCount: 400,
      independentSourceCount: 2,
      uniqueSourceCount: 2,
      staleHours: 1,
      exactDuplicateOnly: false,
      avgHealth: 85,
      bestConfidence: 0.9,
      hasLocalGeography: true,
      importanceScore: 60,
    })
    const r = evaluatePrespendGate({
      gate,
      bestWordCount: 400,
      bestConfidence: 0.9,
      avgHealth: 85,
      staleHours: 1,
      independentSourceCount: 2,
      usableSourceWords: 400,
      richness: 'rich',
      boilerplateRatio: 0,
      malformedExtraction: false,
      costUnknown: true,
      budgetBlocked: false,
      historicalBlocked: false,
      hasActiveAiJob: false,
      hasCompletedDraft: false,
      publishedNewsId: null,
      exactDuplicateOnly: false,
    })
    expect(r.outcome).toBe('COST_UNKNOWN')
  })

  it('boilerplate heuristic detects cookie nav lines', () => {
    const text = Array.from({ length: 10 }, (_, i) =>
      i < 6 ? 'Çerez politikası ve gizlilik' : `Gerçek haber cümlesi numarası ${i} buradadır.`
    ).join('\n')
    expect(estimateBoilerplateRatio(text)).toBeGreaterThan(0.4)
  })
})

describe('Phase 4F.3 economic tiers + shadow', () => {
  it('classifies A/B/C/D and never deletes on reject', () => {
    const a = classifyEconomicTier({
      richness: 'rich',
      independentSourceCount: 2,
      usableSourceWords: 500,
      bestConfidence: 0.9,
      avgHealth: 80,
      importanceScore: 70,
      strongSinglePath: null,
      prespendOutcome: 'PRESPEND_READY',
    })
    expect(a.tier).toBe('A')
    expect(a.shadowDispatchAllowed).toBe(true)

    const d = classifyEconomicTier({
      richness: 'thin',
      independentSourceCount: 1,
      usableSourceWords: 90,
      bestConfidence: 0.5,
      avgHealth: 40,
      importanceScore: 20,
      strongSinglePath: null,
      prespendOutcome: 'TOO_THIN',
    })
    expect(d.tier).toBe('D')
    expect(d.shadowDispatchAllowed).toBe(false)
  })

  it('shadow funnel aggregates WOULD_DISPATCH / WOULD_BLOCK', () => {
    const d1 = buildShadowDecision({
      clusterId: 'c1',
      eventKey: 'e1',
      canonicalTitle: 't',
      machineEligibility: 'AUTO_DRAFT_ELIGIBLE',
      prespendOutcome: 'PRESPEND_READY',
      readyToSpend: true,
      tier: 'A',
      shadowDispatchAllowed: true,
      blockReason: null,
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 500,
      estimatedCostUsd: 0.001,
      costKnown: true,
      rankScore: 10,
      independentSourceCount: 2,
      usableSourceWords: 400,
      editorialDecisionSnapshot: 'NONE',
      contentFingerprint: 'fp1',
    })
    const d2 = buildShadowDecision({
      clusterId: 'c2',
      eventKey: 'e2',
      canonicalTitle: 't2',
      machineEligibility: 'TOO_THIN',
      prespendOutcome: 'TOO_THIN',
      readyToSpend: false,
      tier: 'D',
      shadowDispatchAllowed: false,
      blockReason: 'TOO_THIN',
      estimatedInputTokens: 200,
      estimatedOutputTokens: 100,
      estimatedCostUsd: 0.0002,
      costKnown: true,
      rankScore: 1,
      independentSourceCount: 1,
      usableSourceWords: 40,
      editorialDecisionSnapshot: 'NONE',
      contentFingerprint: 'fp2',
    })
    expect(d1.action).toBe('WOULD_DISPATCH')
    expect(d2.action).toBe('WOULD_BLOCK')
    const funnel = aggregateShadowFunnel([d1, d2])
    expect(funnel.wouldDispatch).toBe(1)
    expect(funnel.wouldBlock).toBe(1)
    expect(funnel.estimatedPreventedUsd).toBe(0.0002)
  })

  it('dedup economics is honest for multi-source', () => {
    const m = dedupEconomicsMetrics({
      memberSourceCount: 4,
      independentSourceCount: 2,
      packedSourceCount: 2,
      usableSourceWords: 800,
      packedUsableWords: 500,
    })
    expect(m.duplicateMembersDropped).toBe(2)
    expect(m.wordRetentionRatio).toBe(0.625)
  })

  it('SHADOW_AUTO_DRAFT mode parses; publish still false', () => {
    expect(parseCrawlerAiMode('SHADOW_AUTO_DRAFT')).toBe('SHADOW_AUTO_DRAFT')
    process.env.CRAWLER_AI_MODE = 'SHADOW_AUTO_DRAFT'
    expect(isShadowAutoDraftEnabled()).toBe(true)
    expect(autoDraftMayPublish()).toBe(false)
  })
})

describe('Phase 4F.3 concurrency hardening', () => {
  it('two simultaneous reservations with allowance=1 → exactly one wins', async () => {
    pricingOn()
    process.env.CRAWLER_AI_MAX_CONCURRENT_JOBS = '2'
    process.env.AI_MAX_DRAFTS_PER_HOUR = '1'
    process.env.AI_MAX_DRAFTS_PER_DAY = '6'
    process.env.AI_MAX_DAILY_COST_USD = '0.05'
    process.env.AI_MAX_MONTHLY_COST_USD = '5'
    const store = new MemoryAiDispatchStore()
    const limits = autoDraftBudgetLimits()
    const [a, b] = await Promise.all([
      atomicReserveAutoDraftBudget({ aiStore: store, costUsd: 0.004, limits, now: NOW }),
      atomicReserveAutoDraftBudget({ aiStore: store, costUsd: 0.004, limits, now: NOW }),
    ])
    const wins = [a, b].filter((r) => r.ok).length
    const losses = [a, b].filter((r) => !r.ok).length
    expect(wins).toBe(1)
    expect(losses).toBe(1)
  })

  it('two events race last concurrent slot → exactly 1 job', async () => {
    armControlled({ concurrent: '1', perHour: '6', perTick: '2' })
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEligibleCluster(crawler, 'Yangın race A', 2)
    await seedEligibleCluster(crawler, 'Yangın race B', 2)

    const [r1, r2] = await Promise.all([
      runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW, limit: 2 }),
      runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW, limit: 2 }),
    ])
    const totalJobs = r1.jobsCreated + r2.jobsCreated
    const active = await ai.countActiveJobs()
    expect(active).toBe(1)
    expect(totalJobs).toBe(1)
  })

  it('SHADOW mode creates 0 jobs and records decisions', async () => {
    pricingOn()
    process.env.CRAWLER_AI_MODE = 'SHADOW_AUTO_DRAFT'
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'false'
    process.env.CRAWLER_AI_PROVIDER_ENABLED = 'false'
    process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = CUTOFF.toISOString()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEligibleCluster(crawler, 'Yangın shadow', 2)
    const r = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    expect(r.mode).toBe('SHADOW_AUTO_DRAFT')
    expect(r.jobsCreated).toBe(0)
    expect(r.providerCalls).toBe(0)
    expect((await ai.listShadowDecisions()).length).toBeGreaterThanOrEqual(1)
    expect((await ai.listJobs()).length).toBe(0)
  })
})
