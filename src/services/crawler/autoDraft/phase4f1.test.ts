/**
 * Phase 4F.1 — Design A machine eligibility (local mocks, $0 paid AI).
 * 20-case matrix + human APPROVED_FOR_AI never mutated by machine.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canCreateAutoDraftJob,
  canCreateManualApprovedJob,
  evaluateAutoDraftGate,
  toMachineDraftEligibility,
  autoDraftMayPublish,
  type AutoDraftGateInput,
} from './eligibility'
import { isEventEligibleForAutoDraft } from './activation'
import { runControlledAutoDraftTick, autoDraftPublicationAllowed } from './pipeline'
import { workerMayClaimNewJobs } from './worker'
import { MemoryAiDispatchStore } from '../aiDispatch/store'
import { MemoryCrawlerStore } from '../store/memory'
import { EDITORIAL_OUTPUT_TARGET, type CrawlerAiJobRecord } from '../aiDispatch/types'
import { newCrawlerId } from '../store/types'
import { MACHINE_DRAFT_ELIGIBILITY_LABELS, EDITORIAL_DECISION_LABELS } from '../editorial/labels'

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
    'CRAWLER_AI_MAX_EVENTS_PER_TICK',
    'CRAWLER_AI_ACCEPTANCE_MAX_EVENTS',
    'CRAWLER_AI_ACCEPTANCE_MAX_REQUESTS',
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

afterEach(() => {
  resetEnv()
})

const CUTOFF = new Date('2026-08-21T10:00:00.000Z')
const NOW = new Date('2026-08-21T12:00:00.000Z')
const RICH =
  'Manisa merkezde makilik alanda yangın çıktı. Ekipler havadan ve karadan müdahale ediyor. ' +
  'Vatandaşlar bölgeden uzaklaştırıldı. Rüzgar etkisiyle alevler yayıldı. Yetkililer soğutma çalışması başlattı. '.repeat(
    10
  )

function armEnqueueEnv(opts?: { provider?: boolean; mode?: string }) {
  pricingOn()
  process.env.CRAWLER_AI_MODE = opts?.mode ?? 'CONTROLLED_AUTO_DRAFT'
  process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
  process.env.CRAWLER_AI_PROVIDER_ENABLED = opts?.provider === true ? 'true' : 'false'
  process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = CUTOFF.toISOString()
  process.env.AI_MAX_COST_PER_EVENT_USD = '0.01'
  process.env.AI_MAX_DRAFTS_PER_HOUR = '2'
  process.env.AI_MAX_DRAFTS_PER_DAY = '6'
  process.env.AI_MAX_DAILY_COST_USD = '0.05'
  process.env.AI_MAX_MONTHLY_COST_USD = '5'
  process.env.CRAWLER_AI_ACCEPTANCE_MAX_EVENTS = '5'
  process.env.CRAWLER_AI_ACCEPTANCE_MAX_REQUESTS = '10'
  process.env.CRAWLER_AI_MAX_EVENTS_PER_TICK = '1'
  if (opts?.provider === true) process.env.DEEPSEEK_API_KEY = 'sk-test'
}

function baseGate(over: Partial<AutoDraftGateInput> = {}) {
  return evaluateAutoDraftGate({
    clusterAiEligibility: 'ELIGIBLE',
    editorialDecision: 'NONE',
    publishedNewsId: null,
    hasActiveAiJob: false,
    hasCompletedDraft: false,
    hasMaterialUpdate: false,
    bestWordCount: 400,
    independentSourceCount: 2,
    uniqueSourceCount: 2,
    staleHours: 2,
    exactDuplicateOnly: false,
    avgHealth: 85,
    bestConfidence: 0.9,
    hasLocalGeography: true,
    importanceScore: 60,
    ...over,
  })
}

async function seedEvent(
  crawler: MemoryCrawlerStore,
  opts: {
    title: string
    createdAt: Date
    uniqueSources?: number
    editorialDecision?: string
    publishedNewsId?: string | null
    importance?: number
    wordCount?: number
    confidence?: number
    health?: number
    city?: string | null
    thin?: boolean
    aiEligibility?: string
  }
) {
  const sources = []
  const n = opts.uniqueSources ?? 2
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
        healthScore: opts.health ?? 90,
        qualityTier: 'TIER_A',
      } as never)
    )
  }
  const articles = []
  for (let i = 0; i < n; i++) {
    const body = opts.thin ? 'kısa' : RICH
    articles.push(
      await crawler.insertRawArticle({
        sourceId: sources[i].id,
        originalUrl: `https://src${i}.example/${Math.random().toString(36).slice(2, 8)}`,
        title: opts.title,
        articleBodyText: body,
        language: 'tr',
        countryCode: 'TR',
        wordCount: opts.thin ? 20 : opts.wordCount ?? 400,
        extractionConfidence: opts.confidence ?? 0.9,
        publishedAt: opts.createdAt,
        fetchedAt: opts.createdAt,
        qualityStatus: 'GOOD',
      } as never)
    )
  }
  const cluster = await crawler.insertCluster({
    representativeArticleId: articles[0].id,
    normalizedTopic: opts.title.toLowerCase().slice(0, 40),
    countryCode: 'TR',
    city: opts.city ?? 'Manisa',
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
    editorialDecision: (opts.editorialDecision || 'NONE') as never,
    editorialDecidedAt: opts.editorialDecision === 'APPROVED_FOR_AI' ? opts.createdAt : null,
    aiEligibility: (opts.aiEligibility || 'ELIGIBLE') as never,
    uniqueSourceCount: n,
    articleCount: n,
    importanceScore: opts.importance ?? 70,
    clusterConfidence: opts.confidence ?? 0.9,
    publishedNewsId: opts.publishedNewsId ?? null,
    latestArticleAt: opts.createdAt,
    lastSeenAt: opts.createdAt,
    firstSeenAt: opts.createdAt,
    createdAt: opts.createdAt,
    updatedAt: opts.createdAt,
  })
  return cluster
}

describe('Phase 4F.1 Design A gate matrix', () => {
  it('1. fresh multi-source NONE → AUTO_DRAFT_ELIGIBLE → job allowed', () => {
    const gate = baseGate({ independentSourceCount: 2, editorialDecision: 'NONE' })
    expect(gate.status).toBe('AUTO_DRAFT_ELIGIBLE')
    expect(gate.readyForJob).toBe(true)
    expect(toMachineDraftEligibility(gate)).toBe('AUTO_DRAFT_ELIGIBLE')
    expect(
      canCreateAutoDraftJob({
        gate,
        editorialDecision: 'NONE',
        autoDraftModeEnabled: true,
        budgetOk: true,
        idempotencyOk: true,
      }).ok
    ).toBe(true)
  })

  it('2. fresh strong single NONE → job allowed', () => {
    const gate = baseGate({
      independentSourceCount: 1,
      uniqueSourceCount: 1,
      bestWordCount: 200,
      bestConfidence: 0.8,
      avgHealth: 80,
      hasLocalGeography: true,
      staleHours: 5,
    })
    expect(gate.readyForJob).toBe(true)
    expect(gate.strongSinglePath).toBe('local_or_breaking')
  })

  it('3. weak single → no job', () => {
    const gate = baseGate({
      independentSourceCount: 1,
      uniqueSourceCount: 1,
      bestWordCount: 90,
      bestConfidence: 0.5,
      avgHealth: 50,
      hasLocalGeography: false,
      importanceScore: 20,
      clusterAiEligibility: 'WATCHING',
    })
    expect(gate.status).toBe('WAITING_FOR_MORE_SOURCES')
    expect(gate.readyForJob).toBe(false)
  })

  it('4. human REJECTED → no job', () => {
    expect(baseGate({ editorialDecision: 'REJECTED' }).status).toBe('EDITOR_REJECTED')
  })

  it('5. human ARCHIVED → no job', () => {
    expect(baseGate({ editorialDecision: 'ARCHIVED' }).status).toBe('EDITOR_REJECTED')
  })

  it('6. PUBLISHED → no job', () => {
    expect(baseGate({ publishedNewsId: 'n1' }).status).toBe('ALREADY_PUBLISHED')
  })

  it('7. existing AI_DRAFT → no INITIAL', () => {
    expect(baseGate({ hasCompletedDraft: true }).status).toBe('ALREADY_DRAFTED')
  })

  it('8. UPDATE_AVAILABLE → no automatic second job', () => {
    expect(
      baseGate({ hasCompletedDraft: true, updateReviewStatus: 'UPDATE_AVAILABLE' }).status
    ).toBe('UPDATE_AVAILABLE')
  })

  it('9. before cutoff → no job', () => {
    const r = isEventEligibleForAutoDraft({
      clusterId: 'cl_x',
      eventAt: new Date('2026-08-20T00:00:00.000Z'),
    })
    process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = CUTOFF.toISOString()
    const r2 = isEventEligibleForAutoDraft({
      clusterId: 'cl_x',
      eventAt: new Date('2026-08-20T00:00:00.000Z'),
    })
    expect(r2.ok).toBe(false)
    expect(r2.reason).toBe('before_cutoff')
    void r
  })

  it('10. cutoff unset → automatic path disabled', () => {
    delete process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER
    const r = isEventEligibleForAutoDraft({
      clusterId: 'cl_x',
      eventAt: NOW,
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('cutoff_unset')
  })

  it('13. COST_UNKNOWN → no spend', () => {
    expect(baseGate({ costBlocked: true }).status).toBe('COST_BLOCKED')
  })

  it('16. manual APPROVED_FOR_AI path still works', () => {
    const gate = baseGate({ editorialDecision: 'APPROVED_FOR_AI' })
    expect(
      canCreateManualApprovedJob({
        gate,
        editorialDecision: 'APPROVED_FOR_AI',
        autoDraftModeEnabled: true,
        budgetOk: true,
        idempotencyOk: true,
      }).ok
    ).toBe(true)
  })

  it('17. machine eligibility MUST NOT mutate editorialDecision labels', () => {
    expect(EDITORIAL_DECISION_LABELS.APPROVED_FOR_AI).toBe('AI için onaylandı')
    expect(MACHINE_DRAFT_ELIGIBILITY_LABELS.AUTO_DRAFT_ELIGIBLE).toContain('Otomatik')
    expect(MACHINE_DRAFT_ELIGIBILITY_LABELS.AUTO_DRAFT_ELIGIBLE).not.toContain('onaylandı')
  })

  it('20. AI draft → auto publish impossible', () => {
    expect(autoDraftPublicationAllowed()).toBe(false)
    expect(autoDraftMayPublish()).toBe(false)
  })

  it('WATCHING weak single stays waiting; multi-source WATCHING may promote', () => {
    const weak = baseGate({
      clusterAiEligibility: 'WATCHING',
      independentSourceCount: 1,
      uniqueSourceCount: 1,
      bestWordCount: 100,
      bestConfidence: 0.5,
      avgHealth: 50,
      hasLocalGeography: false,
      importanceScore: 10,
    })
    expect(weak.status).toBe('WAITING_FOR_MORE_SOURCES')
    expect(weak.reason).toBe('watching_weak_single')

    const multi = baseGate({
      clusterAiEligibility: 'WATCHING',
      independentSourceCount: 2,
      uniqueSourceCount: 2,
    })
    expect(multi.status).toBe('AUTO_DRAFT_ELIGIBLE')
  })
})

describe('Phase 4F.1 pipeline Design A', () => {
  it('1+14. NONE multi-source enqueues when mode ON; mode OFF classifies only', async () => {
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const cl = await seedEvent(crawler, {
      title: 'Soma yangın çok kaynak',
      createdAt: new Date('2026-08-21T11:00:00.000Z'),
      uniqueSources: 2,
      editorialDecision: 'NONE',
    })

    // MODE OFF → classify, 0 jobs
    process.env.CRAWLER_AI_MODE = 'OFF'
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'false'
    process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = CUTOFF.toISOString()
    pricingOn()
    const off = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(off.jobsCreated).toBe(0)
    expect(off.providerCalls).toBe(0)
    const afterOff = await crawler.getCluster(cl.id)
    expect(afterOff?.editorialDecision).toBe('NONE')
    expect(afterOff?.machineDraftEligibility).toBe('AUTO_DRAFT_ELIGIBLE')
    expect(afterOff?.autoDraftStatus).toBe('AUTO_DRAFT_ELIGIBLE')

    // MODE ON → enqueue
    armEnqueueEnv({ provider: false })
    const on = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(on.jobsCreated).toBe(1)
    expect(on.providerCalls).toBe(0)
    const afterOn = await crawler.getCluster(cl.id)
    expect(afterOn?.editorialDecision).toBe('NONE')
  })

  it('2. strong single NONE enqueues', async () => {
    armEnqueueEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEvent(crawler, {
      title: 'Çanakkale yerel güçlü tek kaynak',
      createdAt: new Date('2026-08-21T11:30:00.000Z'),
      uniqueSources: 1,
      editorialDecision: 'NONE',
      wordCount: 220,
      confidence: 0.85,
      health: 80,
      city: 'Çanakkale',
      importance: 50,
    })
    const r = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(r.jobsCreated).toBe(1)
  })

  it('3. weak single no job', async () => {
    armEnqueueEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEvent(crawler, {
      title: 'zayıf tek',
      createdAt: new Date('2026-08-21T11:30:00.000Z'),
      uniqueSources: 1,
      editorialDecision: 'NONE',
      thin: true,
      wordCount: 20,
      confidence: 0.5,
      health: 40,
      city: null,
      importance: 10,
      aiEligibility: 'WATCHING',
    })
    const r = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(r.jobsCreated).toBe(0)
  })

  it('4+5. REJECTED/ARCHIVED no job and machine blocked', async () => {
    armEnqueueEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEvent(crawler, {
      title: 'reddedildi',
      createdAt: new Date('2026-08-21T11:30:00.000Z'),
      editorialDecision: 'REJECTED',
    })
    await seedEvent(crawler, {
      title: 'arsiv',
      createdAt: new Date('2026-08-21T11:31:00.000Z'),
      editorialDecision: 'ARCHIVED',
    })
    const r = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(r.jobsCreated).toBe(0)
  })

  it('6. PUBLISHED no job', async () => {
    armEnqueueEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEvent(crawler, {
      title: 'yayinli',
      createdAt: new Date('2026-08-21T11:30:00.000Z'),
      publishedNewsId: 'news_1',
    })
    const r = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(r.jobsCreated).toBe(0)
  })

  it('7+11. existing draft / duplicate tick → one job total', async () => {
    armEnqueueEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const cl = await seedEvent(crawler, {
      title: 'idempotent',
      createdAt: new Date('2026-08-21T11:30:00.000Z'),
    })
    const r1 = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(r1.jobsCreated).toBe(1)
    const r2 = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(r2.jobsCreated).toBe(0)
    const jobs = await ai.listJobs({})
    expect(jobs.filter((j) => j.dispatchType === 'INITIAL' && j.clusterId === cl.id).length).toBe(1)
  })

  it('8. UPDATE_AVAILABLE no second INITIAL', async () => {
    armEnqueueEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const cl = await seedEvent(crawler, {
      title: 'guncelleme',
      createdAt: new Date('2026-08-21T11:30:00.000Z'),
    })
    await ai.insertJob({
      id: newCrawlerId('aij'),
      clusterId: cl.id,
      eventKey: cl.eventKey,
      status: 'COMPLETED',
      dispatchType: 'INITIAL',
      priority: 1,
      eligibilityStatus: 'AUTO_DRAFT_ELIGIBLE',
      estimatedInputTokens: 100,
      estimatedOutputTokens: 100,
      estimatedTotalTokens: 200,
      estimatedCostUsd: 0.001,
      actualInputTokens: 100,
      actualOutputTokens: 100,
      actualCostUsd: 0.001,
      model: 'deepseek-v4-flash',
      provider: 'deepseek',
      attemptCount: 1,
      maxAttempts: 1,
      reservedAt: NOW,
      startedAt: NOW,
      completedAt: NOW,
      blockedReason: null,
      failureReason: null,
      failureCode: null,
      editorialNewsId: 'd_x',
      outputTarget: EDITORIAL_OUTPUT_TARGET,
      selectedSourceCount: 2,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: null,
      executionId: 'exec_x',
      eventRevision: 'fp_old',
      draftSnapshot: { title: 't', body: 'b' },
      validationSnapshot: null,
      createdAt: NOW,
      updatedAt: NOW,
    } as CrawlerAiJobRecord)
    await crawler.updateCluster(cl.id, {
      draftedContentFingerprint: 'fp_old',
      contentFingerprint: 'fp_new',
      hasMaterialUpdate: true,
      updateReviewStatus: 'UPDATE_AVAILABLE',
    })
    const r = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(r.jobsCreated).toBe(0)
    expect(r.updateAvailable + (r.skipReasons.UPDATE_AVAILABLE || 0)).toBeGreaterThan(0)
  })

  it('9. before cutoff no enqueue (still classifies)', async () => {
    armEnqueueEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const cl = await seedEvent(crawler, {
      title: 'eski olay',
      createdAt: new Date('2026-08-20T01:00:00.000Z'),
    })
    const r = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(r.jobsCreated).toBe(0)
    expect(r.skipReasons.BEFORE_ACTIVATION_CUTOFF || 0).toBeGreaterThan(0)
    const after = await crawler.getCluster(cl.id)
    expect(after?.machineDraftEligibility).toBe('AUTO_DRAFT_ELIGIBLE')
    expect(after?.editorialDecision).toBe('NONE')
  })

  it('10. cutoff unset refuses auto enqueue', async () => {
    pricingOn()
    process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
    process.env.CRAWLER_AI_PROVIDER_ENABLED = 'false'
    delete process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER
    process.env.CRAWLER_AI_ACCEPTANCE_MAX_EVENTS = '5'
    process.env.CRAWLER_AI_ACCEPTANCE_MAX_REQUESTS = '10'
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEvent(crawler, {
      title: 'cutoff yok',
      createdAt: NOW,
    })
    const r = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(r.jobsCreated).toBe(0)
    expect(r.skipReasons.CUTOFF_UNSET || 0).toBeGreaterThan(0)
  })

  it('12. concurrent enqueue → one job (maxEventsPerTick=1)', async () => {
    armEnqueueEnv()
    process.env.CRAWLER_AI_MAX_EVENTS_PER_TICK = '1'
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEvent(crawler, { title: 'a', createdAt: new Date('2026-08-21T11:10:00.000Z') })
    await seedEvent(crawler, { title: 'b', createdAt: new Date('2026-08-21T11:20:00.000Z') })
    const r = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(r.jobsCreated).toBe(1)
  })

  it('15. provider OFF → worker zero spend', () => {
    armEnqueueEnv({ provider: false })
    expect(workerMayClaimNewJobs().ok).toBe(false)
  })

  it('16. manual APPROVED_FOR_AI still enqueues', async () => {
    armEnqueueEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEvent(crawler, {
      title: 'manuel onay',
      createdAt: new Date('2026-08-21T11:30:00.000Z'),
      editorialDecision: 'APPROVED_FOR_AI',
    })
    const r = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(r.jobsCreated).toBe(1)
  })

  it('17. machine never writes APPROVED_FOR_AI', async () => {
    armEnqueueEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const cl = await seedEvent(crawler, {
      title: 'insan none kalsin',
      createdAt: new Date('2026-08-21T11:30:00.000Z'),
      editorialDecision: 'NONE',
    })
    await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    const after = await crawler.getCluster(cl.id)
    expect(after?.editorialDecision).toBe('NONE')
    expect(after?.editorialDecidedBy).toBeNull()
    expect(after?.machineDraftEligibility).toBe('AUTO_DRAFT_ELIGIBLE')
  })

  it('18. multi-source duplicate articles → one event / one job', async () => {
    armEnqueueEnv()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEvent(crawler, {
      title: 'tek olay cok makale',
      createdAt: new Date('2026-08-21T11:30:00.000Z'),
      uniqueSources: 3,
    })
    const r = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(r.jobsCreated).toBe(1)
    expect((await ai.listJobs({})).length).toBe(1)
  })

  it('19. Soma vs Akhisar → separate events / separate eligibility', async () => {
    armEnqueueEnv()
    process.env.CRAWLER_AI_MAX_EVENTS_PER_TICK = '1'
    process.env.CRAWLER_AI_ACCEPTANCE_MAX_EVENTS = '5'
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const soma = await seedEvent(crawler, {
      title: 'Soma maden yangını',
      createdAt: new Date('2026-08-21T11:10:00.000Z'),
      city: 'Soma',
    })
    const akh = await seedEvent(crawler, {
      title: 'Akhisar orman yangını',
      createdAt: new Date('2026-08-21T11:20:00.000Z'),
      city: 'Akhisar',
    })
    expect(soma.id).not.toBe(akh.id)
    // Concurrency=1 → one PENDING per tick; two ticks prove separate events.
    const r1 = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(r1.jobsCreated).toBe(1)
    const j1 = (await ai.listJobs({}))[0]
    await ai.updateJob(j1.id, { status: 'COMPLETED', completedAt: NOW, editorialNewsId: 'd_soma' })
    const r2 = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai, now: NOW })
    expect(r2.jobsCreated).toBe(1)
    const jobs = await ai.listJobs({})
    expect(new Set(jobs.map((j) => j.clusterId)).size).toBe(2)
    expect(jobs.some((j) => j.clusterId === soma.id)).toBe(true)
    expect(jobs.some((j) => j.clusterId === akh.id)).toBe(true)
  })
})
