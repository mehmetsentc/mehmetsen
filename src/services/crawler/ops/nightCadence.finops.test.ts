import { describe, expect, it } from 'vitest'
import { shouldSkipNightTick } from './nightCadence'

// TR = UTC+3
const at = (utcH: number, m: number) => new Date(Date.UTC(2026, 10, 16, utcH, m))

describe('FinOps: crawler night cadence', () => {
  it('skips the :30 tick between 01:00 and 05:59 TR', () => {
    expect(shouldSkipNightTick(at(22, 30), {})).toBe(true) // 01:30 TR
    expect(shouldSkipNightTick(at(2, 31), {})).toBe(true) // 05:31 TR
  })
  it('keeps the :00 tick at night (with cron jitter)', () => {
    expect(shouldSkipNightTick(at(22, 0), {})).toBe(false)
    expect(shouldSkipNightTick(at(1, 4), {})).toBe(false)
  })
  it('never skips outside the night window', () => {
    expect(shouldSkipNightTick(at(21, 30), {})).toBe(false) // 00:30 TR
    expect(shouldSkipNightTick(at(3, 30), {})).toBe(false) // 06:30 TR
    expect(shouldSkipNightTick(at(12, 30), {})).toBe(false)
  })
  it('CRAWLER_NIGHT_THROTTLE=0 disables it', () => {
    expect(shouldSkipNightTick(at(22, 30), { CRAWLER_NIGHT_THROTTLE: '0' })).toBe(false)
  })
})
