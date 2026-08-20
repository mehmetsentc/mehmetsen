import { getDeepSeekModel } from '@/lib/ai/deepseekClient'
import { isCrawlerAiDispatchEnabled } from '../dispatch'
import { isLegacyDirectAiEnabled } from '../legacyFlags'

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Hard ceiling for single-event canary — BLOCK if estimated cost exceeds. */
export const CANARY_MAX_COST_USD = 0.05

/**
 * Canary never enables automatic dispatch or legacy AI.
 * Paid path requires explicit APPROVED_FOR_REAL_CANARY_EXECUTION + provider adapter.
 */
export function canaryConfig() {
  return {
    provider: 'deepseek' as const,
    model: getDeepSeekModel(),
    maxSources: 3 as const,
    maxEvents: 1 as const,
    concurrency: 1 as const,
    initialRequests: 1 as const,
    maxRequestsWithRepair: 2 as const,
    maxCostUsdPerEvent: Math.min(CANARY_MAX_COST_USD, Math.max(0, numEnv('CANARY_MAX_COST_USD_PER_EVENT', CANARY_MAX_COST_USD))),
    maxInputTokens: clamp(Math.round(numEnv('CANARY_MAX_INPUT_TOKENS', 6000)), 500, 16_000),
    estimatedOutputTokens: clamp(Math.round(numEnv('CANARY_ESTIMATED_OUTPUT_TOKENS', 1600)), 200, 4_000),
    staleHours: clamp(Math.round(numEnv('CANARY_STALE_HOURS', 72)), 6, 168),
    /** Stage 1 default: paid DeepSeek disabled even with confirmation. */
    paidExecutionEnabled: process.env.CANARY_PAID_EXECUTION_ENABLED?.trim().toLowerCase() === 'true',
    autoPublish: false as const,
  }
}

export type CanaryConfig = ReturnType<typeof canaryConfig>

export function assertCanarySafetyFlags(): {
  ok: boolean
  crawlerAiDispatchEnabled: boolean
  legacyDirectAiEnabled: boolean
  reasons: string[]
} {
  const crawlerAiDispatchEnabled = isCrawlerAiDispatchEnabled()
  const legacyDirectAiEnabled = isLegacyDirectAiEnabled()
  const reasons: string[] = []
  if (crawlerAiDispatchEnabled) reasons.push('CRAWLER_AI_DISPATCH_ENABLED must stay false for canary stage')
  if (legacyDirectAiEnabled) reasons.push('LEGACY_DIRECT_AI_ENABLED must stay false for canary stage')
  return {
    ok: reasons.length === 0,
    crawlerAiDispatchEnabled,
    legacyDirectAiEnabled,
    reasons,
  }
}
