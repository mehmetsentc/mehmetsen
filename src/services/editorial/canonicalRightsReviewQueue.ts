/**
 * P18.4E.3 — Pure helpers for canonical rights review queue UX.
 * No DB writes. No publish. No AI.
 */

export const P18_4E_COHORT1_BATCH_ID = 'P18_4E_20260904T172223Z' as const

/**
 * P16.1 Task 7 -- single source of truth for known dev seed / pilot canonical
 * news ids. These are the same 3 ids already hardcoded independently in
 * both /api/admin/canonical-news/[id]/rights/route.ts (as `PILOT_HINT`) and
 * /api/admin/canonical-news/rights-queue/route.ts (as `PILOT_IDS`) -- kept
 * here as one shared constant so both call sites (and any future one) stay
 * in sync, and so cohort/batch-filtered queries can positively exclude them
 * instead of relying only on batch-id prefixes never colliding by luck.
 * Includes the P18.4D.2 seedCandidate2EditorialBlocker() dev-seed target
 * ('0SdmPVCnO8pVAbMENA9f') -- see newsRightsDecision.ts.
 * Never mutate these rows from here; this module is read-only helpers.
 */
export const SEED_DEMO_CANONICAL_NEWS_IDS = [
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
] as const

export type SeedDemoCanonicalNewsId = (typeof SEED_DEMO_CANONICAL_NEWS_IDS)[number]

const SEED_DEMO_CANONICAL_NEWS_ID_SET: ReadonlySet<string> = new Set(
  SEED_DEMO_CANONICAL_NEWS_IDS
)

/** True for any known dev seed / pilot canonical news id -- never a real cohort candidate. */
export function isSeedDemoCanonicalNewsId(id: string | null | undefined): boolean {
  if (!id) return false
  return SEED_DEMO_CANONICAL_NEWS_ID_SET.has(id.trim())
}

/**
 * Filter out known seed/demo rows from a batch/cohort query result set.
 * Defense-in-depth: batch ids are timestamp-derived per migration run so a
 * seed row's migrationBatchId realistically never collides with a real
 * cohort batch id, but this makes the exclusion positive and explicit
 * rather than relying on that non-collision alone.
 */
export function excludeSeedDemoCanonicalNewsRows<T extends { id: string }>(
  rows: readonly T[]
): T[] {
  return rows.filter((row) => !isSeedDemoCanonicalNewsId(row.id))
}

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
