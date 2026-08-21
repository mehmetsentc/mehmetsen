/**
 * Phase 4D budget env surface.
 * Prefers AI_MAX_* names; falls back to existing CRAWLER_AI_* for compatibility.
 * Default per-event ceiling for controlled auto-draft: $0.01
 */

function numEnv(...namesAndFallback: [...string[], number]): number {
  const fallback = namesAndFallback[namesAndFallback.length - 1] as number
  const names = namesAndFallback.slice(0, -1) as string[]
  for (const name of names) {
    const raw = process.env[name]?.trim()
    if (!raw) continue
    const n = Number(raw)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * Phase 4E controlled rollout hard defaults (server-side).
 * Per-event $0.01 · 2/hour · 10/day · $0.05/day · $5/month.
 */
export function autoDraftBudgetLimits() {
  return {
    /** Hard per-event ceiling — Phase 4E default $0.01 */
    maxCostPerEventUsd: Math.max(
      0,
      numEnv('AI_MAX_COST_PER_EVENT_USD', 'CRAWLER_AI_MAX_COST_USD_PER_EVENT', 0.01)
    ),
    maxDraftsPerHour: clamp(
      Math.round(numEnv('AI_MAX_DRAFTS_PER_HOUR', 'CRAWLER_AI_MAX_REQUESTS_PER_HOUR', 2)),
      0,
      10_000
    ),
    maxDraftsPerDay: clamp(
      Math.round(numEnv('AI_MAX_DRAFTS_PER_DAY', 'CRAWLER_AI_MAX_REQUESTS_PER_DAY', 10)),
      0,
      50_000
    ),
    maxDailyCostUsd: Math.max(0, numEnv('AI_MAX_DAILY_COST_USD', 'CRAWLER_AI_DAILY_BUDGET_USD', 0.05)),
    maxMonthlyCostUsd: Math.max(0, numEnv('AI_MAX_MONTHLY_COST_USD', 5)),
    maxHourlyCostUsd: Math.max(0, numEnv('CRAWLER_AI_HOURLY_BUDGET_USD', 0.05)),
    /** Always 1 — dedicated worker also enforces one job per invocation. */
    maxConcurrentJobs: clamp(Math.round(numEnv('CRAWLER_AI_MAX_CONCURRENT_JOBS', 1)), 0, 20),
    maxJobsPerInvocation: 1,
  }
}

export type AutoDraftBudgetLimits = ReturnType<typeof autoDraftBudgetLimits>

export function monthPeriodKey(now: Date): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export type MonthlyBudgetCheck =
  | { ok: true }
  | { ok: false; reason: 'MONTHLY_BUDGET_EXCEEDED' }

export function checkMonthlyBudget(input: {
  reservedUsd: number
  spentUsd: number
  nextCostUsd: number
  maxMonthlyCostUsd: number
}): MonthlyBudgetCheck {
  const used = input.reservedUsd + input.spentUsd
  if (used + input.nextCostUsd > input.maxMonthlyCostUsd + 1e-12) {
    return { ok: false, reason: 'MONTHLY_BUDGET_EXCEEDED' }
  }
  return { ok: true }
}
