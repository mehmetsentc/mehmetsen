/**
 * Phase 4E — deterministic editorial ranking for controlled auto-draft.
 * Ranking boost ≠ quality-gate bypass. Çanakkale may rise in queue, never skip gates.
 */

import { localeLower } from '../cluster/normalize'

export type EditorialPriorityBand = 'BREAKING' | 'HIGH' | 'NORMAL' | 'LOW'

export type EditorialRankInput = {
  editorialPriority?: EditorialPriorityBand | string | null
  crawlPriority?: EditorialPriorityBand | string | null
  independentSourceCount: number
  importanceScore: number
  staleHours: number
  avgHealth: number
  bestWordCount: number
  bestConfidence: number
  city?: string | null
  district?: string | null
  region?: string | null
  countryCode?: string | null
}

export type EditorialRankResult = {
  score: number
  priorityBand: EditorialPriorityBand
  canakkaleBoostApplied: boolean
  breakdown: Record<string, number>
}

const PRIORITY_BASE: Record<EditorialPriorityBand, number> = {
  BREAKING: 1000,
  HIGH: 700,
  NORMAL: 400,
  LOW: 100,
}

/** Geographic ranking boost only — never used inside evaluateAutoDraftGate. */
export const CANAKKALE_RANK_BOOST = 80

export function isCanakkaleLocal(input: {
  city?: string | null
  district?: string | null
  region?: string | null
}): boolean {
  const hay = [input.city, input.district, input.region]
    .filter(Boolean)
    .map((s) => localeLower(String(s), 'tr'))
    .join(' ')
  return (
    hay.includes('çanakkale') ||
    hay.includes('canakkale') ||
    /\b(biga|gelibolu|ezine|ayvacık|ayvacik|bayramiç|bayramic|bozcaada|gökçeada|gokceada|lapseki|eceabat|yenice|ç\.?an|c\.?an)\b/.test(
      hay
    )
  )
}

function normalizePriority(raw: string | null | undefined): EditorialPriorityBand {
  const v = (raw || 'NORMAL').toUpperCase()
  if (v === 'BREAKING') return 'BREAKING'
  if (v === 'HIGH') return 'HIGH'
  if (v === 'LOW') return 'LOW'
  return 'NORMAL'
}

/**
 * Higher score = prefer earlier spend under tight daily caps.
 * Does not authorize AI_READY / spend by itself.
 */
export function scoreEditorialAutoDraftRank(input: EditorialRankInput): EditorialRankResult {
  const priorityBand = normalizePriority(input.editorialPriority || input.crawlPriority)
  const multiSource = Math.min(200, Math.max(0, input.independentSourceCount - 1) * 90)
  const importance = Math.min(120, Math.max(0, input.importanceScore) * 1.1)
  const freshness = Math.max(0, 100 - input.staleHours * 8)
  const health = Math.min(80, Math.max(0, input.avgHealth) * 0.7)
  const material = Math.min(80, Math.max(0, input.bestWordCount) / 8)
  const confidence = Math.min(60, Math.max(0, input.bestConfidence) * 60)
  const canakkaleBoostApplied = isCanakkaleLocal(input)
  const geoBoost = canakkaleBoostApplied ? CANAKKALE_RANK_BOOST : 0

  const score =
    PRIORITY_BASE[priorityBand] +
    multiSource +
    importance +
    freshness +
    health +
    material +
    confidence +
    geoBoost

  return {
    score: Number(score.toFixed(2)),
    priorityBand,
    canakkaleBoostApplied,
    breakdown: {
      priorityBase: PRIORITY_BASE[priorityBand],
      multiSource,
      importance,
      freshness,
      health,
      material,
      confidence,
      canakkaleBoost: geoBoost,
    },
  }
}

export function compareEditorialAutoDraftRank(a: EditorialRankInput, b: EditorialRankInput): number {
  return scoreEditorialAutoDraftRank(b).score - scoreEditorialAutoDraftRank(a).score
}
