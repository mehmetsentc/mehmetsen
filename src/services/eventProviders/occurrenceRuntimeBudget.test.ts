import { describe, expect, it } from 'vitest'
import {
  OCCURRENCE_CITY_CONCURRENCY,
  OCCURRENCE_HARD_WORK_CEILING_MS,
  OCCURRENCE_PREFERRED_INVOCATION_MS,
  OCCURRENCE_VERCEL_MAX_DURATION_MS,
  invocationRuntimePass,
  shouldStartNextUnit,
} from './occurrenceRuntimeBudget'

describe('occurrence runtime budget guard', () => {
  it('reuses legacy concurrency and keeps the 300s ceiling', () => {
    expect(OCCURRENCE_CITY_CONCURRENCY).toBe(4)
    expect(OCCURRENCE_VERCEL_MAX_DURATION_MS).toBe(300_000)
    expect(OCCURRENCE_PREFERRED_INVOCATION_MS).toBe(180_000)
    expect(OCCURRENCE_HARD_WORK_CEILING_MS).toBe(240_000)
  })

  it('refuses a new unit after the hard work ceiling', () => {
    expect(
      shouldStartNextUnit({ elapsedMs: 241_000, deadlineMs: 300_000 })
    ).toBe(false)
    expect(
      shouldStartNextUnit({ elapsedMs: 10_000, deadlineMs: 180_000 })
    ).toBe(true)
    expect(invocationRuntimePass(239_000)).toBe(true)
    expect(invocationRuntimePass(241_000)).toBe(false)
  })
})
