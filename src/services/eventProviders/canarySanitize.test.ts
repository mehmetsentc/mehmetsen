import { describe, expect, it } from 'vitest'
import type { NaEvent } from '@/types/event'
import { canaryWriteRejectReason, clampDistrictToProvince, prepareCanaryOccurrences } from './canarySanitize'

function ev(partial: Partial<NaEvent> & Pick<NaEvent, 'title' | 'startsAt' | 'source'>): NaEvent {
  return {
    id: partial.id ?? `${partial.source}_x`,
    description: '',
    category: 'other',
    city: 'Çanakkale',
    citySlug: 'canakkale',
    venue: 'X',
    ticketUrl: 'https://www.biletix.com/etkinlik/ABC12',
    createdAt: '2026-09-21T00:00:00.000Z',
    status: 'published',
    ...partial,
  }
}

describe('canary sanitize', () => {
  it('keeps a deterministic Çanakkale district and nulls foreign slugs', () => {
    expect(clampDistrictToProvince(ev({ title: 'A', startsAt: '2026-10-01T18:00:00.000Z', source: 'biletix', districtSlug: 'merkez' }), 'canakkale').districtSlug).toBe('merkez')
    expect(clampDistrictToProvince(ev({ title: 'A', startsAt: '2026-10-01T18:00:00.000Z', source: 'biletix', districtSlug: 'yenice' }), 'canakkale').districtSlug).toBe('yenice')
    expect(clampDistrictToProvince(ev({ title: 'A', startsAt: '2026-10-01T18:00:00.000Z', source: 'biletix', districtSlug: 'yenishehir' }), 'canakkale').districtSlug).toBeUndefined()
    expect(clampDistrictToProvince(ev({ title: 'A', startsAt: '2026-10-01T18:00:00.000Z', source: 'biletix', districtSlug: 'cankaya' }), 'canakkale').districtSlug).toBeUndefined()
  })

  it('rejects wrong province, missing start, generic ticket, and Ticketmaster', () => {
    expect(canaryWriteRejectReason(ev({ title: 'A', startsAt: '2026-10-01T18:00:00.000Z', source: 'biletix', citySlug: 'istanbul' }), 'canakkale')).toBe('invalid_province')
    expect(canaryWriteRejectReason(ev({ title: 'A', startsAt: '', source: 'biletix' }), 'canakkale')).toBe('invalid_start')
    expect(canaryWriteRejectReason(ev({ title: 'A', startsAt: '2026-10-01T18:00:00.000Z', source: 'biletix', ticketUrl: 'https://www.biletix.com/' }), 'canakkale')).toBe('invalid_ticket')
    expect(canaryWriteRejectReason(ev({ title: 'A', startsAt: '2026-10-01T18:00:00.000Z', source: 'ticketmaster' }), 'canakkale')).toBe('wrong_source')
  })

  it('accepts Biletix / Bubilet / BiletimGO event-specific tickets in Çanakkale', () => {
    const ready = prepareCanaryOccurrences(
      [
        ev({
          id: 'biletix_1',
          title: 'A',
          startsAt: '2026-10-01T18:00:00.000Z',
          source: 'biletix',
          ticketUrl: 'https://www.biletix.com/performance/ABC12/001/TURKIYE/tr',
        }),
        ev({
          id: 'bubilet_1',
          title: 'B',
          startsAt: '2026-10-02T18:00:00.000Z',
          source: 'bubilet',
          ticketUrl: 'https://www.bubilet.com.tr/canakkale/etkinlik/ornek/seans/99',
        }),
        ev({
          id: 'biletimgo_1',
          title: 'C',
          startsAt: '2026-10-03T18:00:00.000Z',
          source: 'biletimgo',
          ticketUrl: 'https://www.biletimgo.com/etkinlik/ornek-1',
        }),
      ],
      'canakkale'
    )
    expect(ready.writeable.map((e) => e.id)).toEqual(['biletix_1', 'bubilet_1', 'biletimgo_1'])
    expect(ready.skippedInvalid).toEqual([])
  })
})
