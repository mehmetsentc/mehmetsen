import { describe, expect, it } from 'vitest'
import type { NaEvent } from '@/types/event'
import { collapseDisplayDuplicates } from './eventDedupe'

function ev(partial: Partial<NaEvent> & Pick<NaEvent, 'id' | 'title' | 'startsAt'>): NaEvent {
  return {
    description: '',
    category: 'concert',
    city: 'Antalya',
    citySlug: 'antalya',
    venue: 'Antalya Açıkhava',
    createdAt: '2026-09-21T00:00:00.000Z',
    status: 'published',
    ...partial,
  }
}

describe('collapseDisplayDuplicates', () => {
  it('collapses same-concert rows that only differ by poster and missing venue', () => {
    const a = ev({
      id: 'biletix_etkinlik',
      title: 'Hayko Cepkin',
      startsAt: '2026-09-26T18:00:00.000Z',
      ticketUrl: 'https://www.biletix.com/etkinlik/HYK26/TURKIYE/tr',
    })
    const b = ev({
      id: 'biletix_perf',
      title: 'Hayko Cepkin',
      startsAt: '2026-09-26T18:00:00.000Z',
      venue: '',
      category: 'other',
      ticketUrl: 'https://www.biletix.com/performance/HYK26/001/TURKIYE/tr',
    })
    expect(collapseDisplayDuplicates([a, b])).toHaveLength(1)
  })

  it('keeps two same-night sessions distinct', () => {
    const a = ev({
      id: 'early',
      title: 'Erol Evgin',
      startsAt: '2026-10-17T15:00:00.000Z',
    })
    const b = ev({
      id: 'late',
      title: 'Erol Evgin',
      startsAt: '2026-10-17T18:00:00.000Z',
    })
    expect(collapseDisplayDuplicates([a, b])).toHaveLength(2)
  })
})
