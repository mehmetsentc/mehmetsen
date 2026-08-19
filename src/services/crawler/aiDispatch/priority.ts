import type { EvaluationInputCluster } from './types'
import { crawlerAiDispatchConfig } from './flags'

export function isLocalProtectedEvent(cluster: EvaluationInputCluster): boolean {
  const cfg = crawlerAiDispatchConfig()
  const scope = (cluster.geographicScopeHint || '').toUpperCase()
  const cityDistrictScope = scope === 'CITY' || scope === 'DISTRICT'
  const hasPlace = Boolean(cluster.city || cluster.district)
  return (
    cityDistrictScope ||
    (hasPlace && cluster.localImportance >= cfg.localImportanceMin)
  )
}

export function dispatchPriorityScore(cluster: EvaluationInputCluster): number {
  const cfg = crawlerAiDispatchConfig()
  const high = cluster.aiEligibility === 'HIGH_PRIORITY' ? 1_000_000 : 0
  const local = isLocalProtectedEvent(cluster) ? cfg.localPriorityWeight : 0
  return (
    high +
    cluster.importanceScore * 10 +
    local +
    cluster.uniqueSourceCount * 25 +
    Math.round(cluster.freshnessScore * 100) +
    cluster.localImportance
  )
}

export function sortDispatchCandidates<T extends EvaluationInputCluster>(clusters: T[]): T[] {
  return [...clusters].sort((a, b) => {
    const diff = dispatchPriorityScore(b) - dispatchPriorityScore(a)
    if (diff !== 0) return diff
    return a.id.localeCompare(b.id)
  })
}
