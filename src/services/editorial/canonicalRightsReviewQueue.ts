/**
 * P18.4E.3 — Pure helpers for canonical rights review queue UX.
 * No DB writes. No publish. No AI.
 */

export const P18_4E_COHORT1_BATCH_ID = 'P18_4E_20260904T172223Z' as const

export type ReviewRiskClass =
  | 'MEDIUM_OVERLAP'
  | 'HIGH_SOURCE_OVERLAP'
  | 'LOW_OVERLAP'
  | 'SOURCE_NOT_EVALUABLE'
  | string

export type RightsReviewSortItem = {
  id: string
  risk: ReviewRiskClass | null | undefined
  finalWeightedScore: number | null | undefined
}

/** MEDIUM first, then HIGH ascending by final score, then LOW, then unevaluable. */
export function riskSortRank(risk: ReviewRiskClass | null | undefined): number {
  switch (risk) {
    case 'MEDIUM_OVERLAP':
      return 0
    case 'HIGH_SOURCE_OVERLAP':
      return 1
    case 'LOW_OVERLAP':
      return 2
    case 'SOURCE_NOT_EVALUABLE':
      return 3
    default:
      return 4
  }
}

/**
 * Sort review queue for human cohort session:
 * 1) MEDIUM before HIGH
 * 2) Within same risk: lower finalWeightedScore first (ascending)
 * 3) Stable id tie-break
 */
export function sortRightsReviewQueueByRisk(
  items: readonly RightsReviewSortItem[]
): string[] {
  const copy = [...items]
  copy.sort((a, b) => {
    const ra = riskSortRank(a.risk)
    const rb = riskSortRank(b.risk)
    if (ra !== rb) return ra - rb
    const sa = typeof a.finalWeightedScore === 'number' ? a.finalWeightedScore : Number.POSITIVE_INFINITY
    const sb = typeof b.finalWeightedScore === 'number' ? b.finalWeightedScore : Number.POSITIVE_INFINITY
    if (sa !== sb) return sa - sb
    return a.id.localeCompare(b.id)
  })
  return copy.map((x) => x.id)
}

export type BatchRightsProgress = {
  total: number
  pending: number
  cleared: number
  rewriteRequired: number
  doNotPublish: number
  published: number
}

export function aggregateBatchRightsProgress(
  rows: readonly { status?: string | null; rightsStatus?: string | null }[]
): BatchRightsProgress {
  const progress: BatchRightsProgress = {
    total: rows.length,
    pending: 0,
    cleared: 0,
    rewriteRequired: 0,
    doNotPublish: 0,
    published: 0,
  }
  for (const row of rows) {
    if ((row.status || '').toLowerCase() === 'published') progress.published += 1
    const rs = (row.rightsStatus || 'PENDING').toUpperCase()
    if (rs === 'CLEARED') progress.cleared += 1
    else if (rs === 'REWRITE_REQUIRED') progress.rewriteRequired += 1
    else if (rs === 'DO_NOT_PUBLISH') progress.doNotPublish += 1
    else progress.pending += 1
  }
  return progress
}

/** Allowed human-set editorial blockers (existing vocabulary only). */
export const HUMAN_EDITORIAL_BLOCKERS = ['HIGH_SOURCE_OVERLAP'] as const
export type HumanEditorialBlocker = (typeof HUMAN_EDITORIAL_BLOCKERS)[number]

export function isHumanEditorialBlocker(v: unknown): v is HumanEditorialBlocker {
  return typeof v === 'string' && (HUMAN_EDITORIAL_BLOCKERS as readonly string[]).includes(v)
}
