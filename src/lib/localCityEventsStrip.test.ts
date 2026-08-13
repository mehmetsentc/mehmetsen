import { describe, expect, it } from 'vitest'
import { filterLocalCityStripEvents } from '@/lib/localCityEventsStrip'
import type { NaEvent } from '@/types/event'

function makeEvent(overrides: Partial<NaEvent> = {}): NaEvent {
  return {
    id: 'evt-1',
    title: 'Test',
    category: 'cinema',
    city: 'Çanakkale',
    citySlug: 'canakkale',
    startsAt: '2026-08-10T17:00:00.000Z',
    status: 'published',
    tags: ['Sinema'],
    ...overrides,
  } as NaEvent
}

describe('filterLocalCityStripEvents', () => {
  it('returns all upcoming events when filter is all', () => {
    const nowIso = '2026-08-10T10:00:00.000Z'
    const events = [
      makeEvent({ id: 'a', category: 'concert', startsAt: '2026-08-11T18:00:00.000Z' }),
      makeEvent({ id: 'b', startsAt: '2026-08-10T17:00:00.000Z' }),
      makeEvent({
        id: 'cancelled',
        category: 'concert',
        status: 'cancelled',
        startsAt: '2026-08-10T18:00:00.000Z',
      }),
      makeEvent({
        id: 'draft',
        category: 'concert',
        status: 'draft',
        startsAt: '2026-08-10T19:00:00.000Z',
      }),
    ]
    expect(filterLocalCityStripEvents(events, 'all', nowIso).map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('keeps only Sinema-tagged cinema events within the near-term window', () => {
    const nowIso = '2026-08-10T10:00:00.000Z'
    const events = [
      makeEvent({ id: 'cinema-today', startsAt: '2026-08-10T17:00:00.000Z' }),
      makeEvent({
        id: 'paribu-tag',
        category: 'other',
        tags: ['Sinema'],
        startsAt: '2026-08-11T17:00:00.000Z',
      }),
      makeEvent({
        id: 'concert',
        category: 'concert',
        tags: [],
        startsAt: '2026-08-11T18:00:00.000Z',
      }),
      makeEvent({
        id: 'far-future',
        startsAt: '2026-08-25T17:00:00.000Z',
      }),
    ]

    expect(filterLocalCityStripEvents(events, 'cinema', nowIso).map((e) => e.id)).toEqual([
      'cinema-today',
      'paribu-tag',
    ])
  })
})
