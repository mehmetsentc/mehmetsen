import { describe, expect, it } from 'vitest'
import { isEventUpcoming } from '@/lib/eventUtils'

const AUG_10_2026_NOON_TR = '2026-08-10T09:00:00.000Z'

describe('isEventUpcoming', () => {
  it('excludes annual events that started before today even if still running', () => {
    const event = {
      startsAt: '2026-07-01T07:00:00.000Z',
      endsAt: '2026-08-10T18:00:00.000Z',
      recurrence: 'annual' as const,
    }

    expect(isEventUpcoming(event, AUG_10_2026_NOON_TR)).toBe(false)
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

  it('excludes events that started on a previous calendar day', () => {
    const event = {
      startsAt: '2026-08-09T18:00:00.000Z',
      endsAt: '2026-08-11T21:00:00.000Z',
    }

    expect(isEventUpcoming(event, AUG_10_2026_NOON_TR)).toBe(false)
  })
})
