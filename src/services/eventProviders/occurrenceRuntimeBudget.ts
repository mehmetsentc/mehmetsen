/**
 * Planned work must finish with a reserve before Vercel maxDuration=300s.
 * These are design targets, not a request to raise maxDuration.
 */
export const OCCURRENCE_VERCEL_MAX_DURATION_MS = 300_000
export const OCCURRENCE_HARD_WORK_CEILING_MS = 240_000
export const OCCURRENCE_NORMAL_INVOCATION_MS = 210_000
export const OCCURRENCE_PREFERRED_INVOCATION_MS = 180_000
export const OCCURRENCE_RESERVE_MS = 60_000

/** Reuse legacy scrapeAllCities bound. Do not raise. */
export const OCCURRENCE_CITY_CONCURRENCY = 4

export function shouldStartNextUnit(input: {
  elapsedMs: number
  deadlineMs: number
  reserveMs?: number
}): boolean {
  const reserve = input.reserveMs ?? 5_000
  if (input.elapsedMs >= OCCURRENCE_HARD_WORK_CEILING_MS) return false
  return input.elapsedMs + reserve < input.deadlineMs
}

export function invocationRuntimePass(durationMs: number): boolean {
  return durationMs <= OCCURRENCE_HARD_WORK_CEILING_MS
}
