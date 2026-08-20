import { getDeepSeekModel } from '@/lib/ai/deepseekClient'
import { isCrawlerAiDispatchDryRun, isCrawlerAiDispatchEnabled } from '../dispatch'
import { getCrawlerAiMode } from '../aiMode'
import { getCrawlerAiProviderReadiness } from './providerReadiness'

export {
  getCrawlerAiProviderReadiness,
  isCrawlerAiProviderEnabled,
  type CrawlerAiProviderReadiness,
  type ProviderNotReadyReason,
} from './providerReadiness'

function numEnvFirst(names: string[], fallback: number): number {
  for (const name of names) {
    const raw = process.env[name]?.trim()
    if (!raw) continue
    const n = Number(raw)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function numEnv(name: string, fallback: number): number {
  return numEnvFirst([name], fallback)
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * Phase 4D.1 — true only when kill switch + credential + model + prices + writer + validator.
 * Default false (kill switch off). Key alone ≠ spend permission.
 */
export function isCrawlerAiProviderWired(): boolean {
  return getCrawlerAiProviderReadiness().ready
}

export function crawlerAiDispatchConfig() {
  return {
    maxSourcesPerEvent: clamp(Math.round(numEnv('MAX_AI_SOURCES_PER_EVENT', 3)), 1, 5),
    maxInputTokensPerEvent: clamp(Math.round(numEnv('CRAWLER_AI_MAX_INPUT_TOKENS_PER_EVENT', 8000)), 20, 32_000),
    estimatedOutputTokens: clamp(Math.round(numEnv('CRAWLER_AI_ESTIMATED_OUTPUT_TOKENS', 1800)), 200, 8_000),
    dailyBudgetUsd: Math.max(
      0,
      numEnvFirst(['AI_MAX_DAILY_COST_USD', 'CRAWLER_AI_DAILY_BUDGET_USD'], 0.5)
    ),
    hourlyBudgetUsd: Math.max(0, numEnv('CRAWLER_AI_HOURLY_BUDGET_USD', 0.05)),
    monthlyBudgetUsd: Math.max(0, numEnvFirst(['AI_MAX_MONTHLY_COST_USD'], 15)),
    maxRequestsPerHour: clamp(
      Math.round(numEnvFirst(['AI_MAX_DRAFTS_PER_HOUR', 'CRAWLER_AI_MAX_REQUESTS_PER_HOUR'], 4)),
      0,
      10_000
    ),
    maxRequestsPerDay: clamp(
      Math.round(numEnvFirst(['AI_MAX_DRAFTS_PER_DAY', 'CRAWLER_AI_MAX_REQUESTS_PER_DAY'], 20)),
      0,
      50_000
    ),
    maxEventsPerTick: clamp(Math.round(numEnv('CRAWLER_AI_MAX_EVENTS_PER_TICK', 1)), 0, 20),
    maxConcurrentJobs: clamp(Math.round(numEnv('CRAWLER_AI_MAX_CONCURRENT_JOBS', 1)), 0, 20),
    /** Prefer AI_MAX_COST_PER_EVENT_USD when set; else CRAWLER_AI_* (default $0.15 shadow). Controlled auto-draft uses autoDraftBudgetLimits() ($0.01). */
    maxCostUsdPerEvent: Math.max(
      0,
      numEnvFirst(['AI_MAX_COST_PER_EVENT_USD', 'CRAWLER_AI_MAX_COST_USD_PER_EVENT'], 0.15)
    ),
    pipelineCostMultiplier: clamp(numEnv('CRAWLER_AI_PIPELINE_COST_MULTIPLIER', 8), 1, 20),
    localPriorityWeight: clamp(Math.round(numEnv('CRAWLER_AI_LOCAL_PRIORITY_WEIGHT', 250)), 0, 5_000),
    localImportanceMin: clamp(Math.round(numEnv('CRAWLER_AI_LOCAL_IMPORTANCE_MIN', 60)), 0, 100),
    localBudgetReserveShare: clamp(numEnv('CRAWLER_AI_LOCAL_BUDGET_RESERVE_SHARE', 0.2), 0, 0.8),
    circuit429Threshold: clamp(Math.round(numEnv('CRAWLER_AI_CIRCUIT_429_THRESHOLD', 3)), 1, 20),
    circuit5xxThreshold: clamp(Math.round(numEnv('CRAWLER_AI_CIRCUIT_5XX_THRESHOLD', 3)), 1, 20),
    maxAttempts: clamp(Math.round(numEnv('CRAWLER_AI_MAX_ATTEMPTS', 2)), 1, 5),
    provider: 'deepseek',
    model: getDeepSeekModel(),
    enabled: isCrawlerAiDispatchEnabled(),
    dryRun: isCrawlerAiDispatchDryRun(),
    providerWired: isCrawlerAiProviderWired(),
    mode: getCrawlerAiMode(),
  }
}

export type CrawlerAiDispatchConfig = ReturnType<typeof crawlerAiDispatchConfig>
