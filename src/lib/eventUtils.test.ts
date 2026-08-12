import { describe, expect, it } from 'vitest'
import { isEventUpcoming } from '@/lib/eventUtils'

const AUG_12_2026_NOON_TR = '2026-08-12T09:00:00.000Z'
const AUG_10_2026_NOON_TR = '2026-08-10T09:00:00.000Z'

describe('isEventUpcoming', () => {
  it('includes multi-day events still running today', () => {
    const event = {
      startsAt: '2026-07-01T07:00:00.000Z',
      endsAt: '2026-08-31T18:00:00.000Z',
      recurrence: 'annual' as const,
    }

    expect(isEventUpcoming(event, AUG_12_2026_NOON_TR)).toBe(true)
  })

  it('excludes annual festivals that fully ended before today (no next-year roll)', () => {
    const endedAug10 = {
      startsAt: '2026-07-01T07:00:00.000Z',
      endsAt: '2026-08-10T18:00:00.000Z',
      recurrence: 'annual' as const,
    }
    const endedAug8to10 = {
      startsAt: '2026-08-08T07:00:00.000Z',
      endsAt: '2026-08-10T18:00:00.000Z',
      recurrence: 'annual' as const,
    }

    expect(isEventUpcoming(endedAug10, AUG_12_2026_NOON_TR)).toBe(false)
    expect(isEventUpcoming(endedAug8to10, AUG_12_2026_NOON_TR)).toBe(false)
  })

  it('includes events starting today', () => {
    const event = {
      startsAt: '2026-08-10T16:45:00.000Z',
      endsAt: '2026-08-10T20:00:00.000Z',
      recurrence: 'annual' as const,
    }

    expect(isEventUpcoming(event, AUG_10_2026_NOON_TR)).toBe(true)
  })

  it('includes future-dated one-off events', () => {
    const event = {
      startsAt: '2026-08-12T18:00:00.000Z',
      endsAt: '2026-08-12T21:00:00.000Z',
    }

    expect(isEventUpcoming(event, AUG_10_2026_NOON_TR)).toBe(true)
  })

  it('excludes one-off events that fully ended before today', () => {
    const event = {
      startsAt: '2026-08-09T18:00:00.000Z',
      // 21:00 TR on 11 Aug (= 18:00Z) — fully before 12 Aug Istanbul
      endsAt: '2026-08-11T18:00:00.000Z',
    }

    expect(isEventUpcoming(event, AUG_12_2026_NOON_TR)).toBe(false)
  })

  it('keeps multi-day one-off events through their end calendar day', () => {
    const event = {
      startsAt: '2026-08-09T18:00:00.000Z',
      endsAt: '2026-08-12T21:00:00.000Z',
    }

    expect(isEventUpcoming(event, AUG_12_2026_NOON_TR)).toBe(true)
  })
})
