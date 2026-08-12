import { describe, expect, it } from 'vitest'
import { resolveEventSchedule } from '@/lib/annualEventDates'

const AUG_12_2026_NOON_TR = '2026-08-12T09:00:00.000Z'

describe('resolveEventSchedule', () => {
  it('keeps finished annual events on the current year (no next-year jump)', () => {
    const resolved = resolveEventSchedule(
      {
        startsAt: '2025-08-08T07:00:00.000Z',
        endsAt: '2025-08-10T18:00:00.000Z',
        recurrence: 'annual',
      },
      AUG_12_2026_NOON_TR
    )

    expect(resolved.startsAt.startsWith('2026-08-08')).toBe(true)
    expect(resolved.endsAt?.startsWith('2026-08-10')).toBe(true)
  })

  it('maps annual templates onto the current Istanbul year while still upcoming', () => {
    const resolved = resolveEventSchedule(
      {
        startsAt: '2025-09-01T18:00:00.000Z',
        recurrence: 'annual',
      },
      AUG_12_2026_NOON_TR
    )

    expect(resolved.startsAt.startsWith('2026-09-01')).toBe(true)
  })
})
