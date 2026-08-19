import type { AiBlockReason, EvaluateContext, EventAiPack } from './types'
import { crawlerAiDispatchConfig } from './flags'
import { isCrawlerAiDispatchEnabled } from '../dispatch'
import { buildEventAiPack } from './pack'
import { fitPackToTokenCeiling } from './tokens'
import { estimateDispatchCost, reservationUsd } from './cost'
import { isLocalProtectedEvent, dispatchPriorityScore } from './priority'
import { pipelineTokenBounds } from './pipelineAudit'
import { usableBody } from './sourceSelect'
import { tryReserveBudget, type BudgetSnapshot } from './budget'

export type EvaluationResult = {
  clusterId: string
  eventKey: string | null
  dispatchType: 'INITIAL' | 'MATERIAL_UPDATE' | 'MANUAL'
  eligibleAuto: boolean
  wouldDispatch: boolean
  wouldDispatchIfEnabled: boolean
  blockedReason: AiBlockReason | null
  technicalBlockReason: AiBlockReason | null
  pack: EventAiPack | null
  selectedSourceNames: string[]
  selectedSourceCount: number
  estimatedInputTokens: number | null
  estimatedOutputTokens: number | null
  estimatedTotalTokens: number | null
  estimatedCostUsd: number | null
  estimatedPipelineTokens: number | null
  estimatedPipelineCostUsd: number | null
  reservationUsd: number | null
  priority: number
  isLocalProtected: boolean
  provider: string
  model: string
}

function extraEligibility(ctx: EvaluateContext): AiBlockReason | null {
  const { cluster, members, existingInitialJob } = ctx
  if (cluster.aiEligibility === 'WATCHING') return 'WATCHING'
  if (cluster.aiEligibility === 'REJECTED') return 'REJECTED'
  if (cluster.editorialDecision === 'WATCHING') return 'WATCHING'
  if (cluster.editorialDecision === 'REJECTED' || cluster.editorialDecision === 'ARCHIVED') {
    return 'EDITORIALLY_REJECTED'
  }
  if (cluster.aiEligibility !== 'ELIGIBLE' && cluster.aiEligibility !== 'HIGH_PRIORITY') {
    return 'WATCHING'
  }
  if (existingInitialJob) return 'ALREADY_DISPATCHED'
  const validMembers = members.filter((m) => m.sourceStatus !== 'DISABLED')
  if (validMembers.length === 0) return 'NO_VALID_SOURCE'
  if (validMembers.every((m) => m.isExactDuplicate)) return 'NO_VALID_SOURCE'
  if (validMembers.every((m) => m.editorialStatus === 'SKIPPED')) return 'EDITORIALLY_REJECTED'
  if (validMembers.some((m) => m.editorialStatus === 'PUBLISHED' && m.editorialNewsId)) {
    return 'ALREADY_PUBLISHED'
  }
  if (!validMembers.some((m) => usableBody(m))) return 'NO_USABLE_BODY'
  return null
}

export function evaluateDispatchCandidate(
  ctx: EvaluateContext,
  budget?: BudgetSnapshot,
  concurrentJobs = 0
): EvaluationResult {
  const cfg = crawlerAiDispatchConfig()
  const enabled = isCrawlerAiDispatchEnabled()
  const dryRun = cfg.dryRun
  const base: EvaluationResult = {
    clusterId: ctx.cluster.id,
    eventKey: ctx.cluster.eventKey,
    dispatchType: 'INITIAL',
    eligibleAuto: ctx.cluster.aiEligibility === 'ELIGIBLE' || ctx.cluster.aiEligibility === 'HIGH_PRIORITY',
    wouldDispatch: false,
    wouldDispatchIfEnabled: false,
    blockedReason: null,
    technicalBlockReason: null,
    pack: null,
    selectedSourceNames: [],
    selectedSourceCount: 0,
    estimatedInputTokens: null,
    estimatedOutputTokens: null,
    estimatedTotalTokens: null,
    estimatedCostUsd: null,
    estimatedPipelineTokens: null,
    estimatedPipelineCostUsd: null,
    reservationUsd: null,
    priority: dispatchPriorityScore(ctx.cluster),
    isLocalProtected: isLocalProtectedEvent(ctx.cluster),
    provider: cfg.provider,
    model: cfg.model,
  }

  if (ctx.cluster.hasMaterialUpdate && ctx.existingInitialJob && !ctx.executeMaterialUpdate) {
    return {
      ...base,
      dispatchType: 'MATERIAL_UPDATE',
      blockedReason: 'MATERIAL_UPDATE_NOT_EXECUTED',
      technicalBlockReason: 'MATERIAL_UPDATE_NOT_EXECUTED',
    }
  }

  const extra = extraEligibility(ctx)
  if (extra) {
    return { ...base, blockedReason: extra, technicalBlockReason: extra }
  }

  const pack = buildEventAiPack(ctx.cluster, ctx.members, ctx.now)
  if (pack.sources.length === 0) {
    return { ...base, blockedReason: 'NO_USABLE_BODY', technicalBlockReason: 'NO_USABLE_BODY' }
  }

  const fitted = fitPackToTokenCeiling(pack)
  const tokens = fitted.tokens
  const typicalPipeline = pipelineTokenBounds(
    tokens.estimatedInputTokens,
    tokens.estimatedOutputTokens
  ).typicalTokensPerEvent
  const cost = estimateDispatchCost(tokens, typicalPipeline)
  const filled: EvaluationResult = {
    ...base,
    pack: fitted.pack,
    selectedSourceNames: fitted.pack.sources.map((s) => s.sourceName),
    selectedSourceCount: fitted.pack.sources.length,
    estimatedInputTokens: tokens.estimatedInputTokens,
    estimatedOutputTokens: tokens.estimatedOutputTokens,
    estimatedTotalTokens: tokens.estimatedTotalTokens,
    estimatedCostUsd: cost.estimatedCostUsd,
    estimatedPipelineTokens: cost.pipelineTokens,
    estimatedPipelineCostUsd: cost.pipelineCostUsd,
    reservationUsd: reservationUsd(cost),
  }

  let technical: AiBlockReason | null = null
  if (fitted.exceeded) technical = 'TOKEN_BUDGET_EXCEEDED'
  else if (!cost.known) technical = 'COST_UNKNOWN'
  else if ((reservationUsd(cost) ?? 0) > cfg.maxCostUsdPerEvent + 1e-12) {
    technical = 'EVENT_COST_LIMIT_EXCEEDED'
  } else if (ctx.circuitOpen) technical = 'PROVIDER_CIRCUIT_OPEN'
  else if (budget) {
    const attempt = tryReserveBudget({
      hour: budget.hour,
      day: budget.day,
      costUsd: reservationUsd(cost) ?? 0,
      concurrentJobs,
    })
    if (!attempt.ok) technical = attempt.reason
  }

  filled.technicalBlockReason = technical
  filled.wouldDispatchIfEnabled = technical == null

  if (technical) {
    filled.blockedReason = technical
    return filled
  }

  if (!enabled) {
    filled.blockedReason = 'DISPATCH_DISABLED'
    return filled
  }
  if (dryRun) {
    filled.blockedReason = 'DRY_RUN'
    return filled
  }

  filled.wouldDispatch = true
  return filled
}
