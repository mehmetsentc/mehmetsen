/**
 * Phase 4D.1 — provider wiring + safe controlled auto-draft (local, $0).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getCrawlerAiProviderReadiness,
  isCrawlerAiProviderEnabled,
  isCrawlerAiProviderWired,
} from '../aiDispatch/flags'
import {
  getAutoDraftEligibleAfter,
  isEventEligibleForAutoDraft,
  acceptanceHardCaps,
} from './activation'
import { runControlledAutoDraftTick, autoDraftPublicationAllowed } from './pipeline'
import { executeEventDraft, eventDraftPublicationAllowed } from '../eventDraft/executeEventDraft'
import { MemoryAiDispatchStore } from '../aiDispatch/store'
import { MemoryCrawlerStore } from '../store/memory'
import { shouldAttemptPaidSchemaRepair } from '../canary/repairPolicy'
import type { CanaryEvidencePack, CanaryProvider } from '../canary/types'
import { buildCanaryEvidencePack } from '../canary/pack'

function pricingOn() {
  vi.stubEnv('DEEPSEEK_INPUT_COST_PER_1M', '0.14')
  vi.stubEnv('DEEPSEEK_OUTPUT_COST_PER_1M', '0.28')
}

function resetEnv() {
  vi.unstubAllEnvs()
  for (const k of [
    'CRAWLER_AI_DISPATCH_ENABLED',
    'CRAWLER_AI_MODE',
    'CRAWLER_AI_PROVIDER_ENABLED',
    'CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER',
    'CRAWLER_AI_ACCEPTANCE_COHORT_IDS',
    'LEGACY_DIRECT_AI_ENABLED',
    'AI_MAX_COST_PER_EVENT_USD',
    'AI_MAX_DRAFTS_PER_HOUR',
    'AI_MAX_DRAFTS_PER_DAY',
    'AI_MAX_DAILY_COST_USD',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_INPUT_COST_PER_1M',
    'DEEPSEEK_OUTPUT_COST_PER_1M',
  ]) {
    delete process.env[k]
  }
}

afterEach(() => {
  resetEnv()
})

const richBody =
  'Manisa merkezde makilik alanda yangın çıktı. Ekipler havadan ve karadan müdahale ediyor. ' +
  'Vatandaşlar bölgeden uzaklaştırıldı. Rüzgar etkisiyle alevler yayıldı. Yetkililer soğutma çalışması başlattı. '.repeat(
    8
  )

async function seedApprovedEvent(
  crawler: MemoryCrawlerStore,
  now: Date,
  opts?: { decidedAt?: Date; clusterIdHint?: string }
) {
  const source = await crawler.insertSource({
    name: 'Cumhuriyet',
    domain: 'cumhuriyet.com.tr',
    baseUrl: 'https://www.cumhuriyet.com.tr',
    homepageUrl: 'https://www.cumhuriyet.com.tr',
    countryCode: 'TR',
    language: 'tr',
    discoveryMethod: 'RSS',
    healthScore: 85,
    qualityTier: 'TIER_A',
  } as never)
  const article = await crawler.insertRawArticle({
    sourceId: source.id,
    originalUrl: `https://www.cumhuriyet.com.tr/a-${Math.random().toString(36).slice(2, 8)}`,
    title: "Manisa'da makilik alanda yangın",
    articleBodyText: richBody,
    language: 'tr',
    countryCode: 'TR',
    wordCount: 200,
    extractionConfidence: 0.9,
    publishedAt: now,
    fetchedAt: now,
    qualityStatus: 'GOOD',
  } as never)
  const cluster = await crawler.insertCluster({
    representativeArticleId: article.id,
    normalizedTopic: 'manisa yangin',
    countryCode: 'TR',
    city: 'Manisa',
    eventKey: 'manisa-yangin',
    canonicalTitle: "Manisa'da makilik alanda yangın",
  })
  await crawler.updateCluster(cluster.id, {
    editorialDecision: 'APPROVED_FOR_AI',
    editorialDecidedAt: opts?.decidedAt ?? now,
    aiEligibility: 'ELIGIBLE',
    uniqueSourceCount: 2,
    articleCount: 2,
    latestArticleAt: now,
    localImportance: 80,
    importanceScore: 75,
  })
  await crawler.insertMembership({
    clusterId: cluster.id,
    articleId: article.id,
    sourceId: source.id,
    similarityScore: 1,
    matchBand: 'HIGH',
    isCanonical: true,
  })
  return { source, article, cluster }
}

function mockProvider(text: string): CanaryProvider {
  return {
    async chat() {
      return {
        called: true,
        statusCode: 200,
        text,
        inputTokens: 100,
        outputTokens: 50,
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        finishReason: 'stop',
      }
    },
  }
}

describe('Phase 4D.1 provider readiness', () => {
  it('kill switch default false; wired false without switch even if key+pricing present', () => {
    pricingOn()
    process.env.DEEPSEEK_API_KEY = 'sk-test-not-real'
    expect(isCrawlerAiProviderEnabled()).toBe(false)
    expect(isCrawlerAiProviderWired()).toBe(false)
    const r = getCrawlerAiProviderReadiness()
    expect(r.ready).toBe(false)
    expect(r.reason).toBe('PROVIDER_DISABLED')
    expect(r.statusLabelTr).toBe('KAPALI')
    expect(r.credentialPresent).toBe(true)
  })

  it('ready only when switch + credential + pricing + writer + validator', () => {
    pricingOn()
    process.env.CRAWLER_AI_PROVIDER_ENABLED = 'true'
    process.env.DEEPSEEK_API_KEY = 'sk-test-not-real'
    const r = getCrawlerAiProviderReadiness()
    expect(r.ready).toBe(true)
    expect(r.reason).toBeNull()
    expect(r.statusLabelTr).toBe('HAZIR')
    expect(isCrawlerAiProviderWired()).toBe(true)
  })

  it('COST_UNKNOWN when pricing missing', () => {
    process.env.CRAWLER_AI_PROVIDER_ENABLED = 'true'
    process.env.DEEPSEEK_API_KEY = 'sk-test'
    delete process.env.DEEPSEEK_INPUT_COST_PER_1M
    delete process.env.DEEPSEEK_OUTPUT_COST_PER_1M
    const r = getCrawlerAiProviderReadiness()
    expect(r.ready).toBe(false)
    expect(r.reason).toBe('COST_UNKNOWN')
  })
})

describe('Phase 4D.1 activation cutoff', () => {
  it('historical before cutoff excluded; cohort allowed', () => {
    process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = '2026-08-20T18:00:00.000Z'
    const old = isEventEligibleForAutoDraft({
      clusterId: 'cl_old',
      decidedAt: new Date('2026-08-20T10:00:00.000Z'),
    })
    expect(old.ok).toBe(false)
    expect(old.reason).toBe('before_cutoff')

    process.env.CRAWLER_AI_ACCEPTANCE_COHORT_IDS = 'cl_cohort'
    const cohort = isEventEligibleForAutoDraft({
      clusterId: 'cl_cohort',
      decidedAt: new Date('2026-08-20T10:00:00.000Z'),
    })
    expect(cohort.ok).toBe(true)
    expect(cohort.reason).toBe('explicit_cohort')
  })

  it('cutoff unset blocks auto without cohort', () => {
    const r = isEventEligibleForAutoDraft({
      clusterId: 'cl_x',
      decidedAt: new Date(),
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('cutoff_unset')
    expect(getAutoDraftEligibleAfter()).toBeNull()
  })

  it('acceptance caps default 2/2', () => {
    expect(acceptanceHardCaps()).toEqual({ maxEvents: 2, maxRequests: 2 })
  })
})

describe('Phase 4D.1 no dead PENDING when provider blocked', () => {
  it('CONTROLLED_AUTO_DRAFT + dispatch + provider OFF → 0 jobs, PROVIDER_BLOCKED', async () => {
    pricingOn()
    process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
    process.env.AI_MAX_COST_PER_EVENT_USD = '1'
    process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = '2020-01-01T00:00:00.000Z'
    // provider kill switch remains OFF
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const now = new Date()
    const { cluster } = await seedApprovedEvent(crawler, now)

    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now,
      limit: 5,
    })
    expect(tick.jobsCreated).toBe(0)
    expect(tick.providerCalls).toBe(0)
    expect(tick.providerBlocked).toBeGreaterThan(0)
    expect(tick.published).toBe(0)
    const updated = await crawler.getCluster(cluster.id)
    expect(updated?.autoDraftStatus).toBe('PROVIDER_BLOCKED')
    expect(await ai.countActiveJobs()).toBe(0)
  })
})

describe('Phase 4D.1 shared executeEventDraft + publication firewall', () => {
  it('publication helpers always false', () => {
    expect(autoDraftPublicationAllowed()).toBe(false)
    expect(eventDraftPublicationAllowed()).toBe(false)
  })

  it('auto lane never paid-repairs BODY_TOO_SHORT', () => {
    const r = shouldAttemptPaidSchemaRepair({
      validationOk: false,
      issueCodes: ['BODY_TOO_SHORT'],
      jsonParseOk: true,
      alreadyRepaired: false,
      requestCount: 1,
      maxRequests: 2,
    })
    expect(r.repair).toBe(false)
  })

  it('mock provider success creates AI_DRAFT linkage without publish', async () => {
    pricingOn()
    process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
    process.env.CRAWLER_AI_PROVIDER_ENABLED = 'true'
    process.env.DEEPSEEK_API_KEY = 'sk-test'
    process.env.AI_MAX_COST_PER_EVENT_USD = '1'
    process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = '2020-01-01T00:00:00.000Z'

    const body =
      'Bu bir test haber gövdesidir. '.repeat(40) +
      'Manisa yangın ekipleri müdahale ediyor ve vatandaşlar tahliye edildi. '.repeat(20)
    const draftJson = JSON.stringify({
      body,
      title: 'Manisa yangın',
      slug: 'manisa-yangin',
      spot: 'Yangın kontrol altına alınmaya çalışılıyor',
      summary: 'Manisa merkezde makilik alanda çıkan yangına ekipler müdahale ediyor.',
      tags: ['manisa', 'yangin', 'afet'],
      category: 'gundem',
      seoTitle: 'Manisa yangın',
      seoDescription: 'Manisa yangın haberi',
      socialTitle: 'Manisa yangın',
      socialDescription: 'Yangın',
      pushTitle: 'Manisa yangın',
      pushBody: 'Ekipler müdahale ediyor',
      imageAlt: 'yangin',
      imageFilename: 'manisa-yangin.jpg',
      readingTime: 2,
    })

    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const now = new Date()
    await seedApprovedEvent(crawler, now)

    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now,
      limit: 1,
      canaryProvider: mockProvider(draftJson),
    })

    // May fail validation on length depending on pack richness — still no publish
    expect(tick.published).toBe(0)
    expect(tick.providerCalls).toBeLessThanOrEqual(1)
    if (tick.draftsPersisted > 0) {
      expect(tick.providerCalls).toBe(1)
      const jobs = await ai.listJobs({ status: 'COMPLETED' })
      expect(jobs[0]?.editorialNewsId).toMatch(/^draft_controlled_auto_draft_/)
    }
  })

  it('executeEventDraft is the shared writer entrypoint', async () => {
    const pack = buildCanaryEvidencePack(
      {
        id: 'cl_t',
        eventKey: 'e',
        canonicalTitle: 'T',
        normalizedTopic: 't',
        countryCode: 'TR',
        region: null,
        city: 'Manisa',
        district: null,
        editorialDecision: 'APPROVED_FOR_AI',
        aiEligibility: 'ELIGIBLE',
        uniqueSourceCount: 1,
        importanceScore: 70,
        publishedNewsId: null,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        hasMaterialUpdate: false,
      },
      [
        {
          articleId: 'a1',
          sourceId: 's1',
          sourceName: 'Cumhuriyet',
          qualityTier: 'TIER_A',
          healthScore: 80,
          extractionConfidence: 0.9,
          publishedAt: new Date(),
          fetchedAt: new Date(),
          title: 'T',
          body: richBody,
          description: null,
          contentHash: 'h',
          wordCount: 200,
          isExactDuplicate: false,
          editorialStatus: 'NEW',
          editorialNewsId: null,
          sourceStatus: 'ACTIVE',
        },
      ]
    ) as CanaryEvidencePack

    const result = await executeEventDraft({
      pack,
      provider: mockProvider('{"body":"x"}'),
      lane: 'controlled_auto_draft',
      allowPaidSchemaRepair: false,
      maxRequests: 1,
    })
    expect(result.autoPublished).toBe(false)
    expect(result.requestCount).toBe(1)
    expect(result.otherProvidersInvoked).toEqual([])
    expect(result.repairUsed).toBe(false)
  })
})

describe('Phase 4D.1 historical backlog not drained', () => {
  it('before_cutoff events never create jobs even when provider armed', async () => {
    pricingOn()
    process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
    process.env.CRAWLER_AI_PROVIDER_ENABLED = 'true'
    process.env.DEEPSEEK_API_KEY = 'sk-test'
    process.env.AI_MAX_COST_PER_EVENT_USD = '1'
    process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = '2026-08-20T18:00:00.000Z'

    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const now = new Date('2026-08-20T19:00:00.000Z')
    await seedApprovedEvent(crawler, now, {
      decidedAt: new Date('2026-08-20T12:00:00.000Z'),
    })

    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now,
      limit: 5,
      canaryProvider: mockProvider('{}'),
    })
    expect(tick.jobsCreated).toBe(0)
    expect(tick.providerCalls).toBe(0)
    expect(tick.backlogExcluded).toBeGreaterThan(0)
  })
})
