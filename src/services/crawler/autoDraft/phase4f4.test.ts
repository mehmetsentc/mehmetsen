/**
 * Phase 4F.4 — Tier A/B paid gate + acceptance spend cap (local, no network spend).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { acceptanceHardCaps } from './activation'
import { classifyEconomicTier } from './economicTiers'
import { runControlledAutoDraftTick } from './pipeline'
import { MemoryAiDispatchStore } from '../aiDispatch/store'
import { MemoryCrawlerStore } from '../store/memory'

const CUTOFF = new Date('2026-08-21T15:00:00.000Z')
const NOW = new Date('2026-08-21T15:10:00.000Z')

const RICH =
  'Çanakkale merkezde yol çalışması nedeniyle trafik düzenlemesi yapıldı. '.repeat(30) +
  'Yetkililer sürücüleri alternatif güzergahlara yönlendirdi. '.repeat(20)

function pricingOn() {
  process.env.DEEPSEEK_INPUT_COST_PER_1M = '0.44'
  process.env.DEEPSEEK_OUTPUT_COST_PER_1M = '1.32'
  process.env.DEEPSEEK_NEWS_MODEL = 'deepseek-v4-flash'
  process.env.DEEPSEEK_API_KEY = 'test-key-not-real'
}

function capsOn() {
  process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
  process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
  process.env.CRAWLER_AI_PROVIDER_ENABLED = 'false'
  process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = CUTOFF.toISOString()
  process.env.CRAWLER_AI_ACCEPTANCE_MAX_EVENTS = '5'
  process.env.CRAWLER_AI_ACCEPTANCE_MAX_REQUESTS = '5'
  process.env.CRAWLER_AI_ACCEPTANCE_MAX_SPEND_USD = '0.025'
  process.env.AI_MAX_COST_PER_EVENT_USD = '0.01'
  process.env.AI_MAX_DRAFTS_PER_HOUR = '5'
  process.env.AI_MAX_DRAFTS_PER_DAY = '5'
  process.env.AI_MAX_DAILY_COST_USD = '0.025'
  process.env.CRAWLER_AI_HOURLY_BUDGET_USD = '0.025'
  process.env.CRAWLER_AI_MAX_CONCURRENT_JOBS = '1'
  process.env.CRAWLER_AI_MAX_EVENTS_PER_TICK = '1'
  process.env.LEGACY_DIRECT_AI_ENABLED = 'false'
  process.env.CRAWLER_AI_AUTO_PUBLISH = 'false'
}

afterEach(() => {
  for (const k of [
    'CRAWLER_AI_MODE',
    'CRAWLER_AI_DISPATCH_ENABLED',
    'CRAWLER_AI_PROVIDER_ENABLED',
    'CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER',
    'CRAWLER_AI_ACCEPTANCE_MAX_EVENTS',
    'CRAWLER_AI_ACCEPTANCE_MAX_REQUESTS',
    'CRAWLER_AI_ACCEPTANCE_MAX_SPEND_USD',
    'DEEPSEEK_API_KEY',
  ]) {
    delete process.env[k]
  }
})

async function seedRichMulti(crawler: MemoryCrawlerStore, createdAt: Date) {
  const sources = []
  for (let i = 0; i < 2; i++) {
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
  for (let i = 0; i < 2; i++) {
    articles.push(
      await crawler.insertRawArticle({
        sourceId: sources[i].id,
        originalUrl: `https://src${i}.example/${Math.random().toString(36).slice(2, 8)}`,
        title: 'Çanakkale trafik düzenlemesi',
        articleBodyText: RICH,
        language: 'tr',
        countryCode: 'TR',
        wordCount: 450,
        extractionConfidence: 0.9,
        publishedAt: createdAt,
        fetchedAt: createdAt,
        qualityStatus: 'GOOD',
      } as never)
    )
  }
  const cluster = await crawler.insertCluster({
    representativeArticleId: articles[0].id,
    normalizedTopic: 'canakkale-trafik',
    countryCode: 'TR',
    city: 'Çanakkale',
    eventKey: `ek-${Math.random().toString(36).slice(2, 8)}`,
    canonicalTitle: 'Çanakkale trafik düzenlemesi',
  })
  for (let i = 0; i < 2; i++) {
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
    uniqueSourceCount: 2,
    articleCount: 2,
    importanceScore: 70,
    clusterConfidence: 0.9,
    publishedNewsId: null,
    latestArticleAt: createdAt,
    lastSeenAt: createdAt,
    firstSeenAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  })
  return cluster
}

describe('Phase 4F.4 acceptance hard caps', () => {
  it('maxSpendUsd disabled by default; env enables', () => {
    delete process.env.CRAWLER_AI_ACCEPTANCE_MAX_SPEND_USD
    expect(acceptanceHardCaps().maxSpendUsd).toBe(0)
    process.env.CRAWLER_AI_ACCEPTANCE_MAX_SPEND_USD = '0.025'
    expect(acceptanceHardCaps().maxSpendUsd).toBe(0.025)
  })
})

describe('Phase 4F.4 economic tier paid gate', () => {
  it('Tier C/D never shadowDispatchAllowed', () => {
    const c = classifyEconomicTier({
      richness: 'medium',
      independentSourceCount: 1,
      usableSourceWords: 160,
      bestConfidence: 0.7,
      avgHealth: 50,
      importanceScore: 40,
      prespendOutcome: 'PRESPEND_READY',
    })
    expect(c.tier).toBe('C')
    expect(c.shadowDispatchAllowed).toBe(false)

    const d = classifyEconomicTier({
      richness: 'thin',
      independentSourceCount: 1,
      usableSourceWords: 40,
      bestConfidence: 0.5,
      avgHealth: 40,
      importanceScore: 10,
      prespendOutcome: 'TOO_THIN',
    })
    expect(d.tier).toBe('D')
    expect(d.shadowDispatchAllowed).toBe(false)
  })

  it('Tier A allowed when PRESPEND_READY', () => {
    const a = classifyEconomicTier({
      richness: 'rich',
      independentSourceCount: 2,
      usableSourceWords: 450,
      bestConfidence: 0.85,
      avgHealth: 80,
      importanceScore: 70,
      prespendOutcome: 'PRESPEND_READY',
    })
    expect(a.tier).toBe('A')
    expect(a.shadowDispatchAllowed).toBe(true)
  })
})

describe('Phase 4F.4 spend cap blocks further enqueue', () => {
  it('ACCEPTANCE_SPEND_CAP when ledger after cutoff >= maxSpend', async () => {
    pricingOn()
    capsOn()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedRichMulti(crawler, new Date('2026-08-21T15:05:00.000Z'))
    await ai.insertLedger({
      id: 'exec_prior_4f4',
      jobId: 'aij_prior',
      clusterId: 'cl_other',
      lane: 'crawler_automatic',
      requestType: 'controlled_auto_draft',
      status: 'SUCCESS',
      actualCostUsd: 0.025,
      estimatedCostUsd: 0.004,
      inputTokens: 1000,
      outputTokens: 500,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      timestamp: new Date('2026-08-21T15:06:00.000Z'),
    })

    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    expect(tick.jobsCreated).toBe(0)
    expect(tick.skipReasons.ACCEPTANCE_SPEND_CAP || 0).toBeGreaterThan(0)
  })
})
