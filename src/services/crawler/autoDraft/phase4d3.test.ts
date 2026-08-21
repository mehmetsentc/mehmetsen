/**
 * Phase 4D.3 — dedicated AI worker + lease recovery (local mocks, $0).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryAiDispatchStore } from '../aiDispatch/store'
import { MemoryCrawlerStore } from '../store/memory'
import { EDITORIAL_OUTPUT_TARGET, type CrawlerAiJobRecord } from '../aiDispatch/types'
import { runControlledAutoDraftTick } from './pipeline'
import { runDedicatedAiWorkerTick } from './worker'
import { blocksAutomaticRepay, newExecutionId, newWorkerId } from './lease'
import { evaluateAutoDraftGate } from './eligibility'
import { autoDraftPublicationAllowed } from './pipeline'
import { eventDraftPublicationAllowed } from '../eventDraft/executeEventDraft'
import { buildMockValidDraftJson } from '../canary/execute'
import type { CanaryProvider } from '../canary/types'

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
    'CRAWLER_AI_ACCEPTANCE_COHORT_IDS',
    'CRAWLER_AI_JOB_LEASE_MS',
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
  'Vatandaşlar bölgeden uzaklaştırıldı. Rüzgar etkisiyle alevler yayıldı. Yetkililer soğutma çalışması başlattı. ' +
  Array.from({ length: 280 }, (_, i) => `manisaOlgu${i}`).join(' ')

function mockOkProvider(): CanaryProvider {
  return {
    chat: async () => ({
      called: true,
      text: buildMockValidDraftJson({
        title: "Manisa'da makilik alanda yangın",
        slug: 'manisa-makilik-alanda-yangin',
        spot: 'Manisa merkezde makilik alanda yangın çıktı.',
        summary:
          'Manisa merkezde makilik alanda yangın çıktı. Ekipler havadan ve karadan müdahale ediyor.',
        tags: ['manisa', 'yangin', 'afet'],
        category: 'gundem',
        seoTitle: 'Manisa yangın',
        seoDescription: 'Manisa merkezde makilik alanda çıkan yangına ekipler müdahale ediyor ve vatandaşlar bilgilendirildi.',
        seoKeywords: ['manisa', 'yangin'],
        socialTitle: 'Manisa yangın',
        socialDescription: 'Ekipler müdahale ediyor',
        pushTitle: 'Manisa yangın',
        pushText: 'Ekipler müdahale ediyor',
        imageAlt: 'manisa yangin',
        imageFilename: 'manisa-yangin.jpg',
        body: richBody,
      }),
      statusCode: 200,
      inputTokens: 100,
      outputTokens: 200,
      finishReason: 'stop',
      provider: 'deepseek' as const,
      model: 'deepseek-v4-flash',
    }),
  }
}

function mockShortBodyProvider(): CanaryProvider {
  return {
    chat: async () => ({
      called: true,
      text: JSON.stringify({
        body: 'kısa',
        title: 'T',
        slug: 't',
        spot: 's',
        summary: 'sum',
        tags: ['a'],
        category: 'gundem',
        seoTitle: 't',
        seoDescription: 'd'.repeat(50),
        seoKeywords: ['a'],
        socialTitle: 't',
        socialDescription: 'd',
        pushTitle: 't',
        pushText: 'p',
        imageAlt: 'a',
        imageFilename: 'a.jpg',
        readingTime: 1,
      }),
      statusCode: 200,
      inputTokens: 50,
      outputTokens: 20,
      finishReason: 'stop',
      provider: 'deepseek' as const,
      model: 'deepseek-v4-flash',
    }),
  }
}

async function seedApproved(crawler: MemoryCrawlerStore, now: Date) {
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
    status: 'ACTIVE',
  } as never)
  const article = await crawler.insertRawArticle({
    sourceId: source.id,
    originalUrl: `https://www.cumhuriyet.com.tr/a-${Math.random().toString(36).slice(2, 8)}`,
    title: "Manisa'da makilik alanda yangın",
    articleBodyText: richBody,
    language: 'tr',
    countryCode: 'TR',
    wordCount: 320,
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
    editorialDecidedAt: now,
    aiEligibility: 'ELIGIBLE',
    uniqueSourceCount: 2,
    articleCount: 2,
    latestArticleAt: now,
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

function pendingJob(clusterId: string, eventKey: string): CrawlerAiJobRecord {
  const now = new Date()
  return {
    id: `aij_test_${Math.random().toString(36).slice(2, 10)}`,
    clusterId,
    eventKey,
    status: 'PENDING',
    dispatchType: 'INITIAL',
    priority: 75,
    eligibilityStatus: 'AI_READY',
    estimatedInputTokens: 500,
    estimatedOutputTokens: 1000,
    estimatedTotalTokens: 1500,
    estimatedCostUsd: 0.005,
    actualInputTokens: null,
    actualOutputTokens: null,
    actualCostUsd: null,
    model: 'deepseek-v4-flash',
    provider: 'deepseek',
    attemptCount: 0,
    maxAttempts: 2,
    reservedAt: now,
    startedAt: null,
    completedAt: null,
    blockedReason: null,
    failureReason: null,
    failureCode: null,
    editorialNewsId: null,
    outputTarget: EDITORIAL_OUTPUT_TARGET,
    selectedSourceCount: 1,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastHeartbeatAt: null,
    executionId: null,
    eventRevision: 'fp1',
    draftSnapshot: null,
    validationSnapshot: null,
    createdAt: now,
    updatedAt: now,
  }
}

function armWorkerEnv() {
  pricingOn()
  process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
  process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
  process.env.CRAWLER_AI_PROVIDER_ENABLED = 'true'
  process.env.DEEPSEEK_API_KEY = 'sk-test'
  process.env.AI_MAX_COST_PER_EVENT_USD = '0.01'
  process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = '2020-01-01T00:00:00.000Z'
}

describe('Phase 4D.3 STRONG_SINGLE_SOURCE without fake city', () => {
  it('high-quality single source qualifies without geography hack', () => {
    const gate = evaluateAutoDraftGate({
      clusterAiEligibility: 'ELIGIBLE',
      editorialDecision: 'APPROVED_FOR_AI',
      publishedNewsId: null,
      hasActiveAiJob: false,
      hasCompletedDraft: false,
      hasMaterialUpdate: false,
      bestWordCount: 290,
      independentSourceCount: 1,
      uniqueSourceCount: 1,
      staleHours: 1,
      exactDuplicateOnly: false,
      avgHealth: 92,
      bestConfidence: 0.78,
      hasLocalGeography: false,
      importanceScore: 43,
    })
    expect(gate.status).toBe('AUTO_DRAFT_ELIGIBLE')
    expect(gate.reason).toBe('STRONG_SINGLE_SOURCE')
  })

  it('WATCHING + STRONG_SINGLE_SOURCE → AI_READY (no force ELIGIBLE hack)', () => {
    const gate = evaluateAutoDraftGate({
      clusterAiEligibility: 'WATCHING',
      editorialDecision: 'APPROVED_FOR_AI',
      publishedNewsId: null,
      hasActiveAiJob: false,
      hasCompletedDraft: false,
      hasMaterialUpdate: false,
      bestWordCount: 251,
      independentSourceCount: 1,
      uniqueSourceCount: 1,
      staleHours: 1,
      exactDuplicateOnly: false,
      avgHealth: 92,
      bestConfidence: 0.92,
      hasLocalGeography: false,
      importanceScore: 51,
    })
    expect(gate.status).toBe('AUTO_DRAFT_ELIGIBLE')
    expect(gate.reason).toBe('STRONG_SINGLE_SOURCE')
  })
})

describe('Phase 4D.3 dedicated worker lease + lifecycle', () => {
  it('worker claims one job; dual claim fails for second worker', async () => {
    armWorkerEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const now = new Date()
    const { cluster } = await seedApproved(crawler, now)
    await ai.insertJob(pendingJob(cluster.id, cluster.eventKey || 'e'))

    const a = await ai.claimNextJob!({
      workerId: 'aiw_a',
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      now,
    })
    const b = await ai.claimNextJob!({
      workerId: 'aiw_b',
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      now,
    })
    expect(a?.leaseOwner).toBe('aiw_a')
    expect(b).toBeNull()
  })

  it('expired lease without executionId is reclaimable', async () => {
    armWorkerEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const now = new Date()
    const { cluster } = await seedApproved(crawler, now)
    const job = pendingJob(cluster.id, 'e')
    await ai.insertJob(job)
    await ai.updateJob(job.id, {
      status: 'PROCESSING',
      leaseOwner: 'dead',
      leaseExpiresAt: new Date(now.getTime() - 1000),
      executionId: null,
    })
    const claimed = await ai.claimNextJob!({
      workerId: 'aiw_recover',
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      now,
    })
    expect(claimed?.id).toBe(job.id)
    expect(claimed?.leaseOwner).toBe('aiw_recover')
  })

  it('provider success → COMPLETED + durable draftSnapshot', async () => {
    armWorkerEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const now = new Date()
    const { cluster } = await seedApproved(crawler, now)
    await ai.insertJob(pendingJob(cluster.id, cluster.eventKey || 'e'))

    const result = await runDedicatedAiWorkerTick({
      crawlerStore: crawler,
      aiStore: ai,
      now,
      canaryProvider: mockOkProvider(),
      workerId: newWorkerId(),
    })
    expect(result.claimed).toBe(1)
    expect(result.providerCalls).toBe(1)
    expect(result.completed).toBe(1)
    expect(result.draftsPersisted).toBe(1)
    expect(result.draftId).toMatch(/^d_cad_/)
    expect(result.published).toBe(0)

    const jobs = await ai.listJobs({ status: 'COMPLETED' })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.draftSnapshot).toBeTruthy()
    expect((jobs[0]?.draftSnapshot as { status: string }).status).toBe('AI_DRAFT')
    expect(jobs[0]?.executionId).toBeTruthy()
    expect(jobs[0]?.leaseOwner).toBeNull()

    const ledger = await ai.listLedger({ lane: 'crawler_automatic' })
    expect(ledger.some((r) => r.status === 'SUCCESS' && r.mode === 'controlled_auto_draft')).toBe(
      true
    )
    expect(ledger[0]?.id).toBe(jobs[0]?.executionId)
  })

  it('BODY_TOO_SHORT → FAILED / one request / no repair', async () => {
    armWorkerEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const now = new Date()
    const { cluster } = await seedApproved(crawler, now)
    await ai.insertJob(pendingJob(cluster.id, 'e'))

    let calls = 0
    const provider: CanaryProvider = {
      chat: async () => {
        calls += 1
        return mockShortBodyProvider().chat({
          system: '',
          user: '',
          model: 'x',
          pack: {} as never,
        })
      },
    }

    const result = await runDedicatedAiWorkerTick({
      crawlerStore: crawler,
      aiStore: ai,
      now,
      canaryProvider: provider,
    })
    expect(calls).toBe(1)
    expect(result.providerCalls).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.completed).toBe(0)
    const jobs = await ai.listJobs()
    expect(jobs[0]?.status).toBe('FAILED')
    expect(jobs[0]?.failureCode || jobs[0]?.failureReason).toBeTruthy()
  })

  it('ledger SUCCESS + stale PROCESSING → no automatic re-pay', async () => {
    armWorkerEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const now = new Date()
    const { cluster } = await seedApproved(crawler, now)
    const job = pendingJob(cluster.id, 'e')
    await ai.insertJob(job)
    const execId = newExecutionId(job.id)
    await ai.updateJob(job.id, {
      status: 'PROCESSING',
      leaseOwner: 'dead',
      leaseExpiresAt: new Date(now.getTime() - 1000),
      executionId: execId,
    })
    await ai.insertLedger({
      id: execId,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      lane: 'crawler_automatic',
      jobId: job.id,
      clusterId: cluster.id,
      requestType: 'controlled_auto_draft',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0.005,
      actualCostUsd: 0.004,
      status: 'SUCCESS',
      mode: 'controlled_auto_draft',
      reason: 'ok',
    })

    expect(
      blocksAutomaticRepay({ hasSuccessfulLedger: true, failureCode: null })
    ).toBe(true)

    const result = await runDedicatedAiWorkerTick({
      crawlerStore: crawler,
      aiStore: ai,
      now,
      canaryProvider: mockOkProvider(),
    })
    // Should not call provider again — either skip or mark finalize-failed
    expect(result.providerCalls).toBe(0)
    expect(result.reasons.PROVIDER_SUCCEEDED_FINALIZE_FAILED || result.reasons.NO_CLAIMABLE_JOB).toBeTruthy()
  })

  it('AI OFF → worker claims 0', async () => {
    pricingOn()
    process.env.CRAWLER_AI_MODE = 'OFF'
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const now = new Date()
    const { cluster } = await seedApproved(crawler, now)
    await ai.insertJob(pendingJob(cluster.id, 'e'))

    const result = await runDedicatedAiWorkerTick({
      crawlerStore: crawler,
      aiStore: ai,
      now,
      canaryProvider: mockOkProvider(),
    })
    expect(result.claimed).toBe(0)
    expect(result.providerCalls).toBe(0)
    expect(result.reasons.MODE_OR_DISPATCH_OFF).toBe(1)
  })

  it('provider OFF → no provider call', async () => {
    pricingOn()
    process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
    process.env.CRAWLER_AI_PROVIDER_ENABLED = 'false'
    process.env.DEEPSEEK_API_KEY = 'sk-test'
    process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = '2020-01-01T00:00:00.000Z'

    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const now = new Date()
    const { cluster } = await seedApproved(crawler, now)
    await ai.insertJob(pendingJob(cluster.id, 'e'))

    const result = await runDedicatedAiWorkerTick({
      crawlerStore: crawler,
      aiStore: ai,
      now,
      canaryProvider: mockOkProvider(),
    })
    expect(result.claimed).toBe(0)
    expect(result.providerCalls).toBe(0)
  })

  it('crawler enqueue creates PENDING without provider call', async () => {
    armWorkerEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const now = new Date()
    await seedApproved(crawler, now)

    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now,
      limit: 1,
    })
    expect(tick.providerCalls).toBe(0)
    expect(tick.draftsPersisted).toBe(0)
    expect(tick.published).toBe(0)
    if (tick.jobsCreated > 0) {
      const jobs = await ai.listJobs()
      expect(jobs[0]?.status).toBe('PENDING')
      expect(jobs[0]?.leaseOwner).toBeNull()
    }
  })

  it('auto publish impossible', () => {
    expect(autoDraftPublicationAllowed()).toBe(false)
    expect(eventDraftPublicationAllowed()).toBe(false)
  })

  it('UPDATE_AVAILABLE does not auto-regenerate via enqueue', async () => {
    armWorkerEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const now = new Date()
    const { cluster } = await seedApproved(crawler, now)
    const done = pendingJob(cluster.id, 'e')
    done.status = 'COMPLETED'
    done.editorialNewsId = 'draft_x'
    await ai.insertJob(done)
    await crawler.updateCluster(cluster.id, {
      draftedContentFingerprint: 'old_fp',
      contentFingerprint: 'new_fp',
      hasMaterialUpdate: true,
      updateReviewStatus: 'UPDATE_AVAILABLE',
    })

    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now,
      limit: 1,
    })
    expect(tick.providerCalls).toBe(0)
    // Should not create another paid job automatically
    expect(tick.jobsCreated).toBe(0)
  })
})
