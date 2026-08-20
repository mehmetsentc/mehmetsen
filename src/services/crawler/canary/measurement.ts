/**
 * Phase 4C measurement scaffolding — no paid call.
 * Old multi-stage ~5 DeepSeek requests/event vs canary 1 (max 2 with repair).
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
