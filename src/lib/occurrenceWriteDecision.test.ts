import { describe, expect, it } from 'vitest'
import { filterOccurrenceWriteEligible, isOccurrenceWriteEligibleSource } from '@/lib/eventSyncRoutePolicy'
import {
  classifyOccurrenceWrite,
  isMaterialOccurrenceChange,
  planOccurrenceWrites,
} from '@/lib/occurrenceWriteDecision'
import { isMaterialBiletixDestinationChange, parseBiletixEventCode } from '@/services/eventProviders/ticketUrl'
import type { NaEvent } from '@/types/event'

function event(partial: Partial<NaEvent> & Pick<NaEvent, 'id'>): NaEvent {
  return {
    title: 'Kalben',
    description: 'short',
    category: 'concert',
    city: 'İstanbul',
    citySlug: 'istanbul',
    venue: 'Zorlu PSM',
    startsAt: '2026-10-01T18:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
    status: 'published',
    source: 'biletix',
    ticketUrl: 'https://www.biletix.com/etkinlik/ABC123/TURKIYE/tr',
    ...partial,
  }
}

describe('Biletix ticket destination comparison', () => {
  it('treats /etkinlik/CODE and /performance/CODE/001 as the same event code', () => {
    expect(parseBiletixEventCode('https://www.biletix.com/etkinlik/ABC123/TURKIYE/tr')).toBe('ABC123')
    expect(parseBiletixEventCode('https://www.biletix.com/performance/ABC123/001/TURKIYE/tr')).toBe(
      'ABC123'
    )
    expect(
      isMaterialBiletixDestinationChange(
        'https://www.biletix.com/etkinlik/ABC123/TURKIYE/tr',
        'https://www.biletix.com/performance/ABC123/001/TURKIYE/tr'
      )
    ).toBe(false)
  })

  it('does not treat same-code /performance/CODE/009 as a destination change', () => {
    expect(
      isMaterialBiletixDestinationChange(
        'https://www.biletix.com/etkinlik/ABC123/TURKIYE/tr',
        'https://www.biletix.com/performance/ABC123/009/TURKIYE/tr'
      )
    ).toBe(false)
  })

  it('treats a different event code as a material destination change', () => {
    expect(
      isMaterialBiletixDestinationChange(
        'https://www.biletix.com/etkinlik/ABC123/TURKIYE/tr',
        'https://www.biletix.com/performance/XYZ999/001/TURKIYE/tr'
      )
    ).toBe(true)
  })

  it('does not claim equality for malformed or unparseable destinations', () => {
    expect(
      isMaterialBiletixDestinationChange(
        'https://www.biletix.com/not-a-ticket',
        'https://www.biletix.com/performance/ABC123/001/TURKIYE/tr'
      )
    ).toBe(true)
    expect(isMaterialBiletixDestinationChange('not-a-url', 'also-not-a-url')).toBe(true)
    expect(isMaterialBiletixDestinationChange('same-garbage', 'same-garbage')).toBe(false)
  })
})

describe('occurrence material write decision', () => {
  it('does not update when only the ticket URL representation changes to /001', () => {
    const stored = event({ id: 'biletix_abc' })
    const incoming = event({
      id: 'biletix_abc',
      ticketUrl: 'https://www.biletix.com/performance/ABC123/001/TURKIYE/tr',
    })
    expect(classifyOccurrenceWrite(incoming, stored)).toBe('skip')
    expect(isMaterialOccurrenceChange(incoming, stored)).toBe(false)
  })

  it('does not update when only the ticket URL representation changes to /009', () => {
    const stored = event({ id: 'biletix_abc' })
    const incoming = event({
      id: 'biletix_abc',
      ticketUrl: 'https://www.biletix.com/performance/ABC123/009/TURKIYE/tr',
    })
    expect(classifyOccurrenceWrite(incoming, stored)).toBe('skip')
  })

  it('updates when the Biletix event code changes', () => {
    const stored = event({ id: 'biletix_abc' })
    const incoming = event({
      id: 'biletix_abc',
      ticketUrl: 'https://www.biletix.com/performance/XYZ999/001/TURKIYE/tr',
    })
    expect(classifyOccurrenceWrite(incoming, stored)).toBe('update')
  })

  it('does not treat description-only difference as a material update', () => {
    const stored = event({ id: 'biletix_abc', description: 'short' })
    const incoming = event({ id: 'biletix_abc', description: 'much longer occurrence copy' })
    expect(classifyOccurrenceWrite(incoming, stored)).toBe('skip')
  })

  it('does not treat image-only difference as a material update', () => {
    const stored = event({ id: 'biletix_abc', coverImageUrl: 'https://cdn.example/a.jpg' })
    const incoming = event({ id: 'biletix_abc', coverImageUrl: 'https://cdn.example/b.jpg?w=800' })
    expect(classifyOccurrenceWrite(incoming, stored)).toBe('skip')
  })

  it('holds cancelled → published and does not write', () => {
    const stored = event({ id: 'biletix_abc', status: 'cancelled' })
    const incoming = event({ id: 'biletix_abc', status: 'published' })
    expect(classifyOccurrenceWrite(incoming, stored)).toBe('hold_cancelled_republish')
    const plan = planOccurrenceWrites([incoming], new Map([[stored.id, stored]]))
    expect(plan.wouldUpdate).toEqual([])
    expect(plan.wouldHoldCancelledRepublish.map((row) => row.id)).toEqual(['biletix_abc'])
    expect(plan.wouldSkipUnchanged.map((row) => row.id)).toEqual(['biletix_abc'])
    expect(plan.wouldDelete).toBe(0)
  })

  it('skips a published stable occurrence', () => {
    const stored = event({ id: 'biletix_abc' })
    const incoming = event({ id: 'biletix_abc' })
    expect(classifyOccurrenceWrite(incoming, stored)).toBe('skip')
  })

  it('updates on a real startsAt change', () => {
    const stored = event({ id: 'biletix_abc', startsAt: '2026-10-01T18:00:00.000Z' })
    const incoming = event({ id: 'biletix_abc', startsAt: '2026-10-02T18:00:00.000Z' })
    expect(classifyOccurrenceWrite(incoming, stored)).toBe('update')
  })

  it('updates on a real venue identity change', () => {
    const stored = event({ id: 'biletix_abc', venue: 'Zorlu PSM' })
    const incoming = event({ id: 'biletix_abc', venue: 'Volkswagen Arena' })
    expect(classifyOccurrenceWrite(incoming, stored)).toBe('update')
  })

  it('never emits deletion or cancellation from absence', () => {
    const incoming = event({ id: 'biletix_present' })
    const plan = planOccurrenceWrites([incoming], new Map())
    expect(plan.wouldInsert.map((row) => row.id)).toEqual(['biletix_present'])
    expect(plan.wouldDelete).toBe(0)
    expect(plan.wouldUpdate).toEqual([])
  })

  it('keeps Bubilet, BiletimGO, Ticketmaster, and unknown write-ineligible', () => {
    expect(isOccurrenceWriteEligibleSource('biletix')).toBe(true)
    expect(isOccurrenceWriteEligibleSource('bubilet')).toBe(false)
    expect(isOccurrenceWriteEligibleSource('biletimgo')).toBe(false)
    expect(isOccurrenceWriteEligibleSource('ticketmaster')).toBe(false)
    expect(isOccurrenceWriteEligibleSource('unknown')).toBe(false)
    expect(
      filterOccurrenceWriteEligible([
        { source: 'biletix' },
        { source: 'bubilet' },
        { source: 'biletimgo' },
        { source: 'ticketmaster' },
        { source: 'unknown' },
      ]).map((row) => row.source)
    ).toEqual(['biletix'])
  })
})
