/**
 * Phase 4F.3 / 4F.3.1 — SHADOW_AUTO_DRAFT economics (never paid).
 * Eligibility + pre-spend + rank + token/cost estimate → WOULD_DISPATCH / WOULD_BLOCK.
 * Never creates executable jobs, never calls provider, never mutates human editorial_decision.
 *
 * 4F.3.1: evaluations are operational telemetry; unique economics live in
 * shadowUniqueEconomics (cluster + fingerprint + gate version).
 */

import type { PrespendOutcome } from './preSpendGate'
import type { EconomicTier } from './economicTiers'
import {
  PRESPEND_GATE_VERSION_4F31,
  type ShadowRevisionKind,
} from './shadowUniqueEconomics'

export type ShadowDecisionAction = 'WOULD_DISPATCH' | 'WOULD_BLOCK'

export type ShadowAutoDraftDecision = {
  clusterId: string
  eventKey: string | null
  canonicalTitle: string | null
  evaluatedAt: Date
  machineEligibility: string
  prespendOutcome: PrespendOutcome
  economicTier: EconomicTier
  action: ShadowDecisionAction
  blockReason: string | null
  estimatedInputTokens: number | null
  estimatedOutputTokens: number | null
  estimatedCostUsd: number | null
  costKnown: boolean
  rankScore: number
  independentSourceCount: number
  usableSourceWords: number
  /** Human decision snapshot — never written back. */
  editorialDecisionSnapshot: string | null
  contentFingerprint: string
  prespendGateVersion: string
  revisionKind: ShadowRevisionKind
  meta?: Record<string, unknown>
}

export type ShadowFunnelStats = {
  evaluated: number
  wouldDispatch: number
  wouldBlock: number
  byPrespend: Record<string, number>
  byTier: Record<string, number>
  estimatedWouldSpendUsd: number | null
  estimatedPreventedUsd: number | null
  costUnknownCount: number
}

export function buildShadowDecision(input: {
  clusterId: string
  eventKey: string | null
  canonicalTitle: string | null
  machineEligibility: string
  prespendOutcome: PrespendOutcome
  readyToSpend: boolean
  tier: EconomicTier
  shadowDispatchAllowed: boolean
  blockReason: string | null
  estimatedInputTokens: number | null
  estimatedOutputTokens: number | null
  estimatedCostUsd: number | null
  costKnown: boolean
  rankScore: number
  independentSourceCount: number
  usableSourceWords: number
  editorialDecisionSnapshot: string | null
  contentFingerprint: string
  prespendGateVersion?: string
  revisionKind?: ShadowRevisionKind
  meta?: Record<string, unknown>
  now?: Date
}): ShadowAutoDraftDecision {
  const wouldDispatch =
    input.readyToSpend &&
    input.shadowDispatchAllowed &&
    input.prespendOutcome === 'PRESPEND_READY' &&
    input.costKnown &&
    input.estimatedCostUsd != null

  return {
    clusterId: input.clusterId,
    eventKey: input.eventKey,
    canonicalTitle: input.canonicalTitle,
    evaluatedAt: input.now ?? new Date(),
    machineEligibility: input.machineEligibility,
    prespendOutcome: input.prespendOutcome,
    economicTier: input.tier,
    action: wouldDispatch ? 'WOULD_DISPATCH' : 'WOULD_BLOCK',
    blockReason: wouldDispatch
      ? null
      : input.blockReason || input.prespendOutcome || 'WOULD_BLOCK',
    estimatedInputTokens: input.estimatedInputTokens,
    estimatedOutputTokens: input.estimatedOutputTokens,
    estimatedCostUsd: input.estimatedCostUsd,
    costKnown: input.costKnown,
    rankScore: input.rankScore,
    independentSourceCount: input.independentSourceCount,
    usableSourceWords: input.usableSourceWords,
    editorialDecisionSnapshot: input.editorialDecisionSnapshot,
    contentFingerprint: input.contentFingerprint,
    prespendGateVersion: input.prespendGateVersion ?? PRESPEND_GATE_VERSION_4F31,
    revisionKind: input.revisionKind ?? 'NEW_EVENT',
    meta: input.meta,
  }
}

export function aggregateShadowFunnel(decisions: ShadowAutoDraftDecision[]): ShadowFunnelStats {
  const byPrespend: Record<string, number> = {}
  const byTier: Record<string, number> = {}
  let wouldDispatch = 0
  let wouldBlock = 0
  let estimatedWouldSpendUsd = 0
  let estimatedPreventedUsd = 0
  let costUnknownCount = 0
  let spendKnown = true
  let preventedKnown = true

  for (const d of decisions) {
    byPrespend[d.prespendOutcome] = (byPrespend[d.prespendOutcome] || 0) + 1
    byTier[d.economicTier] = (byTier[d.economicTier] || 0) + 1
    if (!d.costKnown || d.estimatedCostUsd == null) costUnknownCount += 1
    if (d.action === 'WOULD_DISPATCH') {
      wouldDispatch += 1
      if (d.estimatedCostUsd != null && d.costKnown) estimatedWouldSpendUsd += d.estimatedCostUsd
      else spendKnown = false
    } else {
      wouldBlock += 1
      if (d.estimatedCostUsd != null && d.costKnown) estimatedPreventedUsd += d.estimatedCostUsd
      else if (d.prespendOutcome !== 'COST_UNKNOWN') {
        preventedKnown = preventedKnown && d.estimatedCostUsd != null
      }
    }
  }

  return {
    evaluated: decisions.length,
    wouldDispatch,
    wouldBlock,
    byPrespend,
    byTier,
    estimatedWouldSpendUsd: spendKnown ? roundUsd(estimatedWouldSpendUsd) : null,
    estimatedPreventedUsd: preventedKnown ? roundUsd(estimatedPreventedUsd) : null,
    costUnknownCount,
  }
}

function roundUsd(n: number): number {
  return Math.round(n * 1e8) / 1e8
}

/** Map shadow decision into Phase 4A dispatch shadow row shape (additive reuse). */
export function shadowDecisionToDispatchShadow(d: ShadowAutoDraftDecision) {
  return {
    clusterId: d.clusterId,
    eventKey: d.eventKey,
    canonicalTitle: d.canonicalTitle,
    eligibility: d.machineEligibility,
    wouldDispatch: d.action === 'WOULD_DISPATCH',
    blockedReason: d.blockReason,
    dispatchType: 'INITIAL' as const,
    estimatedInputTokens: d.estimatedInputTokens,
    estimatedOutputTokens: d.estimatedOutputTokens,
    estimatedTotalTokens:
      d.estimatedInputTokens != null && d.estimatedOutputTokens != null
        ? d.estimatedInputTokens + d.estimatedOutputTokens
        : null,
    estimatedCostUsd: d.estimatedCostUsd,
    estimatedPipelineTokens: d.estimatedInputTokens,
    estimatedPipelineCostUsd: d.estimatedCostUsd,
    selectedSourceCount: d.independentSourceCount,
    selectedSourceNames: [] as string[],
    importanceScore: Math.round(d.rankScore),
    localImportance: 0,
    nationalImportance: 0,
    globalImportance: 0,
    geographicScope: null as string | null,
    isLocalProtected: false,
    evaluatedAt: d.evaluatedAt,
  }
}
