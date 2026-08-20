/**
 * Phase 4C measurement scaffolding — no paid call.
 * Old multi-stage ~5 DeepSeek requests/event vs canary 1 (max 2 with repair).
 * Phase 4C.2: track $/successful AI_DRAFT, not just $/request.
 */

export const OLD_TYPICAL_REQUESTS_PER_EVENT = 5
export const CANARY_TYPICAL_REQUESTS_PER_EVENT = 1
export const CANARY_MAX_REQUESTS_PER_EVENT = 2

export type CostProjectionRow = {
  eventsPerDay: number
  oldRequests: number
  canaryRequests: number
  oldEstimatedUsd: number | null
  canaryEstimatedUsd: number | null
  savingsUsd: number | null
  pricingKnown: boolean
}

export function projectDailyCost(input: {
  eventsPerDay: number
  costPerRequestUsd: number | null
  oldRequestsPerEvent?: number
  canaryRequestsPerEvent?: number
}): CostProjectionRow {
  const oldReq = input.oldRequestsPerEvent ?? OLD_TYPICAL_REQUESTS_PER_EVENT
  const canaryReq = input.canaryRequestsPerEvent ?? CANARY_TYPICAL_REQUESTS_PER_EVENT
  const oldRequests = input.eventsPerDay * oldReq
  const canaryRequests = input.eventsPerDay * canaryReq
  if (input.costPerRequestUsd == null || !Number.isFinite(input.costPerRequestUsd)) {
    return {
      eventsPerDay: input.eventsPerDay,
      oldRequests,
      canaryRequests,
      oldEstimatedUsd: null,
      canaryEstimatedUsd: null,
      savingsUsd: null,
      pricingKnown: false,
    }
  }
  const oldEstimatedUsd = oldRequests * input.costPerRequestUsd
  const canaryEstimatedUsd = canaryRequests * input.costPerRequestUsd
  return {
    eventsPerDay: input.eventsPerDay,
    oldRequests,
    canaryRequests,
    oldEstimatedUsd,
    canaryEstimatedUsd,
    savingsUsd: oldEstimatedUsd - canaryEstimatedUsd,
    pricingKnown: true,
  }
}

export function projectCostLadder(costPerRequestUsd: number | null): CostProjectionRow[] {
  return [10, 25, 50, 100, 250, 500].map((eventsPerDay) =>
    projectDailyCost({ eventsPerDay, costPerRequestUsd })
  )
}

export function estimateBalanceRunway(input: {
  balanceUsd: number
  costPerEventUsd: number | null
}): {
  balanceUsd: number
  eventsAffordable: number | null
  recommendationTr: string
} {
  if (input.costPerEventUsd == null || input.costPerEventUsd <= 0) {
    return {
      balanceUsd: input.balanceUsd,
      eventsAffordable: null,
      recommendationTr: 'Fiyat bilinmiyor (COST_UNKNOWN) — otomasyon açmayın.',
    }
  }
  const eventsAffordable = Math.floor(input.balanceUsd / input.costPerEventUsd)
  return {
    balanceUsd: input.balanceUsd,
    eventsAffordable,
    recommendationTr:
      eventsAffordable < 20
        ? 'Düşük bakiye — yalnızca manuel tek-olay canary; otomatik dispatch kapalı kalsın.'
        : 'Otomatik dispatch hâlâ kapalı kalmalı; günlük limit önerisi: max(1, floor(bakiye*0.02/olay_maliyeti)).',
  }
}

export type QualityMetricScaffold = {
  originalityHeuristic: 'pending_human_review'
  lengthOk: boolean | null
  schemaOk: boolean | null
  factFlagsCount: number
  autoPublished: false
  successMeansEditorialReady: false
}

export function scaffoldQualityMetrics(input?: {
  lengthOk?: boolean
  schemaOk?: boolean
  factFlagsCount?: number
}): QualityMetricScaffold {
  return {
    originalityHeuristic: 'pending_human_review',
    lengthOk: input?.lengthOk ?? null,
    schemaOk: input?.schemaOk ?? null,
    factFlagsCount: input?.factFlagsCount ?? 0,
    autoPublished: false,
    successMeansEditorialReady: false,
  }
}

/** Future automation limits — recommendation ONLY; do not enable dispatch. */
export function recommendAutomationLimits(costPerEventUsd: number | null): {
  enableDispatch: false
  maxEventsPerDay: number
  concurrency: 1
  noteTr: string
} {
  const maxEventsPerDay =
    costPerEventUsd && costPerEventUsd > 0 ? Math.max(1, Math.min(20, Math.floor(0.5 / costPerEventUsd))) : 1
  return {
    enableDispatch: false,
    maxEventsPerDay,
    concurrency: 1,
    noteTr: 'Öneri yalnızca. CRAWLER_AI_DISPATCH_ENABLED=false kalsın.',
  }
}

/** Phase 4C.2 efficiency counters — process-local; never invent $0. */
export type CanaryEfficiencyCounters = {
  providerRequests: number
  successfulDrafts: number
  failedDrafts: number
  repairRequests: number
  /** Sum of known actual costs only; null entries skipped (COST_UNKNOWN semantics). */
  knownCostUsdSum: number
  knownCostSamples: number
}

const efficiency: CanaryEfficiencyCounters = {
  providerRequests: 0,
  successfulDrafts: 0,
  failedDrafts: 0,
  repairRequests: 0,
  knownCostUsdSum: 0,
  knownCostSamples: 0,
}

export function resetCanaryEfficiencyCounters(): void {
  efficiency.providerRequests = 0
  efficiency.successfulDrafts = 0
  efficiency.failedDrafts = 0
  efficiency.repairRequests = 0
  efficiency.knownCostUsdSum = 0
  efficiency.knownCostSamples = 0
}

export function recordCanaryAttempt(input: {
  providerRequests: number
  successful: boolean
  repairRequests?: number
  actualCostUsd?: number | null
}): void {
  efficiency.providerRequests += Math.max(0, input.providerRequests)
  efficiency.repairRequests += Math.max(0, input.repairRequests ?? 0)
  if (input.successful) efficiency.successfulDrafts += 1
  else efficiency.failedDrafts += 1
  if (input.actualCostUsd != null && Number.isFinite(input.actualCostUsd)) {
    efficiency.knownCostUsdSum += input.actualCostUsd
    efficiency.knownCostSamples += 1
  }
}

export type CanaryEfficiencySnapshot = CanaryEfficiencyCounters & {
  requestsPerSuccessfulDraft: number | null
  costPerSuccessfulDraft: number | null
  repairRate: number | null
  firstPassSuccessRate: number | null
  /** True when cost metrics are unknown (no samples) — never fake $0. */
  costUnknown: boolean
}

export function getCanaryEfficiencySnapshot(
  counters: CanaryEfficiencyCounters = efficiency
): CanaryEfficiencySnapshot {
  const attempts = counters.successfulDrafts + counters.failedDrafts
  const requestsPerSuccessfulDraft =
    counters.successfulDrafts > 0 ? counters.providerRequests / counters.successfulDrafts : null
  const costPerSuccessfulDraft =
    counters.successfulDrafts > 0 && counters.knownCostSamples > 0
      ? counters.knownCostUsdSum / counters.successfulDrafts
      : null
  const repairRate = attempts > 0 ? counters.repairRequests / attempts : null
  const firstPassSuccessRate =
    attempts > 0
      ? Math.max(0, counters.successfulDrafts - Math.min(counters.repairRequests, counters.successfulDrafts)) /
        attempts
      : null

  return {
    ...counters,
    requestsPerSuccessfulDraft,
    costPerSuccessfulDraft,
    repairRate,
    firstPassSuccessRate,
    costUnknown: counters.knownCostSamples === 0,
  }
}

export function computeEfficiencyFromTotals(input: {
  providerRequests: number
  successfulDrafts: number
  failedDrafts: number
  repairRequests: number
  knownCostUsdSum?: number | null
  knownCostSamples?: number
}): CanaryEfficiencySnapshot {
  return getCanaryEfficiencySnapshot({
    providerRequests: input.providerRequests,
    successfulDrafts: input.successfulDrafts,
    failedDrafts: input.failedDrafts,
    repairRequests: input.repairRequests,
    knownCostUsdSum: input.knownCostUsdSum ?? 0,
    knownCostSamples: input.knownCostSamples ?? (input.knownCostUsdSum != null ? 1 : 0),
  })
}
