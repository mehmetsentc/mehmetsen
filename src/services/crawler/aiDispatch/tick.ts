import { newCrawlerId } from '../store/types'
import type { CrawlerStore } from '../store/types'
import type { NewsClusterRecord, RawArticleRecord } from '../types'
import { isCrawlerAiDispatchEnabled } from '../dispatch'
import { crawlerAiDispatchConfig } from './flags'
import { evaluateDispatchCandidate, type EvaluationResult } from './evaluate'
import { MemoryAiDispatchStore, type AiDispatchStore } from './store'
import { emptyWindow, periodKeys, settleReservation, tryReserveBudget } from './budget'
import { applyProviderStatus, shouldRetryProviderStatus } from './circuit'
import { EDITORIAL_OUTPUT_TARGET, type CrawlerAiJobRecord, type CrawlerAiProvider, type MemberEvidence } from './types'
import { logCrawler } from '../log'

const memoryFallback = new MemoryAiDispatchStore()

function clusterToEval(cluster: NewsClusterRecord) {
  return {
    id: cluster.id,
    eventKey: cluster.eventKey,
    canonicalTitle: cluster.canonicalTitle,
    normalizedTopic: cluster.normalizedTopic,
    countryCode: cluster.countryCode,
    region: cluster.region,
    city: cluster.city,
    district: cluster.district,
    aiEligibility: cluster.aiEligibility,
    importanceScore: cluster.importanceScore,
    localImportance: cluster.localImportance,
    nationalImportance: cluster.nationalImportance,
    globalImportance: cluster.globalImportance,
    uniqueSourceCount: cluster.uniqueSourceCount,
    freshnessScore: cluster.freshnessScore,
    hasMaterialUpdate: cluster.hasMaterialUpdate,
    geographicScopeHint: cluster.city || cluster.district ? 'CITY' : cluster.countryCode ? 'NATIONAL' : 'GLOBAL',
    editorialDecision: cluster.editorialDecision,
  }
}

async function membersFor(
  crawlerStore: CrawlerStore,
  clusterId: string
): Promise<MemberEvidence[]> {
  const memberships = await crawlerStore.listMemberships(clusterId)
  const out: MemberEvidence[] = []
  for (const m of memberships) {
    const article = await crawlerStore.getRawArticle(m.articleId)
    const source = await crawlerStore.getSource(m.sourceId)
    if (!article) continue
    out.push({
      articleId: article.id,
      sourceId: article.sourceId,
      sourceName: source?.name || article.sourceId,
      qualityTier: source?.qualityTier || 'UNTESTED',
      healthScore: source?.healthScore ?? 50,
      extractionConfidence: article.extractionConfidence,
      publishedAt: article.publishedAt,
      fetchedAt: article.fetchedAt,
      title: article.title,
      body: article.articleBodyText,
      description: article.description,
      contentHash: article.contentHash,
      wordCount: article.wordCount,
      isExactDuplicate: article.isExactDuplicate,
      editorialStatus: article.editorialStatus,
      editorialNewsId: article.editorialNewsId,
      sourceStatus: source?.status || 'ACTIVE',
    })
  }
  return out
}

function jobFromEval(evalResult: EvaluationResult, status: CrawlerAiJobRecord['status']): CrawlerAiJobRecord {
  const now = new Date()
  const cfg = crawlerAiDispatchConfig()
  return {
    id: newCrawlerId('aij'),
    clusterId: evalResult.clusterId,
    eventKey: evalResult.eventKey,
    status,
    dispatchType: evalResult.dispatchType,
    priority: evalResult.priority,
    eligibilityStatus: evalResult.eligibleAuto ? 'ELIGIBLE' : null,
    estimatedInputTokens: evalResult.estimatedInputTokens,
    estimatedOutputTokens: evalResult.estimatedOutputTokens,
    estimatedTotalTokens: evalResult.estimatedTotalTokens,
    estimatedCostUsd: evalResult.estimatedPipelineCostUsd ?? evalResult.estimatedCostUsd,
    actualInputTokens: null,
    actualOutputTokens: null,
    actualCostUsd: null,
    model: evalResult.model,
    provider: evalResult.provider,
    attemptCount: 0,
    maxAttempts: cfg.maxAttempts,
    reservedAt: status === 'RESERVED' ? now : null,
    startedAt: null,
    completedAt: null,
    blockedReason: evalResult.blockedReason,
    failureReason: null,
    editorialNewsId: null,
    outputTarget: EDITORIAL_OUTPUT_TARGET,
    selectedSourceCount: evalResult.selectedSourceCount,
    createdAt: now,
    updatedAt: now,
  }
}

export async function persistShadow(store: AiDispatchStore, evalResult: EvaluationResult, cluster: NewsClusterRecord) {
  await store.upsertShadow({
    clusterId: evalResult.clusterId,
    eventKey: evalResult.eventKey,
    canonicalTitle: cluster.canonicalTitle || cluster.normalizedTopic,
    eligibility: cluster.aiEligibility,
    wouldDispatch: evalResult.wouldDispatchIfEnabled,
    blockedReason: evalResult.blockedReason,
    dispatchType: evalResult.dispatchType,
    estimatedInputTokens: evalResult.estimatedInputTokens,
    estimatedOutputTokens: evalResult.estimatedOutputTokens,
    estimatedTotalTokens: evalResult.estimatedTotalTokens,
    estimatedCostUsd: evalResult.estimatedCostUsd,
    estimatedPipelineTokens: evalResult.estimatedPipelineTokens,
    estimatedPipelineCostUsd: evalResult.estimatedPipelineCostUsd,
    selectedSourceCount: evalResult.selectedSourceCount,
    selectedSourceNames: evalResult.selectedSourceNames,
    importanceScore: cluster.importanceScore,
    localImportance: cluster.localImportance,
    nationalImportance: cluster.nationalImportance,
    globalImportance: cluster.globalImportance,
    geographicScope: evalResult.isLocalProtected ? 'CITY' : null,
    isLocalProtected: evalResult.isLocalProtected,
    evaluatedAt: new Date(),
  })
}

/**
 * Phase 4A default provider: NEVER talks to DeepSeek.
 */
export const unwiredCrawlerAiProvider: CrawlerAiProvider = {
  async chat() {
    return { called: false, errorCode: 'phase4a_provider_not_wired' }
  },
}

export async function settleJobBudget(
  store: AiDispatchStore,
  reservedUsd: number,
  actualUsd: number,
  now = new Date()
) {
  const keys = periodKeys(now)
  const hour = await store.getBudgetWindow('crawler_automatic', 'hour', keys.hour)
  const day = await store.getBudgetWindow('crawler_automatic', 'day', keys.day)
  await store.saveBudgetWindow(settleReservation(hour, reservedUsd, actualUsd))
  await store.saveBudgetWindow(settleReservation(day, reservedUsd, actualUsd))
}

export async function executeReservedJob(opts: {
  store: AiDispatchStore
  job: CrawlerAiJobRecord
  evalResult: EvaluationResult
  provider?: CrawlerAiProvider
}): Promise<{ providerCalls: number }> {
  const enabled = isCrawlerAiDispatchEnabled()
  const cfg = crawlerAiDispatchConfig()
  const provider = opts.provider ?? unwiredCrawlerAiProvider
  if (!enabled || cfg.dryRun || !opts.evalResult.pack) {
    return { providerCalls: 0 }
  }
  if (opts.job.outputTarget !== EDITORIAL_OUTPUT_TARGET) {
    await opts.store.updateJob(opts.job.id, {
      status: 'FAILED',
      failureReason: 'output_target_must_be_editorial_draft',
    })
    return { providerCalls: 0 }
  }

  let circuit = await opts.store.getCircuit(cfg.provider)
  if (circuit.state === 'OPEN') {
    await opts.store.updateJob(opts.job.id, { status: 'BLOCKED', blockedReason: 'PROVIDER_CIRCUIT_OPEN' })
    if (opts.job.estimatedCostUsd) {
      await settleJobBudget(opts.store, opts.job.estimatedCostUsd, 0)
    }
    return { providerCalls: 0 }
  }

  await opts.store.updateJob(opts.job.id, { status: 'PROCESSING', startedAt: new Date() })
  let attempts = opts.job.attemptCount
  let last: Awaited<ReturnType<CrawlerAiProvider['chat']>> = { called: false }
  while (attempts < opts.job.maxAttempts) {
    attempts += 1
    last = await provider.chat({ pack: opts.evalResult.pack, job: opts.job })
    if (!last.called) {
      await opts.store.updateJob(opts.job.id, {
        status: 'BLOCKED',
        attemptCount: attempts,
        failureReason: last.errorCode || 'phase4a_provider_not_wired',
      })
      if (opts.job.estimatedCostUsd) await settleJobBudget(opts.store, opts.job.estimatedCostUsd, 0)
      return { providerCalls: 0 }
    }
    const status = last.statusCode ?? 0
    circuit = applyProviderStatus(circuit, status)
    await opts.store.saveCircuit(circuit)
    if (status === 402 || status === 401) {
      await opts.store.updateJob(opts.job.id, {
        status: 'FAILED',
        attemptCount: attempts,
        failureReason: status === 402 ? 'insufficient_balance' : 'authentication_failure',
        blockedReason: 'PROVIDER_CIRCUIT_OPEN',
        completedAt: new Date(),
      })
      if (opts.job.estimatedCostUsd) await settleJobBudget(opts.store, opts.job.estimatedCostUsd, 0)
      return { providerCalls: 1 }
    }
    if (status >= 200 && status < 300) {
      const actualCost = 0
      await opts.store.updateJob(opts.job.id, {
        status: 'COMPLETED',
        attemptCount: attempts,
        actualInputTokens: last.inputTokens ?? null,
        actualOutputTokens: last.outputTokens ?? null,
        actualCostUsd: actualCost,
        completedAt: new Date(),
      })
      if (opts.job.estimatedCostUsd) {
        await settleJobBudget(opts.store, opts.job.estimatedCostUsd, actualCost)
      }
      return { providerCalls: 1 }
    }
    if (!shouldRetryProviderStatus(status) || attempts >= opts.job.maxAttempts) {
      await opts.store.updateJob(opts.job.id, {
        status: 'FAILED',
        attemptCount: attempts,
        failureReason: `http_${status}`,
        completedAt: new Date(),
      })
      if (opts.job.estimatedCostUsd) await settleJobBudget(opts.store, opts.job.estimatedCostUsd, 0)
      return { providerCalls: attempts }
    }
  }
  void last
  return { providerCalls: attempts }
}

export type AiDispatchTickResult = {
  evaluated: number
  wouldDispatch: number
  blocked: number
  watching: number
  jobsCreated: number
  providerCalls: number
  reservations: number
}

export async function runAiDispatchSafetyTick(opts: {
  crawlerStore: CrawlerStore
  dispatchStore?: AiDispatchStore
  now?: Date
  clusters?: NewsClusterRecord[]
  provider?: CrawlerAiProvider
}): Promise<AiDispatchTickResult> {
  const now = opts.now ?? new Date()
  const cfg = crawlerAiDispatchConfig()
  const store = opts.dispatchStore ?? memoryFallback
  const result: AiDispatchTickResult = {
    evaluated: 0,
    wouldDispatch: 0,
    blocked: 0,
    watching: 0,
    jobsCreated: 0,
    providerCalls: 0,
    reservations: 0,
  }

  try {
    const clusters =
      opts.clusters ??
      (await opts.crawlerStore.listClusters({
        since: new Date(now.getTime() - 72 * 3600 * 1000),
        limit: 80,
      }))
    const ranked = [...clusters].sort((a, b) => {
      const ea = a.aiEligibility === 'HIGH_PRIORITY' ? 2 : a.aiEligibility === 'ELIGIBLE' ? 1 : 0
      const eb = b.aiEligibility === 'HIGH_PRIORITY' ? 2 : b.aiEligibility === 'ELIGIBLE' ? 1 : 0
      if (eb !== ea) return eb - ea
      return b.importanceScore - a.importanceScore
    })

    const keys = periodKeys(now)
    let hour = await store.getBudgetWindow('crawler_automatic', 'hour', keys.hour)
    let day = await store.getBudgetWindow('crawler_automatic', 'day', keys.day)
    const circuit = await store.getCircuit(cfg.provider)
    let consideredForDispatch = 0

    for (const cluster of ranked) {
      if (cluster.aiEligibility === 'WATCHING') result.watching += 1
      const members = await membersFor(opts.crawlerStore, cluster.id)
      const existing = await store.getInitialJob(cluster.id)
      const evalResult = evaluateDispatchCandidate(
        {
          cluster: clusterToEval(cluster),
          members,
          existingInitialJob: existing,
          circuitOpen: circuit.state === 'OPEN',
          now,
          executeMaterialUpdate: false,
        },
        { hour, day },
        await store.countActiveJobs()
      )
      result.evaluated += 1
      await persistShadow(store, evalResult, cluster)

      if (evalResult.wouldDispatchIfEnabled) result.wouldDispatch += 1
      if (evalResult.blockedReason && evalResult.blockedReason !== 'DISPATCH_DISABLED' && evalResult.blockedReason !== 'DRY_RUN') {
        result.blocked += 1
      }

      const mayCreateJob = isCrawlerAiDispatchEnabled() && !cfg.dryRun && evalResult.wouldDispatch
      if (!mayCreateJob) continue
      if (consideredForDispatch >= cfg.maxEventsPerTick) continue
      consideredForDispatch += 1

      const costUsd = evalResult.reservationUsd ?? 0
      const reserved = tryReserveBudget({
        hour,
        day,
        costUsd,
        concurrentJobs: await store.countActiveJobs(),
      })
      if (!reserved.ok) continue
      const ok = await store.compareAndReserve({
        lane: 'crawler_automatic',
        hour,
        day,
        nextHour: reserved.hour,
        nextDay: reserved.day,
      })
      if (!ok) continue
      hour = reserved.hour
      day = reserved.day
      result.reservations += 1
      const job = jobFromEval(evalResult, 'RESERVED')
      const inserted = await store.insertJob(job)
      if (inserted === 'duplicate') {
        await store.saveBudgetWindow({ ...hour, reservedUsd: Math.max(0, hour.reservedUsd - costUsd), requestCount: Math.max(0, hour.requestCount - 1) })
        await store.saveBudgetWindow({ ...day, reservedUsd: Math.max(0, day.reservedUsd - costUsd), requestCount: Math.max(0, day.requestCount - 1) })
        continue
      }
      result.jobsCreated += 1
      await store.insertLedger({
        provider: cfg.provider,
        model: cfg.model,
        lane: 'crawler_automatic',
        jobId: job.id,
        clusterId: cluster.id,
        requestType: 'INITIAL',
        inputTokens: evalResult.estimatedInputTokens,
        outputTokens: evalResult.estimatedOutputTokens,
        estimatedCostUsd: costUsd,
        actualCostUsd: null,
        status: 'RESERVED',
      })
      const exec = await executeReservedJob({
        store,
        job,
        evalResult,
        provider: opts.provider ?? unwiredCrawlerAiProvider,
      })
      result.providerCalls += exec.providerCalls
    }
  } catch (err) {
    logCrawler(
      { stage: 'ai_dispatch_tick', errorCode: 'ai_dispatch_tick_error' },
      { message: err instanceof Error ? err.message : 'unknown' }
    )
  }

  return result
}

export async function recordManualEditorLedger(
  store: AiDispatchStore,
  input: { model?: string; inputTokens?: number; outputTokens?: number; actualCostUsd?: number | null }
) {
  await store.insertLedger({
    provider: 'deepseek',
    model: input.model ?? null,
    lane: 'manual_editor',
    jobId: null,
    clusterId: null,
    requestType: 'MANUAL',
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    estimatedCostUsd: input.actualCostUsd ?? null,
    actualCostUsd: input.actualCostUsd ?? null,
    status: 'COMPLETED',
  })
}

export function emptyBudgetWindows(now = new Date()) {
  const keys = periodKeys(now)
  return {
    hour: emptyWindow('crawler_automatic', 'hour', keys.hour),
    day: emptyWindow('crawler_automatic', 'day', keys.day),
  }
}

export function _articleForTest(partial: Partial<RawArticleRecord> & { id: string; sourceId: string }): RawArticleRecord {
  return partial as RawArticleRecord
}
