export function computeSourceHealthScore(input: {
  discoverySuccessRate: number
  fetchSuccessRate: number
  extractionSuccessRate: number
  averageConfidence: number
  httpErrorRate: number
  duplicateRate: number
  freshArticleRate: number
  requiresJavascript: boolean
}): number {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))
  let score = 0
  score += clamp01(input.discoverySuccessRate) * 22
  score += clamp01(input.fetchSuccessRate) * 22
  score += clamp01(input.extractionSuccessRate) * 20
  score += clamp01(input.averageConfidence) * 14
  score += (1 - clamp01(input.httpErrorRate)) * 10
  score += (1 - clamp01(input.duplicateRate)) * 6
  score += clamp01(input.freshArticleRate) * 6
  if (input.requiresJavascript) score -= 8
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function nextStatusForFailures(consecutiveFailures: number): {
  status: 'ACTIVE' | 'DEGRADED' | 'PAUSED'
  reason: string | null
} {
  if (consecutiveFailures >= 6) {
    return { status: 'PAUSED', reason: `auto_pause_failures_${consecutiveFailures}` }
  }
  if (consecutiveFailures >= 3) {
    return { status: 'DEGRADED', reason: `auto_degrade_failures_${consecutiveFailures}` }
  }
  return { status: 'ACTIVE', reason: null }
}
