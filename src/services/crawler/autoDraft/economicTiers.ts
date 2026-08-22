/**
 * Phase 4F.3 — material-first economic tiers (A–D).
 * Tier drives shadow would-dispatch priority; PRESPEND_REJECTED ≠ DELETE.
 */

import type { SourceRichness } from '../canary/sourcePolicy'
import type { PrespendOutcome } from './preSpendGate'

export const ECONOMIC_TIERS = ['A', 'B', 'C', 'D'] as const
export type EconomicTier = (typeof ECONOMIC_TIERS)[number]

export const ECONOMIC_TIER_LABELS_TR: Record<EconomicTier, string> = {
  A: 'A — Zengin çok kaynaklı',
  B: 'B — Güçlü tek kaynak',
  C: 'C — Orta / sınırda',
  D: 'D — İnce / yetersiz (engel)',
}

export type EconomicTierInput = {
  richness: SourceRichness
  independentSourceCount: number
  usableSourceWords: number
  bestConfidence: number
  avgHealth: number
  importanceScore: number
  strongSinglePath?: string | null
  prespendOutcome: PrespendOutcome
}

export type EconomicTierResult = {
  tier: EconomicTier
  labelTr: string
  /** Shadow may WOULD_DISPATCH only for A/B when PRESPEND_READY. */
  shadowDispatchAllowed: boolean
  reason: string
}

/**
 * A: rich + multi-source (ind≥2) + healthy
 * B: rich/medium strong-single that passed gate
 * C: medium borderline — observe, prefer block for paid path
 * D: thin/insufficient or hard pre-spend reject
 */
export function classifyEconomicTier(input: EconomicTierInput): EconomicTierResult {
  const hardReject = new Set<PrespendOutcome>([
    'TOO_THIN',
    'INSUFFICIENT_EVENT_EVIDENCE',
    'MALFORMED_EXTRACTION',
    'BOILERPLATE_HEAVY',
    'DUPLICATE_EVENT',
    'ALREADY_DRAFTED',
    'ALREADY_PUBLISHED',
    'EDITOR_REJECTED',
    'COST_UNKNOWN',
    'LOW_EDITORIAL_VALUE',
  ])

  if (hardReject.has(input.prespendOutcome) || input.richness === 'insufficient') {
    return {
      tier: 'D',
      labelTr: ECONOMIC_TIER_LABELS_TR.D,
      shadowDispatchAllowed: false,
      reason: 'tier_d_insufficient_or_hard_reject',
    }
  }

  const multi =
    input.independentSourceCount >= 2 &&
    input.usableSourceWords >= 300 &&
    input.bestConfidence >= 0.7 &&
    input.avgHealth >= 60

  if (multi && (input.richness === 'rich' || input.usableSourceWords >= 400)) {
    return {
      tier: 'A',
      labelTr: ECONOMIC_TIER_LABELS_TR.A,
      shadowDispatchAllowed: input.prespendOutcome === 'PRESPEND_READY',
      reason: 'tier_a_multi_rich',
    }
  }

  if (
    input.independentSourceCount === 1 &&
    (input.strongSinglePath || input.richness === 'rich') &&
    input.usableSourceWords >= 150 &&
    input.bestConfidence >= 0.75
  ) {
    return {
      tier: 'B',
      labelTr: ECONOMIC_TIER_LABELS_TR.B,
      shadowDispatchAllowed: input.prespendOutcome === 'PRESPEND_READY',
      reason: 'tier_b_strong_single',
    }
  }

  if (input.richness === 'medium' || input.usableSourceWords >= 150) {
    return {
      tier: 'C',
      labelTr: ECONOMIC_TIER_LABELS_TR.C,
      shadowDispatchAllowed: false,
      reason: 'tier_c_borderline',
    }
  }

  return {
    tier: 'D',
    labelTr: ECONOMIC_TIER_LABELS_TR.D,
    shadowDispatchAllowed: false,
    reason: 'tier_d_default',
  }
}

/** Honest multi-source dedup economics: unique sources vs packed sources. */
export function dedupEconomicsMetrics(input: {
  memberSourceCount: number
  independentSourceCount: number
  packedSourceCount: number
  usableSourceWords: number
  packedUsableWords: number
}): {
  memberSourceCount: number
  independentSourceCount: number
  packedSourceCount: number
  duplicateMembersDropped: number
  wordRetentionRatio: number | null
  noteTr: string
} {
  const duplicateMembersDropped = Math.max(0, input.memberSourceCount - input.independentSourceCount)
  const wordRetentionRatio =
    input.usableSourceWords > 0
      ? Math.round((input.packedUsableWords / input.usableSourceWords) * 1000) / 1000
      : null
  return {
    memberSourceCount: input.memberSourceCount,
    independentSourceCount: input.independentSourceCount,
    packedSourceCount: input.packedSourceCount,
    duplicateMembersDropped,
    wordRetentionRatio,
    noteTr:
      'Çok kaynaklı olaylarda yinelenen üyeler harcama birimini düşürmez; paket bir kez faturalanır.',
  }
}
