/**
 * SCALE P2 global circuit breaker — trips expanded hierarchy without a deploy.
 */

export const CIRCUIT_BREAKER_DOC_ID = 'circuitBreaker'

export const CIRCUIT_QUALITY_FAIL_RATE = 0.4
export const CIRCUIT_QUALITY_MIN_SAMPLE = 10
export const CIRCUIT_ERROR_RATE = 0.3
export const CIRCUIT_ERROR_MIN_SAMPLE = 20
export const CIRCUIT_COST_MULTIPLIER = 2

export interface CircuitBreakerMetrics {
  qualityFailCount: number
  qualitySample: number
  usageErrorCount: number
  usageSample: number
  costUsdToday: number | null
  costUsdBaselineDaily: number | null
}

export interface CircuitBreakerDecision {
  tripped: boolean
  reason: string | null
  metrics: CircuitBreakerMetrics
}

export function evaluateCircuitBreaker(metrics: CircuitBreakerMetrics): CircuitBreakerDecision {
  if (metrics.qualitySample >= CIRCUIT_QUALITY_MIN_SAMPLE) {
    const failRate = metrics.qualityFailCount / metrics.qualitySample
    if (failRate > CIRCUIT_QUALITY_FAIL_RATE) {
      return {
        tripped: true,
        reason: `quality-gate FAIL oranı ${(failRate * 100).toFixed(0)}% (n=${metrics.qualitySample})`,
        metrics,
      }
    }
  }
  if (metrics.usageSample >= CIRCUIT_ERROR_MIN_SAMPLE) {
    const errRate = metrics.usageErrorCount / metrics.usageSample
    if (errRate > CIRCUIT_ERROR_RATE) {
      return {
        tripped: true,
        reason: `AI_USAGE hata oranı ${(errRate * 100).toFixed(0)}% (n=${metrics.usageSample})`,
        metrics,
      }
    }
  }
  if (
    metrics.costUsdToday != null &&
    metrics.costUsdBaselineDaily != null &&
    metrics.costUsdBaselineDaily > 0 &&
    metrics.costUsdToday > metrics.costUsdBaselineDaily * CIRCUIT_COST_MULTIPLIER
  ) {
    return {
      tripped: true,
      reason: `DeepSeek maliyet $${metrics.costUsdToday.toFixed(2)} > 2× taban $${metrics.costUsdBaselineDaily.toFixed(2)}`,
      metrics,
    }
  }
  return { tripped: false, reason: null, metrics }
}

let memoryTripped = false
let memoryReason: string | null = null

export function tripExpandedHierarchyCircuit(reason: string): void {
  memoryTripped = true
  memoryReason = reason
}

export function clearExpandedHierarchyCircuitForTests(): void {
  memoryTripped = false
  memoryReason = null
}

export function isExpandedHierarchyCircuitOpen(): boolean {
  if (memoryTripped) return true
  return process.env.EXPANDED_EDITOR_HIERARCHY_CIRCUIT_OPEN === 'true'
}

export function expandedHierarchyCircuitReason(): string | null {
  return memoryReason
}
