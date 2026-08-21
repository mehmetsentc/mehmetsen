/**
 * Phase 4E.1 — production enqueue path hardening (local mocks, $0).
 * Fixtures A–H + historical-starvation regression (maxEventsPerTick=1).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runControlledAutoDraftTick } from './pipeline'
import { workerMayClaimNewJobs } from './worker'
import { MemoryAiDispatchStore } from '../aiDispatch/store'
import { MemoryCrawlerStore } from '../store/memory'
import { EDITORIAL_OUTPUT_TARGET, type CrawlerAiJobRecord } from '../aiDispatch/types'
import { newCrawlerId } from '../store/types'

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

function armEnqueueEnv(opts?: { provider?: boolean }) {
  pricingOn()
  process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
  process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
  process.env.CRAWLER_AI_PROVIDER_ENABLED = opts?.provider === true ? 'true' : 'false'
  process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = CUTOFF.toISOString()
  process.env.AI_MAX_COST_PER_EVENT_USD = '0.01'
  process.env.AI_MAX_DRAFTS_PER_HOUR = '2'
  process.env.AI_MAX_DRAFTS_PER_DAY = '10'
  process.env.AI_MAX_DAILY_COST_USD = '0.05'
  process.env.AI_MAX_MONTHLY_COST_USD = '5'
  process.env.CRAWLER_AI_ACCEPTANCE_MAX_EVENTS = '5'
  process.env.CRAWLER_AI_ACCEPTANCE_MAX_REQUESTS = '10'
  process.env.CRAWLER_AI_MAX_EVENTS_PER_TICK = '1'
  if (opts?.provider === true) process.env.DEEPSEEK_API_KEY = 'sk-test'
}

async function seedEvent(
  crawler: MemoryCrawlerStore,
  opts: {
    title: string
    decidedAt: Date
    uniqueSources?: number
    publishedNewsId?: string | null
    importance?: number
    wordCount?: number
    confidence?: number
    health?: number
    city?: string | null
    thin?: boolean
  }
) {
  const sources = []
  const n = opts.uniqueSources ?? 2
  for (let i = 0; i < n; i++) {
    sources.push(
      await crawler.insertSource({
        name: `Src${i}`,
        domain: `src${i}.example`,
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
        publishedAt: opts.decidedAt,
        fetchedAt: opts.decidedAt,
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
    editorialDecision: 'APPROVED_FOR_AI',
    editorialDecidedAt: opts.decidedAt,
    aiEligibility: 'ELIGIBLE',
    uniqueSourceCount: n,
    articleCount: n,
    importanceScore: opts.importance ?? 70,
    clusterConfidence: opts.confidence ?? 0.9,
    publishedNewsId: opts.publishedNewsId ?? null,
    latestArticleAt: opts.decidedAt,
    lastSeenAt: opts.decidedAt,
  })
  return { cluster, sources, articles }
}

describe('Phase 4E.1 enqueue path hardening', () => {
  it('P0: historical BEFORE_CUTOFF does not starve fresh event when maxEventsPerTick=1', async () => {
    armEnqueueEnv({ provider: false })
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()

    // Older historical approvals — higher importance so they rank first.
    for (let i = 0; i < 4; i++) {
      await seedEvent(crawler, {
        title: `Historical ${i}`,
        decidedAt: new Date('2026-08-20T12:00:00.000Z'),
        importance: 95 - i,
        uniqueSources: 3,
      })
    }
    const fresh = await seedEvent(crawler, {
      title: 'Fresh multi-source event',
      decidedAt: new Date('2026-08-21T11:00:00.000Z'),
      importance: 55,
      uniqueSources: 2,
    })

    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    expect(tick.jobsCreated).toBe(1)
    expect(tick.historicalBlocked).toBeGreaterThanOrEqual(4)
    expect(tick.skipReasons.BEFORE_ACTIVATION_CUTOFF).toBeGreaterThanOrEqual(4)
    expect(tick.skipReasons.ENQUEUED).toBe(1)
    expect(tick.providerCalls).toBe(0)
    expect(tick.providerReady).toBe(false)
    const job = await ai.getInitialJob(fresh.cluster.id)
    expect(job?.status).toBe('PENDING')
  })

  it('A: fresh multi-source → enqueue with provider OFF', async () => {
    armEnqueueEnv({ provider: false })
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const { cluster } = await seedEvent(crawler, {
      title: 'Multi source A',
      decidedAt: new Date('2026-08-21T11:30:00.000Z'),
      uniqueSources: 2,
    })
    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    expect(tick.jobsCreated).toBe(1)
    expect(tick.aiReady).toBeGreaterThanOrEqual(1)
    expect((await ai.getInitialJob(cluster.id))?.status).toBe('PENDING')
    expect(workerMayClaimNewJobs().ok).toBe(false)
    expect(workerMayClaimNewJobs().reason).toBe('PROVIDER_KILL_SWITCH_OFF')
  })

  it('B: fresh strong-single → enqueue', async () => {
    armEnqueueEnv({ provider: false })
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const { cluster } = await seedEvent(crawler, {
      title: 'Strong single B',
      decidedAt: new Date('2026-08-21T11:30:00.000Z'),
      uniqueSources: 1,
      wordCount: 280,
      confidence: 0.8,
      health: 85,
      importance: 55,
      city: null,
    })
    // high-quality trusted path: words≥150, conf≥0.75, health≥70, importance≥40
    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    expect(tick.jobsCreated).toBe(1)
    expect((await ai.getInitialJob(cluster.id))?.status).toBe('PENDING')
  })

  it('C: historical → BEFORE_ACTIVATION_CUTOFF block', async () => {
    armEnqueueEnv({ provider: false })
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEvent(crawler, {
      title: 'Historical C',
      decidedAt: new Date('2026-08-19T12:00:00.000Z'),
    })
    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    expect(tick.jobsCreated).toBe(0)
    expect(tick.historicalBlocked).toBe(1)
    expect(tick.skipReasons.BEFORE_ACTIVATION_CUTOFF).toBe(1)
  })

  it('D: published → ALREADY_PUBLISHED', async () => {
    armEnqueueEnv({ provider: false })
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEvent(crawler, {
      title: 'Published D',
      decidedAt: new Date('2026-08-21T11:30:00.000Z'),
      publishedNewsId: 'news_published_1',
    })
    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    expect(tick.jobsCreated).toBe(0)
    expect(tick.publishedBlocked).toBe(1)
    expect(tick.skipReasons.ALREADY_PUBLISHED).toBe(1)
  })

  it('E: existing draft → ALREADY_DRAFTED / no re-enqueue', async () => {
    armEnqueueEnv({ provider: false })
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const { cluster } = await seedEvent(crawler, {
      title: 'Drafted E İzmir',
      decidedAt: new Date('2026-08-21T11:30:00.000Z'),
    })
    const now = NOW
    const existing: CrawlerAiJobRecord = {
      id: newCrawlerId('aij'),
      clusterId: cluster.id,
      eventKey: cluster.eventKey,
      status: 'COMPLETED',
      dispatchType: 'INITIAL',
      priority: 70,
      eligibilityStatus: 'AI_READY',
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 1800,
      estimatedTotalTokens: 2800,
      estimatedCostUsd: 0.005,
      actualInputTokens: 1000,
      actualOutputTokens: 1800,
      actualCostUsd: 0.004,
      model: 'deepseek-v4-flash',
      provider: 'deepseek',
      attemptCount: 1,
      maxAttempts: 2,
      reservedAt: now,
      startedAt: now,
      completedAt: now,
      blockedReason: null,
      failureReason: null,
      failureCode: null,
      editorialNewsId: 'draft_izmir',
      outputTarget: EDITORIAL_OUTPUT_TARGET,
      selectedSourceCount: 2,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: null,
      executionId: 'exec_x',
      eventRevision: 'fp',
      draftSnapshot: { title: 'x' },
      validationSnapshot: null,
      createdAt: now,
      updatedAt: now,
    }
    await ai.insertJob(existing)
    // Match drafted fingerprint to current members so gate stays ALREADY_DRAFTED (not UPDATE_AVAILABLE).
    const { fingerprintFromMembers } = await import('./revision')
    const memberships = await crawler.listMemberships(cluster.id)
    const revMembers = []
    for (const m of memberships) {
      const article = await crawler.getRawArticle(m.articleId)
      if (!article) continue
      revMembers.push({
        articleId: article.id,
        sourceId: article.sourceId,
        contentHash: article.contentHash,
        wordCount: article.wordCount,
        title: article.title,
        publishedAt: article.publishedAt,
      })
    }
    const fp = fingerprintFromMembers(cluster.id, cluster.eventKey, revMembers)
    await crawler.updateCluster(cluster.id, {
      draftedContentFingerprint: fp,
      contentFingerprint: fp,
    })
    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    expect(tick.jobsCreated).toBe(0)
    expect(
      tick.existingDraftBlocked + (tick.skipReasons.ALREADY_DRAFTED || 0) + (tick.skipReasons.IDEMPOTENCY_BLOCKED || 0)
    ).toBeGreaterThanOrEqual(1)
  })

  it('F: UPDATE_AVAILABLE → no automatic INITIAL', async () => {
    armEnqueueEnv({ provider: false })
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const { cluster } = await seedEvent(crawler, {
      title: 'Update F',
      decidedAt: new Date('2026-08-21T11:30:00.000Z'),
    })
    const now = NOW
    await ai.insertJob({
      id: newCrawlerId('aij'),
      clusterId: cluster.id,
      eventKey: cluster.eventKey,
      status: 'COMPLETED',
      dispatchType: 'INITIAL',
      priority: 70,
      eligibilityStatus: 'AI_READY',
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 1800,
      estimatedTotalTokens: 2800,
      estimatedCostUsd: 0.005,
      actualInputTokens: 1000,
      actualOutputTokens: 1800,
      actualCostUsd: 0.004,
      model: 'deepseek-v4-flash',
      provider: 'deepseek',
      attemptCount: 1,
      maxAttempts: 2,
      reservedAt: now,
      startedAt: now,
      completedAt: now,
      blockedReason: null,
      failureReason: null,
      failureCode: null,
      editorialNewsId: 'draft_old',
      outputTarget: EDITORIAL_OUTPUT_TARGET,
      selectedSourceCount: 2,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: null,
      executionId: 'exec_old',
      eventRevision: 'fp_old',
      draftSnapshot: { title: 'old' },
      validationSnapshot: null,
      createdAt: now,
      updatedAt: now,
    })
    await crawler.updateCluster(cluster.id, {
      draftedContentFingerprint: 'fp_old',
      contentFingerprint: 'fp_new_material',
      hasMaterialUpdate: true,
      updateReviewStatus: 'UPDATE_AVAILABLE',
    })
    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    expect(tick.jobsCreated).toBe(0)
    expect(
      tick.skipReasons.UPDATE_AVAILABLE || tick.skipReasons.ALREADY_DRAFTED || tick.skipReasons.IDEMPOTENCY_BLOCKED
    ).toBeGreaterThanOrEqual(1)
  })

  it('G: low-quality / too thin → block', async () => {
    armEnqueueEnv({ provider: false })
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEvent(crawler, {
      title: 'Thin G',
      decidedAt: new Date('2026-08-21T11:30:00.000Z'),
      thin: true,
    })
    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    expect(tick.jobsCreated).toBe(0)
    expect(tick.skipReasons.TOO_THIN || tick.skipReasons.LOW_QUALITY).toBeGreaterThanOrEqual(1)
  })

  it('H: before cutoff → block', async () => {
    armEnqueueEnv({ provider: false })
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEvent(crawler, {
      title: 'Just before cutoff',
      decidedAt: new Date('2026-08-21T09:59:59.000Z'),
    })
    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    expect(tick.jobsCreated).toBe(0)
    expect(tick.skipReasons.BEFORE_ACTIVATION_CUTOFF).toBe(1)
  })

  it('repeated tick → 0 new jobs (idempotency)', async () => {
    armEnqueueEnv({ provider: false })
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEvent(crawler, {
      title: 'Idempotent',
      decidedAt: new Date('2026-08-21T11:30:00.000Z'),
    })
    const t1 = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    const t2 = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    expect(t1.jobsCreated).toBe(1)
    expect(t2.jobsCreated).toBe(0)
    expect(
      (t2.skipReasons.IDEMPOTENCY_BLOCKED || 0) +
        (t2.skipReasons.IDEMPOTENCY_DUPLICATE || 0) +
        (t2.skipReasons.ALREADY_DRAFTED || 0)
    ).toBeGreaterThanOrEqual(1)
  })

  it('MODE OFF → MODE_OFF, crawler-path telemetry zero jobs', async () => {
    pricingOn()
    process.env.CRAWLER_AI_MODE = 'OFF'
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
    process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = CUTOFF.toISOString()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    await seedEvent(crawler, {
      title: 'Off mode',
      decidedAt: new Date('2026-08-21T11:30:00.000Z'),
    })
    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: NOW,
      limit: 1,
    })
    expect(tick.jobsCreated).toBe(0)
    expect(tick.skipReasons.MODE_OFF).toBe(1)
    expect(tick.providerCalls).toBe(0)
  })
})
