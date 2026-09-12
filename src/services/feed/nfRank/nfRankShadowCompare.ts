/**
 * Shadow comparison: FeedRankingV1 order vs NFRank V1 order.
 * Evaluation only — must not mutate visible ranking or user profile.
 */
import type { ScoredFeedCandidate } from '@/types/smartFeed'
import type { NfRankedCandidate } from './NFRankEngine'

export interface NfShadowComparison {
  rankingVersionBaseline: string
  rankingVersionShadow: 'NFRANK_V1'
  topOverlap: number
  baselineTopIds: string[]
  shadowTopIds: string[]
  baselineCategoryDiversity: number
  shadowCategoryDiversity: number
  baselinePublisherDiversity: number
  shadowPublisherDiversity: number
  baselineClusterDupes: number
  shadowClusterDupes: number
  baselineAvgFreshnessHours: number
  shadowAvgFreshnessHours: number
  seenViolationsBaseline: number
  seenViolationsShadow: number
  verdict: 'BETTER' | 'MIXED' | 'WORSE' | 'INCONCLUSIVE'
  /** Compact window positions (no headlines/PII). `sh` filled when the shown page is known. */
  items: NfShadowItemMeasure[]
}

/** Bounded item list for one social_events row — not one write per candidate. */
export const NFRANK_SHADOW_ITEM_CAP = 24

/** Compact per-article positions for later join with real outcomes. */
export interface NfShadowItemMeasure {
  /** articleId */
  id: string
  /** baseline (visible V1) 1-based position in the ranked window; null if absent */
  bp: number | null
  /** NFRank shadow 1-based position; null if absent */
  sp: number | null
  /** shown 1-based position on the returned page; null until page slice is known */
  sh: number | null
  /** clusterId — may be null; never invented */
  cid: string | null
  /** existing rank reason when available */
  r: string | null
  /** candidate source family */
  src: string | null
  /** breaking flag (distinct from material update) */
  brk: boolean
  /** genuine material-update flag (not breaking) */
  mu: boolean
}

export interface NfShadowShownRow {
  articleId: string
  clusterId: string | null
  reason?: string | null
  source?: string | null
  breaking: boolean
  materialUpdate: boolean
}

function firstPositionMap(ids: Array<string | null | undefined>): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    if (!id || m.has(id)) continue
    m.set(id, i + 1)
  }
  return m
}

function lookupRow(
  rows: Array<{
    articleId: string
    clusterId: string | null
    reason?: string | null
    source?: string | null
    breaking: boolean
    materialUpdate: boolean
  }>,
  id: string
) {
  return rows.find((r) => r.articleId === id)
}

function buildWindowItems(
  baseline: ScoredFeedCandidate[],
  shadow: NfRankedCandidate[],
  cap: number = NFRANK_SHADOW_ITEM_CAP
): NfShadowItemMeasure[] {
  const baselinePos = firstPositionMap(baseline.map((r) => r.articleId))
  const shadowPos = firstPositionMap(shadow.map((r) => r.articleId))
  const orderedIds: string[] = []
  const seen = new Set<string>()
  const take = Math.max(1, Math.min(cap, Math.max(baseline.length, shadow.length)))
  for (const row of baseline.slice(0, take)) {
    if (seen.has(row.articleId)) continue
    seen.add(row.articleId)
    orderedIds.push(row.articleId)
  }
  for (const row of shadow.slice(0, take)) {
    if (seen.has(row.articleId)) continue
    seen.add(row.articleId)
    orderedIds.push(row.articleId)
    if (orderedIds.length >= cap) break
  }

  return orderedIds.slice(0, cap).map((id) => {
    const row = lookupRow(baseline, id) ?? lookupRow(shadow, id)
    return {
      id,
      bp: baselinePos.get(id) ?? null,
      sp: shadowPos.get(id) ?? null,
      sh: null,
      cid: row?.clusterId ?? null,
      r: row && 'reason' in row ? (row.reason ?? null) : null,
      src: row?.source ?? null,
      brk: Boolean(row?.breaking),
      mu: Boolean(row?.materialUpdate),
    }
  })
}

/**
 * Overlay shown-page positions onto window items. Does not mutate ranking arrays.
 * Shown-only IDs (not in the compared window) are appended with bp/sp null.
 */
export function withShownPositions(
  items: NfShadowItemMeasure[],
  shown: NfShadowShownRow[],
  cap: number = NFRANK_SHADOW_ITEM_CAP
): NfShadowItemMeasure[] {
  const shownPos = firstPositionMap(shown.map((r) => r.articleId))
  const byId = new Map(items.map((item) => [item.id, { ...item, sh: shownPos.get(item.id) ?? null }]))
  for (const row of shown) {
    const existing = byId.get(row.articleId)
    if (existing) {
      byId.set(row.articleId, {
        ...existing,
        sh: shownPos.get(row.articleId) ?? existing.sh,
        cid: existing.cid ?? row.clusterId,
        r: existing.r ?? row.reason ?? null,
        src: existing.src ?? row.source ?? null,
        brk: row.breaking,
        mu: row.materialUpdate,
      })
      continue
    }
    byId.set(row.articleId, {
      id: row.articleId,
      bp: null,
      sp: null,
      sh: shownPos.get(row.articleId) ?? null,
      cid: row.clusterId,
      r: row.reason ?? null,
      src: row.source ?? null,
      brk: row.breaking,
      mu: row.materialUpdate,
    })
  }
  const shownFirst = shown.map((r) => byId.get(r.articleId)!).filter(Boolean)
  const rest = [...byId.values()].filter((item) => !shownPos.has(item.id))
  return [...shownFirst, ...rest].slice(0, cap)
}

export function toNfShadowTelemetryMetadata(input: {
  comparison: NfShadowComparison
  shown: NfShadowShownRow[]
  feedSessionId: string
  feedSurface: string
}): Record<string, unknown> {
  const items = withShownPositions(input.comparison.items, input.shown)
  return {
    ranking_version_baseline: input.comparison.rankingVersionBaseline,
    ranking_version_shadow: input.comparison.rankingVersionShadow,
    nf_rank_mode: 'shadow',
    feed_surface: input.feedSurface,
    feedSessionId: input.feedSessionId,
    verdict: input.comparison.verdict,
    top_overlap: input.comparison.topOverlap,
    top_n: input.comparison.baselineTopIds.length,
    baseline_cluster_dupes: input.comparison.baselineClusterDupes,
    shadow_cluster_dupes: input.comparison.shadowClusterDupes,
    seen_violations_baseline: input.comparison.seenViolationsBaseline,
    seen_violations_shadow: input.comparison.seenViolationsShadow,
    items,
  }
}

function uniqueRatio(values: Array<string | null | undefined>): number {
  const cleaned = values.filter(Boolean) as string[]
  if (!cleaned.length) return 0
  return new Set(cleaned.map((v) => v.toLowerCase())).size / cleaned.length
}

function clusterDupes(rows: Array<{ clusterId: string | null }>): number {
  const seen = new Set<string>()
  let dupes = 0
  for (const r of rows) {
    if (!r.clusterId) continue
    if (seen.has(r.clusterId)) dupes += 1
    else seen.add(r.clusterId)
  }
  return dupes
}

function avgAgeHours(rows: Array<{ publishedAt: Date }>): number {
  if (!rows.length) return 0
  const now = Date.now()
  const sum = rows.reduce((acc, r) => acc + Math.max(0, (now - r.publishedAt.getTime()) / 3_600_000), 0)
  return sum / rows.length
}

function countSeenViolations(
  rows: Array<{ articleId: string; clusterId: string | null; materialUpdate: boolean }>,
  seenArticles: Set<string>,
  seenClusters: Set<string>
): number {
  let n = 0
  for (const r of rows) {
    if (r.materialUpdate) continue
    if (seenArticles.has(r.articleId)) n += 1
    else if (r.clusterId && seenClusters.has(r.clusterId)) n += 1
  }
  return n
}

export function compareShadowRankings(input: {
  baseline: ScoredFeedCandidate[]
  shadow: NfRankedCandidate[]
  baselineVersion?: string
  topN?: number
  seenArticles?: Set<string>
  seenClusters?: Set<string>
}): NfShadowComparison {
  const topN = input.topN ?? 10
  const baseline = input.baseline.slice(0, topN)
  const shadow = input.shadow.slice(0, topN)
  const baselineTopIds = baseline.map((r) => r.articleId)
  const shadowTopIds = shadow.map((r) => r.articleId)
  const overlapSet = new Set(baselineTopIds)
  const topOverlap = shadowTopIds.filter((id) => overlapSet.has(id)).length / Math.max(1, topN)

  const baselineCategoryDiversity = uniqueRatio(baseline.map((r) => r.category))
  const shadowCategoryDiversity = uniqueRatio(shadow.map((r) => r.category))
  const baselinePublisherDiversity = uniqueRatio(baseline.map((r) => r.publisherId))
  const shadowPublisherDiversity = uniqueRatio(shadow.map((r) => r.publisherId))
  const baselineClusterDupes = clusterDupes(baseline)
  const shadowClusterDupes = clusterDupes(shadow)
  const baselineAvgFreshnessHours = avgAgeHours(baseline)
  const shadowAvgFreshnessHours = avgAgeHours(shadow)
  const seenArticles = input.seenArticles ?? new Set<string>()
  const seenClusters = input.seenClusters ?? new Set<string>()
  const seenViolationsBaseline = countSeenViolations(baseline, seenArticles, seenClusters)
  const seenViolationsShadow = countSeenViolations(shadow, seenArticles, seenClusters)

  let better = 0
  let worse = 0
  if (shadowCategoryDiversity > baselineCategoryDiversity + 0.05) better += 1
  else if (shadowCategoryDiversity < baselineCategoryDiversity - 0.05) worse += 1
  if (shadowPublisherDiversity > baselinePublisherDiversity + 0.05) better += 1
  else if (shadowPublisherDiversity < baselinePublisherDiversity - 0.05) worse += 1
  if (shadowClusterDupes < baselineClusterDupes) better += 1
  else if (shadowClusterDupes > baselineClusterDupes) worse += 1
  if (shadowAvgFreshnessHours < baselineAvgFreshnessHours - 1) better += 1
  else if (shadowAvgFreshnessHours > baselineAvgFreshnessHours + 2) worse += 1
  if (seenViolationsShadow < seenViolationsBaseline) better += 1
  else if (seenViolationsShadow > seenViolationsBaseline) worse += 1

  let verdict: NfShadowComparison['verdict'] = 'INCONCLUSIVE'
  if (better > worse + 1) verdict = 'BETTER'
  else if (worse > better + 1) verdict = 'WORSE'
  else if (better > 0 || worse > 0) verdict = 'MIXED'

  return {
    rankingVersionBaseline: input.baselineVersion ?? 'v1',
    rankingVersionShadow: 'NFRANK_V1',
    topOverlap,
    baselineTopIds,
    shadowTopIds,
    baselineCategoryDiversity,
    shadowCategoryDiversity,
    baselinePublisherDiversity,
    shadowPublisherDiversity,
    baselineClusterDupes,
    shadowClusterDupes,
    baselineAvgFreshnessHours,
    shadowAvgFreshnessHours,
    seenViolationsBaseline,
    seenViolationsShadow,
    verdict,
    items: buildWindowItems(input.baseline, input.shadow),
  }
}
