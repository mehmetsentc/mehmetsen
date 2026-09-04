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
  }
}
