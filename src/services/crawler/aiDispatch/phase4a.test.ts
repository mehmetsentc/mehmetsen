import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluateDispatchCandidate } from './evaluate'
import { selectEvidenceSources } from './sourceSelect'
import { buildEventAiPack } from './pack'
import { fitPackToTokenCeiling } from './tokens'
import { estimateDispatchCost } from './cost'
import { applyProviderStatus, shouldRetryProviderStatus, emptyCircuit } from './circuit'
import { tryReserveBudget, periodKeys, settleReservation, emptyWindow } from './budget'
import { sortDispatchCandidates, dispatchPriorityScore } from './priority'
import { MemoryAiDispatchStore } from './store'
import { executeReservedJob, runAiDispatchSafetyTick, recordManualEditorLedger, settleJobBudget } from './tick'
import { pipelineRequestBounds, pipelineTokenBounds } from './pipelineAudit'
import { EDITORIAL_OUTPUT_TARGET, type CrawlerAiJobRecord, type CrawlerAiProvider, type EvaluationInputCluster, type MemberEvidence } from './types'
import { dispatchCrawlerArticleToNewsroom, isCrawlerAiDispatchEnabled } from '../dispatch'
import { isLegacyDirectAiEnabled } from '../legacyFlags'
import { isStage1FailFastEnabled } from '@/services/newsroom/stage1FailFast'
import { MemoryCrawlerStore } from '../store/memory'
import { NEWSROOM_AUTO_PUBLISH_ENABLED } from '@/services/newsroom/config'

function pricingOn() {
  vi.stubEnv('DEEPSEEK_INPUT_COST_PER_1M', '0.14')
  vi.stubEnv('DEEPSEEK_OUTPUT_COST_PER_1M', '0.28')
}

function resetEnv() {
  vi.unstubAllEnvs()
  delete process.env.CRAWLER_AI_DISPATCH_ENABLED
  delete process.env.CRAWLER_AI_DISPATCH_DRY_RUN
  delete process.env.DEEPSEEK_INPUT_COST_PER_1M
  delete process.env.DEEPSEEK_OUTPUT_COST_PER_1M
  delete process.env.CRAWLER_AI_MAX_INPUT_TOKENS_PER_EVENT
  delete process.env.CRAWLER_AI_MAX_COST_USD_PER_EVENT
  delete process.env.CRAWLER_AI_HOURLY_BUDGET_USD
  delete process.env.CRAWLER_AI_DAILY_BUDGET_USD
  delete process.env.CRAWLER_AI_MAX_REQUESTS_PER_HOUR
  delete process.env.CRAWLER_AI_MAX_REQUESTS_PER_DAY
  delete process.env.CRAWLER_AI_MAX_CONCURRENT_JOBS
  delete process.env.CRAWLER_AI_PIPELINE_COST_MULTIPLIER
  delete process.env.LEGACY_DIRECT_AI_ENABLED
}

afterEach(() => {
  resetEnv()
})

const body =
  'Çanakkale Belediyesi bugün saat 14.00’te merkezde yol çalışması başlatacağını açıkladı. Ekipler 3 caddeyi kapatacak. Vatandaşlar alternatif güzergah kullanacak. Çalışma 12 saat sürecek ve trafik tedbirleri alınacak. '

function member(partial: Partial<MemberEvidence> & { articleId: string; sourceId: string }): MemberEvidence {
  return {
    sourceName: partial.sourceName || partial.sourceId,
    qualityTier: 'TIER_A',
    healthScore: 80,
    extractionConfidence: 0.85,
    publishedAt: new Date('2026-08-19T10:00:00Z'),
    fetchedAt: new Date('2026-08-19T10:05:00Z'),
    title: 'Yol çalışması başladı',
    body,
    description: 'RSS özeti tam haber değildir.',
    contentHash: partial.contentHash ?? `hash_${partial.articleId}`,
    wordCount: 80,
    isExactDuplicate: false,
    editorialStatus: 'NEW',
    editorialNewsId: null,
    sourceStatus: 'ACTIVE',
    ...partial,
  }
}

function cluster(partial?: Partial<EvaluationInputCluster>): EvaluationInputCluster {
  return {
    id: 'cl_1',
    eventKey: 'evt_1',
    canonicalTitle: 'Yol çalışması',
    normalizedTopic: 'yol calismasi',
    countryCode: 'TR',
    region: 'Marmara',
    city: 'Çanakkale',
    district: null,
    aiEligibility: 'ELIGIBLE',
    importanceScore: 55,
    localImportance: 70,
    nationalImportance: 40,
    globalImportance: 10,
    uniqueSourceCount: 2,
    freshnessScore: 0.8,
    hasMaterialUpdate: false,
    geographicScopeHint: 'CITY',
    ...partial,
  }
}

function emptyBudget(now = new Date()) {
  const k = periodKeys(now)
  return {
    hour: emptyWindow('crawler_automatic', 'hour', k.hour),
    day: emptyWindow('crawler_automatic', 'day', k.day),
  }
}

function jobStub(evalClusterId = 'cl_1'): CrawlerAiJobRecord {
  const now = new Date()
  return {
    id: 'job_1',
    clusterId: evalClusterId,
    eventKey: 'evt_1',
    status: 'RESERVED',
    dispatchType: 'INITIAL',
    priority: 100,
    eligibilityStatus: 'ELIGIBLE',
    estimatedInputTokens: 400,
    estimatedOutputTokens: 1800,
    estimatedTotalTokens: 2200,
    estimatedCostUsd: 0.02,
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
    editorialNewsId: null,
    outputTarget: EDITORIAL_OUTPUT_TARGET,
    selectedSourceCount: 1,
    createdAt: now,
    updatedAt: now,
  }
}

describe('Phase 4A AI dispatch safety', () => {
  it('A. dispatch flag OFF → provider never called', async () => {
    pricingOn()
    const chat = vi.fn(async () => ({ called: true, statusCode: 200 }))
    const provider: CrawlerAiProvider = { chat }
    const crawler = new MemoryCrawlerStore()
    const dispatchStore = new MemoryAiDispatchStore()
    await runAiDispatchSafetyTick({ crawlerStore: crawler, dispatchStore, provider })
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
    expect(chat).not.toHaveBeenCalled()
    expect(dispatchCrawlerArticleToNewsroom().aiRequests).toBe(0)
  })

  it('B. dry-run ON → provider never called', async () => {
    pricingOn()
    vi.stubEnv('CRAWLER_AI_DISPATCH_ENABLED', 'true')
    vi.stubEnv('CRAWLER_AI_DISPATCH_DRY_RUN', 'true')
    const chat = vi.fn(async () => ({ called: true, statusCode: 200 }))
    const result = evaluateDispatchCandidate(
      {
        cluster: cluster(),
        members: [member({ articleId: 'a1', sourceId: 's1' })],
        existingInitialJob: null,
        circuitOpen: false,
        now: new Date(),
        executeMaterialUpdate: false,
      },
      emptyBudget()
    )
    expect(result.blockedReason).toBe('DRY_RUN')
    expect(result.wouldDispatch).toBe(false)
    expect(result.wouldDispatchIfEnabled).toBe(true)
    const store = new MemoryAiDispatchStore()
    await executeReservedJob({
      store,
      job: jobStub(),
      evalResult: result,
      provider: { chat },
    })
    expect(chat).not.toHaveBeenCalled()
  })

  it('C. eligible event → one candidate', () => {
    pricingOn()
    const result = evaluateDispatchCandidate({
      cluster: cluster(),
      members: [member({ articleId: 'a1', sourceId: 's1' })],
      existingInitialJob: null,
      circuitOpen: false,
      now: new Date(),
      executeMaterialUpdate: false,
    })
    expect(result.eligibleAuto).toBe(true)
    expect(result.selectedSourceCount).toBe(1)
    expect(result.wouldDispatchIfEnabled).toBe(true)
  })

  it('D. 10 raw articles same cluster → one INITIAL job', async () => {
    pricingOn()
    const members = Array.from({ length: 10 }, (_, i) =>
      member({
        articleId: `a${i}`,
        sourceId: `s${i}`,
        contentHash: `h${i}`,
        body: `${body} kaynak ${i} ek cümle.`,
      })
    )
    const result = evaluateDispatchCandidate({
      cluster: cluster({ uniqueSourceCount: 10 }),
      members,
      existingInitialJob: null,
      circuitOpen: false,
      now: new Date(),
      executeMaterialUpdate: false,
    })
    expect(result.dispatchType).toBe('INITIAL')
    const store = new MemoryAiDispatchStore()
    const job = { ...jobStub(), id: 'j1' }
    expect(await store.insertJob(job)).toBe('inserted')
    expect(await store.insertJob({ ...job, id: 'j2' })).toBe('duplicate')
    expect([...(await store.listJobs())].filter((j) => j.dispatchType === 'INITIAL')).toHaveLength(1)
  })

  it('E. concurrent job creation → one INITIAL job', async () => {
    const store = new MemoryAiDispatchStore()
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => store.insertJob({ ...jobStub(), id: `j${i}` }))
    )
    expect(results.filter((r) => r === 'inserted')).toHaveLength(1)
    expect(results.filter((r) => r === 'duplicate')).toHaveLength(7)
  })

  it('F. WATCHING → no auto job', () => {
    pricingOn()
    const result = evaluateDispatchCandidate({
      cluster: cluster({ aiEligibility: 'WATCHING' }),
      members: [member({ articleId: 'a1', sourceId: 's1' })],
      existingInitialJob: null,
      circuitOpen: false,
      now: new Date(),
      executeMaterialUpdate: false,
    })
    expect(result.blockedReason).toBe('WATCHING')
    expect(result.wouldDispatchIfEnabled).toBe(false)
  })

  it('G. REJECTED → no auto job', () => {
    const result = evaluateDispatchCandidate({
      cluster: cluster({ aiEligibility: 'REJECTED' }),
      members: [member({ articleId: 'a1', sourceId: 's1' })],
      existingInitialJob: null,
      circuitOpen: false,
      now: new Date(),
      executeMaterialUpdate: false,
    })
    expect(result.blockedReason).toBe('REJECTED')
  })

  it('H. no usable body → blocked', () => {
    const result = evaluateDispatchCandidate({
      cluster: cluster(),
      members: [member({ articleId: 'a1', sourceId: 's1', body: 'kısa', wordCount: 2 })],
      existingInitialJob: null,
      circuitOpen: false,
      now: new Date(),
      executeMaterialUpdate: false,
    })
    expect(result.blockedReason).toBe('NO_USABLE_BODY')
  })

  it('I. duplicate source bodies → not packed twice', () => {
    const members = [
      member({ articleId: 'a1', sourceId: 's1', contentHash: 'same', body }),
      member({ articleId: 'a2', sourceId: 's2', contentHash: 'same', body }),
    ]
    const picked = selectEvidenceSources(members)
    expect(picked).toHaveLength(1)
    const pack = buildEventAiPack(cluster(), members)
    expect(pack.sources).toHaveLength(1)
  })

  it('J. max 3 evidence sources', () => {
    const members = Array.from({ length: 6 }, (_, i) =>
      member({
        articleId: `a${i}`,
        sourceId: `s${i}`,
        contentHash: `uniq${i}`,
        body: `${body} benzersiz ${i} ${i} ${i}`,
      })
    )
    expect(selectEvidenceSources(members).length).toBeLessThanOrEqual(3)
    expect(buildEventAiPack(cluster(), members).sources.length).toBeLessThanOrEqual(3)
  })

  it('K. token estimate is local', () => {
    const pack = buildEventAiPack(cluster(), [member({ articleId: 'a1', sourceId: 's1' })])
    const fitted = fitPackToTokenCeiling(pack)
    expect(fitted.tokens.estimatedInputTokens).toBeGreaterThan(10)
    expect(pack.packedText.includes('<p>')).toBe(false)
    expect(pack.packedText).toContain('SOURCE 1')
    expect(pack.packedText).toContain(body.trim().slice(0, 40))
  })

  it('L. token limit block', () => {
    pricingOn()
    vi.stubEnv('CRAWLER_AI_MAX_INPUT_TOKENS_PER_EVENT', '40')
    const huge = member({
      articleId: 'a1',
      sourceId: 's1',
      body: `${body} ${'kelime '.repeat(400)}`,
      wordCount: 2000,
    })
    const result = evaluateDispatchCandidate({
      cluster: cluster(),
      members: [huge],
      existingInitialJob: null,
      circuitOpen: false,
      now: new Date(),
      executeMaterialUpdate: false,
    })
    expect(result.blockedReason).toBe('TOKEN_BUDGET_EXCEEDED')
  })

  it('M. unknown pricing block', () => {
    const result = evaluateDispatchCandidate({
      cluster: cluster(),
      members: [member({ articleId: 'a1', sourceId: 's1' })],
      existingInitialJob: null,
      circuitOpen: false,
      now: new Date(),
      executeMaterialUpdate: false,
    })
    expect(result.blockedReason).toBe('COST_UNKNOWN')
    expect(estimateDispatchCost({ estimatedInputTokens: 100, estimatedOutputTokens: 50, estimatedTotalTokens: 150 }).known).toBe(
      false
    )
  })

  it('N. per-event cost block', () => {
    pricingOn()
    vi.stubEnv('CRAWLER_AI_MAX_COST_USD_PER_EVENT', '0.0000001')
    vi.stubEnv('CRAWLER_AI_PIPELINE_COST_MULTIPLIER', '8')
    const result = evaluateDispatchCandidate({
      cluster: cluster(),
      members: [member({ articleId: 'a1', sourceId: 's1' })],
      existingInitialJob: null,
      circuitOpen: false,
      now: new Date(),
      executeMaterialUpdate: false,
    })
    expect(result.blockedReason).toBe('EVENT_COST_LIMIT_EXCEEDED')
  })

  it('O. hourly budget block', () => {
    pricingOn()
    vi.stubEnv('CRAWLER_AI_HOURLY_BUDGET_USD', '0.0000001')
    const budget = emptyBudget()
    const result = evaluateDispatchCandidate(
      {
        cluster: cluster(),
        members: [member({ articleId: 'a1', sourceId: 's1' })],
        existingInitialJob: null,
        circuitOpen: false,
        now: new Date(),
        executeMaterialUpdate: false,
      },
      budget
    )
    expect(result.blockedReason).toBe('HOURLY_BUDGET_EXCEEDED')
  })

  it('P. daily budget block', () => {
    pricingOn()
    vi.stubEnv('CRAWLER_AI_HOURLY_BUDGET_USD', '10')
    vi.stubEnv('CRAWLER_AI_DAILY_BUDGET_USD', '0.0000001')
    const result = evaluateDispatchCandidate(
      {
        cluster: cluster(),
        members: [member({ articleId: 'a1', sourceId: 's1' })],
        existingInitialJob: null,
        circuitOpen: false,
        now: new Date(),
        executeMaterialUpdate: false,
      },
      emptyBudget()
    )
    expect(result.blockedReason).toBe('DAILY_BUDGET_EXCEEDED')
  })

  it('Q. hourly request limit', () => {
    const hour = emptyWindow('crawler_automatic', 'hour', 'x')
    hour.requestCount = 999
    const r = tryReserveBudget({
      hour,
      day: emptyWindow('crawler_automatic', 'day', 'y'),
      costUsd: 0.01,
      concurrentJobs: 0,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('HOURLY_REQUEST_LIMIT')
  })

  it('R. daily request limit', () => {
    vi.stubEnv('CRAWLER_AI_MAX_REQUESTS_PER_HOUR', '100')
    const day = emptyWindow('crawler_automatic', 'day', 'y')
    day.requestCount = 999
    const r = tryReserveBudget({
      hour: emptyWindow('crawler_automatic', 'hour', 'x'),
      day,
      costUsd: 0.01,
      concurrentJobs: 0,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('DAILY_REQUEST_LIMIT')
  })

  it('S. atomic budget reservation', async () => {
    const store = new MemoryAiDispatchStore()
    const now = new Date()
    const k = periodKeys(now)
    const hour = await store.getBudgetWindow('crawler_automatic', 'hour', k.hour)
    const day = await store.getBudgetWindow('crawler_automatic', 'day', k.day)
    const next = tryReserveBudget({ hour, day, costUsd: 0.02, concurrentJobs: 0 })
    expect(next.ok).toBe(true)
    if (!next.ok) return
    const ok = await store.compareAndReserve({
      lane: 'crawler_automatic',
      hour,
      day,
      nextHour: next.hour,
      nextDay: next.day,
    })
    expect(ok).toBe(true)
    const hour2 = await store.getBudgetWindow('crawler_automatic', 'hour', k.hour)
    expect(hour2.reservedUsd).toBeCloseTo(0.02)
  })

  it('T. concurrent reservations cannot overspend', async () => {
    vi.stubEnv('CRAWLER_AI_HOURLY_BUDGET_USD', '0.05')
    vi.stubEnv('CRAWLER_AI_DAILY_BUDGET_USD', '0.05')
    vi.stubEnv('CRAWLER_AI_MAX_REQUESTS_PER_HOUR', '100')
    vi.stubEnv('CRAWLER_AI_MAX_REQUESTS_PER_DAY', '100')
    const store = new MemoryAiDispatchStore()
    const now = new Date()
    const k = periodKeys(now)
    const hour = await store.getBudgetWindow('crawler_automatic', 'hour', k.hour)
    const day = await store.getBudgetWindow('crawler_automatic', 'day', k.day)
    const attempts = await Promise.all(
      [0, 1, 2].map(async () => {
        const snapH = await store.getBudgetWindow('crawler_automatic', 'hour', k.hour)
        const snapD = await store.getBudgetWindow('crawler_automatic', 'day', k.day)
        const next = tryReserveBudget({ hour: snapH, day: snapD, costUsd: 0.04, concurrentJobs: 0 })
        if (!next.ok) return false
        return store.compareAndReserve({
          lane: 'crawler_automatic',
          hour: snapH,
          day: snapD,
          nextHour: next.hour,
          nextDay: next.day,
        })
      })
    )
    expect(attempts.filter(Boolean).length).toBe(1)
    const finalHour = await store.getBudgetWindow('crawler_automatic', 'hour', k.hour)
    expect(finalHour.reservedUsd).toBeLessThanOrEqual(0.05 + 1e-9)
    void hour
    void day
  })

  it('U. 402 opens circuit', () => {
    const next = applyProviderStatus(emptyCircuit(), 402)
    expect(next.state).toBe('OPEN')
    expect(next.reason).toBe('insufficient_balance')
  })

  it('V. 402 no retry loop', () => {
    expect(shouldRetryProviderStatus(402)).toBe(false)
  })

  it('W. 401 opens circuit', () => {
    const next = applyProviderStatus(emptyCircuit(), 401)
    expect(next.state).toBe('OPEN')
    expect(next.reason).toBe('authentication_failure')
  })

  it('X. 429 bounded retry/backoff', () => {
    expect(shouldRetryProviderStatus(429)).toBe(true)
    let c = emptyCircuit()
    c = applyProviderStatus(c, 429)
    c = applyProviderStatus(c, 429)
    expect(c.state).toBe('CLOSED')
    c = applyProviderStatus(c, 429)
    expect(c.state).toBe('OPEN')
  })

  it('Y. 5xx bounded retry', () => {
    expect(shouldRetryProviderStatus(503)).toBe(true)
    let c = emptyCircuit()
    c = applyProviderStatus(c, 503)
    c = applyProviderStatus(c, 500)
    expect(c.state).toBe('CLOSED')
    c = applyProviderStatus(c, 502)
    expect(c.state).toBe('OPEN')
  })

  it('Z. circuit open blocks provider', async () => {
    pricingOn()
    vi.stubEnv('CRAWLER_AI_DISPATCH_ENABLED', 'true')
    const chat = vi.fn(async () => ({ called: true, statusCode: 200 }))
    const store = new MemoryAiDispatchStore()
    await store.saveCircuit({ ...emptyCircuit(), state: 'OPEN', reason: 'insufficient_balance', openedAt: new Date() })
    const evalResult = evaluateDispatchCandidate({
      cluster: cluster(),
      members: [member({ articleId: 'a1', sourceId: 's1' })],
      existingInitialJob: null,
      circuitOpen: true,
      now: new Date(),
      executeMaterialUpdate: false,
    })
    expect(evalResult.blockedReason).toBe('PROVIDER_CIRCUIT_OPEN')
    await executeReservedJob({ store, job: jobStub(), evalResult, provider: { chat } })
    expect(chat).not.toHaveBeenCalled()
  })

  it('AA. crawler continues when circuit open', async () => {
    const crawler = new MemoryCrawlerStore()
    const dispatchStore = new MemoryAiDispatchStore()
    await dispatchStore.saveCircuit({ ...emptyCircuit(), state: 'OPEN', reason: 'insufficient_balance', openedAt: new Date() })
    const tick = await runAiDispatchSafetyTick({ crawlerStore: crawler, dispatchStore })
    expect(tick.providerCalls).toBe(0)
  })

  it('AB. budget blocked event retained', () => {
    pricingOn()
    vi.stubEnv('CRAWLER_AI_DAILY_BUDGET_USD', '0.0000001')
    vi.stubEnv('CRAWLER_AI_HOURLY_BUDGET_USD', '10')
    const result = evaluateDispatchCandidate(
      {
        cluster: cluster(),
        members: [member({ articleId: 'a1', sourceId: 's1' })],
        existingInitialJob: null,
        circuitOpen: false,
        now: new Date(),
        executeMaterialUpdate: false,
      },
      emptyBudget()
    )
    expect(result.blockedReason).toBe('DAILY_BUDGET_EXCEEDED')
    expect(result.clusterId).toBe('cl_1')
  })

  it('AC. priority ordering HIGH_PRIORITY before ELIGIBLE', () => {
    const high = cluster({ id: 'h', aiEligibility: 'HIGH_PRIORITY', importanceScore: 10, localImportance: 0 })
    const elig = cluster({ id: 'e', aiEligibility: 'ELIGIBLE', importanceScore: 90, localImportance: 90 })
    expect(sortDispatchCandidates([elig, high])[0]?.id).toBe('h')
  })

  it('AD. local event not starved', () => {
    const local = cluster({
      id: 'local',
      aiEligibility: 'ELIGIBLE',
      geographicScopeHint: 'CITY',
      localImportance: 80,
      importanceScore: 40,
      city: 'Izmir',
    })
    const national = cluster({
      id: 'nat',
      aiEligibility: 'ELIGIBLE',
      geographicScopeHint: 'NATIONAL',
      localImportance: 10,
      importanceScore: 41,
      city: null,
      district: null,
    })
    expect(dispatchPriorityScore(local)).toBeGreaterThan(dispatchPriorityScore(national))
    expect(sortDispatchCandidates([national, local])[0]?.id).toBe('local')
  })

  it('AE. manual AI separate cost lane', async () => {
    const store = new MemoryAiDispatchStore()
    await recordManualEditorLedger(store, { inputTokens: 100, actualCostUsd: 0.01 })
    const rows = await store.listLedger({ lane: 'manual_editor' })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.lane).toBe('manual_editor')
    const auto = await store.listLedger({ lane: 'crawler_automatic' })
    expect(auto).toHaveLength(0)
  })

  it('AF. legacy automatic AI remains blocked', () => {
    expect(isLegacyDirectAiEnabled()).toBe(false)
  })

  it('AG. no automatic publishing from dispatch', async () => {
    const store = new MemoryAiDispatchStore()
    const evalResult = evaluateDispatchCandidate({
      cluster: cluster(),
      members: [member({ articleId: 'a1', sourceId: 's1' })],
      existingInitialJob: null,
      circuitOpen: false,
      now: new Date(),
      executeMaterialUpdate: false,
    })
    const job = jobStub()
    expect(job.outputTarget).toBe('EDITORIAL_DRAFT')
    await executeReservedJob({
      store,
      job,
      evalResult,
      provider: { chat: async () => ({ called: true, statusCode: 200 }) },
    })
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
    void NEWSROOM_AUTO_PUBLISH_ENABLED
  })

  it('AH. Phase 2L fail-fast helper still present', () => {
    expect(typeof isStage1FailFastEnabled).toBe('function')
  })

  it('AI. source-once packing does not repeat bodies', () => {
    const pack = buildEventAiPack(cluster(), [
      member({ articleId: 'a1', sourceId: 's1', contentHash: 'h1' }),
      member({ articleId: 'a2', sourceId: 's2', contentHash: 'h1' }),
    ])
    const occurrences = pack.packedText.split(body.trim().slice(0, 50)).length - 1
    expect(occurrences).toBe(1)
  })

  it('AJ. actual settlement releases unused reservation', () => {
    const window = emptyWindow('crawler_automatic', 'day', 'd')
    window.reservedUsd = 0.08
    const settled = settleReservation(window, 0.08, 0.03)
    expect(settled.reservedUsd).toBeCloseTo(0)
    expect(settled.spentUsd).toBeCloseTo(0.03)
  })

  it('AJ2. execute 402 does not retry', async () => {
    pricingOn()
    vi.stubEnv('CRAWLER_AI_DISPATCH_ENABLED', 'true')
    const chat = vi.fn(async () => ({ called: true, statusCode: 402, errorCode: 'insufficient_balance' }))
    const store = new MemoryAiDispatchStore()
    await store.insertJob(jobStub())
    const evalResult = evaluateDispatchCandidate({
      cluster: cluster(),
      members: [member({ articleId: 'a1', sourceId: 's1' })],
      existingInitialJob: null,
      circuitOpen: false,
      now: new Date(),
      executeMaterialUpdate: false,
    })
    evalResult.wouldDispatch = true
    evalResult.pack = buildEventAiPack(cluster(), [member({ articleId: 'a1', sourceId: 's1' })])
    await executeReservedJob({ store, job: jobStub(), evalResult, provider: { chat } })
    expect(chat).toHaveBeenCalledTimes(1)
    const circuit = await store.getCircuit('deepseek')
    expect(circuit.state).toBe('OPEN')
    const jobs = await store.listJobs()
    expect(jobs[0]?.failureReason).toBe('insufficient_balance')
  })

  it('material update is not executed in 4A', () => {
    const result = evaluateDispatchCandidate({
      cluster: cluster({ hasMaterialUpdate: true }),
      members: [member({ articleId: 'a1', sourceId: 's1' })],
      existingInitialJob: jobStub(),
      circuitOpen: false,
      now: new Date(),
      executeMaterialUpdate: false,
    })
    expect(result.dispatchType).toBe('MATERIAL_UPDATE')
    expect(result.blockedReason).toBe('MATERIAL_UPDATE_NOT_EXECUTED')
  })

  it('pipeline audit bounds are conservative', () => {
    const req = pipelineRequestBounds()
    expect(req.minRequestsPerEvent).toBeGreaterThanOrEqual(1)
    expect(req.typicalRequestsPerEvent).toBeGreaterThanOrEqual(req.minRequestsPerEvent)
    expect(req.worstBoundedRequestsPerEvent).toBeGreaterThanOrEqual(req.typicalRequestsPerEvent)
    const tok = pipelineTokenBounds(1000, 500)
    expect(tok.worstBoundedTokensPerEvent).toBeGreaterThan(tok.typicalTokensPerEvent)
  })

  it('settleJobBudget releases unused', async () => {
    const store = new MemoryAiDispatchStore()
    const now = new Date()
    const k = periodKeys(now)
    await store.saveBudgetWindow({ ...emptyWindow('crawler_automatic', 'day', k.day), reservedUsd: 0.1 })
    await store.saveBudgetWindow({ ...emptyWindow('crawler_automatic', 'hour', k.hour), reservedUsd: 0.1 })
    await settleJobBudget(store, 0.1, 0.02, now)
    const day = await store.getBudgetWindow('crawler_automatic', 'day', k.day)
    expect(day.reservedUsd).toBeCloseTo(0)
    expect(day.spentUsd).toBeCloseTo(0.02)
  })
})
