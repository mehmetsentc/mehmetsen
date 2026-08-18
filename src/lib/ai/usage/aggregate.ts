import { turkeyDayBounds, turkeyYmd, turkeyYmdNow, addTurkeyDays } from '@/lib/turkeyCalendar'
import { estimateUsageCost, getDeepSeekPricing } from '@/lib/ai/usage/pricing'
import {
  countDuplicateStage1Calls,
  measureStage1CostAnalysis,
  measureStage1RetryOptimizationCanary,
  measureStage3ClassifierOverlap,
  measureStage3CompactCanary,
  providerFailureRate,
} from '@/lib/ai/usage/pipelineCostSignals'

export type AiUsageRange = 'today' | '7d' | '30d'

export type LooseAiUsageEvent = Record<string, unknown>

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function eventTimeMs(event: LooseAiUsageEvent): number | undefined {
  return asFiniteNumber(event.createdAt) ?? asFiniteNumber(event.timestamp)
}

function hasTokenTelemetry(event: LooseAiUsageEvent): boolean {
  return (
    asFiniteNumber(event.inputTokens) !== undefined ||
    asFiniteNumber(event.outputTokens) !== undefined ||
    asFiniteNumber(event.totalTokens) !== undefined ||
    asFiniteNumber(event.cacheHitTokens) !== undefined ||
    asFiniteNumber(event.cacheMissTokens) !== undefined
  )
}

export function resolveAiUsageRange(
  raw: string | null | undefined,
  nowMs = Date.now()
): { range: AiUsageRange; startMs: number; endMs: number; timezone: 'Europe/Istanbul' } {
  const range: AiUsageRange = raw === '7d' || raw === '30d' ? raw : 'today'
  const today = turkeyYmdNow(nowMs)
  const todayBounds = turkeyDayBounds(today)
  if (range === 'today') {
    return { range, startMs: todayBounds.startMs, endMs: todayBounds.endMs, timezone: 'Europe/Istanbul' }
  }
  const days = range === '7d' ? 6 : 29
  const startYmd = addTurkeyDays(today, -days)
  return {
    range,
    startMs: turkeyDayBounds(startYmd).startMs,
    endMs: todayBounds.endMs,
    timezone: 'Europe/Istanbul',
  }
}

type Bucket = {
  key: string
  requests: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheHitTokens: number
  cacheMissTokens: number
  retries: number
  errors: number
  latencySum: number
  latencyCount: number
  estimatedCostUsd: number
  costCount: number
}

function emptyBucket(key: string): Bucket {
  return {
    key,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    retries: 0,
    errors: 0,
    latencySum: 0,
    latencyCount: 0,
    estimatedCostUsd: 0,
    costCount: 0,
  }
}

function addToBucket(bucket: Bucket, event: LooseAiUsageEvent) {
  bucket.requests += 1
  bucket.inputTokens += asFiniteNumber(event.inputTokens) ?? 0
  bucket.outputTokens += asFiniteNumber(event.outputTokens) ?? 0
  bucket.totalTokens += asFiniteNumber(event.totalTokens) ?? 0
  bucket.cacheHitTokens += asFiniteNumber(event.cacheHitTokens) ?? 0
  bucket.cacheMissTokens += asFiniteNumber(event.cacheMissTokens) ?? 0
  const attempt = asFiniteNumber(event.attempt)
  const retryCount = asFiniteNumber(event.retryCount)
  if ((attempt != null && attempt > 1) || (retryCount != null && retryCount > 0)) bucket.retries += 1
  if (event.success === false) bucket.errors += 1
  const latency = asFiniteNumber(event.latencyMs)
  if (latency != null) {
    bucket.latencySum += latency
    bucket.latencyCount += 1
  }
  const cost = asFiniteNumber(event.estimatedTotalCostUsd)
  if (cost != null) {
    bucket.estimatedCostUsd += cost
    bucket.costCount += 1
  }
}

function costOrNull(bucket: Bucket): number | null {
  return bucket.costCount > 0 ? bucket.estimatedCostUsd : null
}

export type AiUsageAggregate = {
  range: AiUsageRange
  timezone: 'Europe/Istanbul'
  startMs: number
  endMs: number
  scanned: number
  totalInRange: number | null
  truncated: boolean
  requests: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheHitTokens: number
  cacheMissTokens: number
  cacheHitRate: number | null
  estimatedCostUsd: number | null
  failures: number
  retries: number
  usageCoverage: number | null
  tokenTelemetryBeganAt: number | null
  perPublished: {
    available: boolean
    message?: string
    attributedArticles?: number
    calls?: number
    tokens?: number
    estimatedCostUsd?: number | null
  }
  agents: Array<{
    agent: string
    requests: number
    input: number
    output: number
    total: number
    retry: number
    error: number
    estimatedCostUsd: number | null
  }>
  models: Array<{
    provider: string
    model: string
    requests: number
    input: number
    output: number
    cacheHit: number
    estimatedCostUsd: number | null
  }>
  operations: Array<{
    operation: string
    requests: number
    avgInput: number | null
    avgOutput: number | null
    avgLatencyMs: number | null
    errorRate: number | null
    estimatedCostUsd: number | null
  }>
  retriesByAgent: Array<{
    agent: string
    firstAttempts: number
    retries: number
    retryRate: number | null
  }>
  daily: Array<{
    date: string
    requests: number
    tokens: number
    estimatedCostUsd: number | null
  }>
  topTokenAgents: Array<{ agent: string; totalTokens: number; requests: number }>
  topCostOperations: Array<{ operation: string; estimatedCostUsd: number | null; totalTokens: number; requests: number }>
  repeatedInputs: Array<{ inputHash: string; operation: string; calls: number }>
  providers: Array<{
    provider: string
    requests: number
    input: number
    output: number
    total: number
    error: number
  }>
  savings: {
    cheapSuccessRequests: number
    deepseekRequests: number
    deepseekFallbackRequests: number
    cheapSuccessRate: number | null
    fallbackRate: number | null
    estimatedDeepSeekCallsAvoided: number
    estimatedSavingsUsd: number | null
  }
  deepseekDrivers: Array<{
    agent: string
    requests: number
    input: number
    output: number
    total: number
    pctOfDeepSeek: number | null
    avgTokens: number | null
  }>
  potentialSavings: Array<{
    agent: string
    currentTotal: number
    p10: number
    p25: number
    p50: number
    p75: number
  }>
  duplicateStage1Calls: { groups: number; extraCalls: number }
  stage3ClassifierOverlap: {
    both: number
    stage3Only: number
    classifierOnly: number
    compared: number
    exactAgreement: number
    agreementRate: number | null
  }
  geminiFailureRate: number | null
  groqFailureRate: number | null
  geminiErrors: Record<string, number>
  groqErrors: Record<string, number>
  stage3CompactCanary: ReturnType<typeof measureStage3CompactCanary>
  stage1CostAnalysis: ReturnType<typeof measureStage1CostAnalysis>
  stage1RetryOptimizationCanary: ReturnType<typeof measureStage1RetryOptimizationCanary>
}

export function aggregateAiUsageEvents(
  events: LooseAiUsageEvent[],
  opts: {
    range: AiUsageRange
    startMs: number
    endMs: number
    timezone?: 'Europe/Istanbul'
    scanned?: number
    totalInRange?: number | null
    truncated?: boolean
  }
): AiUsageAggregate {
  const scanned = opts.scanned ?? events.length
  let requests = 0
  let inputTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  let cacheHitTokens = 0
  let cacheMissTokens = 0
  let failures = 0
  let retries = 0
  let tokenEvents = 0
  let costSum = 0
  let costCount = 0
  let tokenTelemetryBeganAt: number | null = null
  const newsIds = new Set<string>()
  let eventsWithNewsId = 0
  let cheapRequests = 0
  let cheapSuccess = 0
  let cheapSuccessInput = 0
  let cheapSuccessOutput = 0
  let deepseekRequests = 0
  let deepseekFallbackRequests = 0
  const CHEAP = new Set(['groq', 'gemini', 'openrouter'])

  const agents = new Map<string, Bucket>()
  const models = new Map<string, Bucket>()
  const operations = new Map<string, Bucket>()
  const providers = new Map<string, Bucket>()
  const deepseekByAgent = new Map<string, Bucket>()
  const retryAgents = new Map<string, { firstAttempts: number; retries: number }>()
  const daily = new Map<string, Bucket>()
  const repeated = new Map<string, { inputHash: string; operation: string; calls: number }>()

  for (const event of events) {
    requests += 1
    inputTokens += asFiniteNumber(event.inputTokens) ?? 0
    outputTokens += asFiniteNumber(event.outputTokens) ?? 0
    totalTokens += asFiniteNumber(event.totalTokens) ?? 0
    cacheHitTokens += asFiniteNumber(event.cacheHitTokens) ?? 0
    cacheMissTokens += asFiniteNumber(event.cacheMissTokens) ?? 0
    if (event.success === false) failures += 1
    const attempt = asFiniteNumber(event.attempt)
    const retryCount = asFiniteNumber(event.retryCount)
    const isRetry = (attempt != null && attempt > 1) || (retryCount != null && retryCount > 0)
    if (isRetry) retries += 1
    if (hasTokenTelemetry(event)) {
      tokenEvents += 1
      const t = eventTimeMs(event)
      if (t != null && (tokenTelemetryBeganAt == null || t < tokenTelemetryBeganAt)) {
        tokenTelemetryBeganAt = t
      }
    }
    const cost = asFiniteNumber(event.estimatedTotalCostUsd)
    if (cost != null) {
      costSum += cost
      costCount += 1
    }
    const newsId = asString(event.newsId)
    if (newsId) {
      newsIds.add(newsId)
      eventsWithNewsId += 1
    }

    const agent = asString(event.agentName) ?? 'unknown'
    const operation = asString(event.operation) ?? 'unknown'
    const provider = asString(event.provider) ?? 'unknown'
    const model = asString(event.model) ?? 'unknown'
    const modelKey = `${provider}::${model}`
    if (CHEAP.has(provider)) {
      cheapRequests += 1
      if (event.success === true) {
        cheapSuccess += 1
        cheapSuccessInput += asFiniteNumber(event.inputTokens) ?? 0
        cheapSuccessOutput += asFiniteNumber(event.outputTokens) ?? 0
      }
    }
    if (provider === 'deepseek') {
      deepseekRequests += 1
      addToBucket(
        deepseekByAgent.get(agent) ?? deepseekByAgent.set(agent, emptyBucket(agent)).get(agent)!,
        event
      )
      const attemptN = asFiniteNumber(event.attempt)
      if (
        (attemptN != null && attemptN > 1) ||
        asString(event.fallbackFrom) ||
        asString(event.fallbackReason)
      ) {
        deepseekFallbackRequests += 1
      }
    }

    addToBucket(agents.get(agent) ?? agents.set(agent, emptyBucket(agent)).get(agent)!, event)
    addToBucket(models.get(modelKey) ?? models.set(modelKey, emptyBucket(modelKey)).get(modelKey)!, event)
    addToBucket(providers.get(provider) ?? providers.set(provider, emptyBucket(provider)).get(provider)!, event)
    addToBucket(
      operations.get(operation) ?? operations.set(operation, emptyBucket(operation)).get(operation)!,
      event
    )

    const retryRow = retryAgents.get(agent) ?? { firstAttempts: 0, retries: 0 }
    if (attempt == null || attempt <= 1) retryRow.firstAttempts += 1
    else retryRow.retries += 1
    retryAgents.set(agent, retryRow)

    const t = eventTimeMs(event)
    if (t != null) {
      const date = turkeyYmd(t)
      addToBucket(daily.get(date) ?? daily.set(date, emptyBucket(date)).get(date)!, event)
    }

    const inputHash = asString(event.inputHash)
    if (inputHash) {
      const key = `${inputHash}::${operation}`
      const row = repeated.get(key) ?? { inputHash, operation, calls: 0 }
      row.calls += 1
      repeated.set(key, row)
    }
  }

  const cacheDenom = cacheHitTokens + cacheMissTokens
  const cacheHitRate = cacheDenom > 0 ? cacheHitTokens / cacheDenom : null
  const estimatedCostUsd = costCount > 0 ? costSum : null
  const usageCoverage = requests > 0 ? tokenEvents / requests : null

  const attributionReady =
    newsIds.size >= 3 && requests > 0 && eventsWithNewsId / requests >= 0.4
  const perPublished = attributionReady
    ? {
        available: true,
        attributedArticles: newsIds.size,
        calls: requests / newsIds.size,
        tokens: totalTokens / newsIds.size,
        estimatedCostUsd: estimatedCostUsd == null ? null : estimatedCostUsd / newsIds.size,
      }
    : {
        available: false,
        message: 'Yeterli attribution verisi yok',
      }

  const agentRows = [...agents.values()]
    .map((b) => ({
      agent: b.key,
      requests: b.requests,
      input: b.inputTokens,
      output: b.outputTokens,
      total: b.totalTokens,
      retry: b.retries,
      error: b.errors,
      estimatedCostUsd: costOrNull(b),
    }))
    .sort((a, b) => (b.estimatedCostUsd ?? -1) - (a.estimatedCostUsd ?? -1) || b.total - a.total)

  return {
    range: opts.range,
    timezone: opts.timezone ?? 'Europe/Istanbul',
    startMs: opts.startMs,
    endMs: opts.endMs,
    scanned,
    totalInRange: opts.totalInRange ?? null,
    truncated: Boolean(opts.truncated),
    requests,
    inputTokens,
    outputTokens,
    totalTokens,
    cacheHitTokens,
    cacheMissTokens,
    cacheHitRate,
    estimatedCostUsd,
    failures,
    retries,
    usageCoverage,
    tokenTelemetryBeganAt,
    perPublished,
    agents: agentRows,
    models: [...models.values()]
      .map((b) => {
        const [provider, ...rest] = b.key.split('::')
        return {
          provider: provider || 'unknown',
          model: rest.join('::') || 'unknown',
          requests: b.requests,
          input: b.inputTokens,
          output: b.outputTokens,
          cacheHit: b.cacheHitTokens,
          estimatedCostUsd: costOrNull(b),
        }
      })
      .sort((a, b) => (b.estimatedCostUsd ?? -1) - (a.estimatedCostUsd ?? -1) || b.input + b.output - (a.input + a.output)),
    operations: [...operations.values()]
      .map((b) => ({
        operation: b.key,
        requests: b.requests,
        avgInput: b.requests > 0 ? b.inputTokens / b.requests : null,
        avgOutput: b.requests > 0 ? b.outputTokens / b.requests : null,
        avgLatencyMs: b.latencyCount > 0 ? b.latencySum / b.latencyCount : null,
        errorRate: b.requests > 0 ? b.errors / b.requests : null,
        estimatedCostUsd: costOrNull(b),
      }))
      .sort((a, b) => (b.estimatedCostUsd ?? -1) - (a.estimatedCostUsd ?? -1) || b.requests - a.requests),
    retriesByAgent: [...retryAgents.entries()]
      .map(([agent, row]) => ({
        agent,
        firstAttempts: row.firstAttempts,
        retries: row.retries,
        retryRate: row.firstAttempts > 0 ? row.retries / row.firstAttempts : null,
      }))
      .sort((a, b) => (b.retryRate ?? -1) - (a.retryRate ?? -1)),
    daily: [...daily.values()]
      .map((b) => ({
        date: b.key,
        requests: b.requests,
        tokens: b.totalTokens,
        estimatedCostUsd: costOrNull(b),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    topTokenAgents: [...agentRows]
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
      .map((a) => ({
        agent: a.agent,
        totalTokens: a.total,
        requests: a.requests,
      })),
    topCostOperations: [...operations.values()]
      .map((b) => ({
        operation: b.key,
        estimatedCostUsd: costOrNull(b),
        totalTokens: b.totalTokens,
        requests: b.requests,
      }))
      .sort((a, b) => (b.estimatedCostUsd ?? -1) - (a.estimatedCostUsd ?? -1) || b.totalTokens - a.totalTokens)
      .slice(0, 8),
    repeatedInputs: [...repeated.values()]
      .filter((row) => row.calls >= 2)
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 20),
    providers: [...providers.values()]
      .map((b) => ({
        provider: b.key,
        requests: b.requests,
        input: b.inputTokens,
        output: b.outputTokens,
        total: b.totalTokens,
        error: b.errors,
      }))
      .sort((a, b) => b.total - a.total || b.requests - a.requests),
    savings: {
      cheapSuccessRequests: cheapSuccess,
      deepseekRequests,
      deepseekFallbackRequests,
      cheapSuccessRate: cheapRequests > 0 ? cheapSuccess / cheapRequests : null,
      fallbackRate: requests > 0 ? deepseekFallbackRequests / requests : null,
      estimatedDeepSeekCallsAvoided: cheapSuccess,
      estimatedSavingsUsd: (() => {
        const priced = estimateUsageCost(
          { inputTokens: cheapSuccessInput, outputTokens: cheapSuccessOutput },
          getDeepSeekPricing('deepseek-v4-flash')
        )
        return priced.estimatedTotalCostUsd ?? null
      })(),
    },
    deepseekDrivers: (() => {
      const dsTotal = [...deepseekByAgent.values()].reduce((s, b) => s + b.totalTokens, 0)
      return [...deepseekByAgent.values()]
        .map((b) => ({
          agent: b.key,
          requests: b.requests,
          input: b.inputTokens,
          output: b.outputTokens,
          total: b.totalTokens,
          pctOfDeepSeek: dsTotal > 0 ? b.totalTokens / dsTotal : null,
          avgTokens: b.requests > 0 ? b.totalTokens / b.requests : null,
        }))
        .sort((a, b) => b.total - a.total)
    })(),
    potentialSavings: (() => {
      const majors = ['stage1_writer', 'stage3_category', 'chief_editor', 'category_classifier']
      return majors
        .map((agent) => {
          const b = deepseekByAgent.get(agent)
          const currentTotal = b?.totalTokens ?? 0
          return {
            agent,
            currentTotal,
            p10: Math.round(currentTotal * 0.1),
            p25: Math.round(currentTotal * 0.25),
            p50: Math.round(currentTotal * 0.5),
            p75: Math.round(currentTotal * 0.75),
          }
        })
        .filter((row) => row.currentTotal > 0)
    })(),
    duplicateStage1Calls: countDuplicateStage1Calls(events),
    stage3ClassifierOverlap: measureStage3ClassifierOverlap(events),
    geminiFailureRate: providerFailureRate(events, 'gemini').rate,
    groqFailureRate: providerFailureRate(events, 'groq').rate,
    geminiErrors: providerFailureRate(events, 'gemini').byCode,
    groqErrors: providerFailureRate(events, 'groq').byCode,
    stage3CompactCanary: measureStage3CompactCanary(events),
    stage1CostAnalysis: (() => {
      const analysis = measureStage1CostAnalysis(events)
      const price = (tokens: number) => {
        const priced = estimateUsageCost(
          { inputTokens: tokens, outputTokens: 0, totalTokens: tokens },
          getDeepSeekPricing('deepseek-v4-flash')
        )
        return priced.estimatedTotalCostUsd ?? null
      }
      analysis.projectedSavings.p10.usd = price(analysis.projectedSavings.p10.tokens)
      analysis.projectedSavings.p25.usd = price(analysis.projectedSavings.p25.tokens)
      analysis.projectedSavings.p50.usd = price(analysis.projectedSavings.p50.tokens)
      analysis.projectedSavings.p100.usd = price(analysis.projectedSavings.p100.tokens)
      return analysis
    })(),
    stage1RetryOptimizationCanary: measureStage1RetryOptimizationCanary(events),
  }
}

export const AI_USAGE_EVENT_SELECT_FIELDS = [
  'createdAt',
  'timestamp',
  'agentName',
  'operation',
  'provider',
  'model',
  'inputTokens',
  'outputTokens',
  'totalTokens',
  'cacheHitTokens',
  'cacheMissTokens',
  'latencyMs',
  'retryCount',
  'attempt',
  'success',
  'statusCode',
  'errorCode',
  'estimatedTotalCostUsd',
  'inputHash',
  'schemaVersion',
  'newsId',
  'queueId',
  'sourceItemId',
  'traceId',
  'routeId',
  'taskType',
  'fallbackFrom',
  'fallbackReason',
  'providerRank',
  'canaryBucket',
  'generationReason',
  'resultCategoryId',
  'schemaValid',
  'outputChars',
  'requiredFieldsPresent',
  'promptVariant',
  'stage3CanaryBucket',
  'promptSystemTokens',
  'promptSourceTokens',
  'promptInstructionTokens',
  'promptOtherTokens',
  'shadowProvider',
  'shadowModel',
  'shadowSuccess',
  'shadowInputTokens',
  'shadowOutputTokens',
  'shadowLatencyMs',
  'productionInputTokens',
  'productionOutputTokens',
  'stage1CallsPerNews',
  'retryTriggers',
  'outputWordCount',
  'gateDecision',
  'publishScore',
  'categoryConfidence',
] as const
