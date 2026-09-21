import { describe, expect, it } from 'vitest'
import type { NaEvent } from '@/types/event'
import {
  TIME_HIGH_CONFIDENCE_MINUTES,
  classifyOccurrencePair,
  classifyStructuredInventory,
  normalizeVenueAlias,
  reconcileForDisplay,
} from './occurrenceReconcile'
import { parseBiletixPerformanceUrl } from './ticketUrl'

function ev(partial: Partial<NaEvent> & Pick<NaEvent, 'id' | 'title' | 'startsAt' | 'source'>): NaEvent {
  return {
    description: '',
    category: 'other',
    city: 'Çanakkale',
    citySlug: 'canakkale',
    venue: 'X',
    createdAt: '2026-09-21T00:00:00.000Z',
    status: 'published',
    ...partial,
  }
}

describe('occurrence reconciliation v1', () => {
  it('uses a 2-minute high-confidence clock window', () => {
    expect(TIME_HIGH_CONFIDENCE_MINUTES).toBe(2)
  })

  it('normalizes ÇOMÜ / İçdaş institutional aliases without stripping hall identity', () => {
    expect(normalizeVenueAlias('İçdaş Kongre Merkezi')).toBe('icdas')
    expect(normalizeVenueAlias('Çomü İçdaş Kongre Merkezi')).toBe('icdas')
    expect(normalizeVenueAlias('ÇOMÜ İçdaş')).toBe('icdas')
    expect(normalizeVenueAlias('Çanakkale Belediyesi Kültür Merkezi Salonu (Yeni Hizmet Binası)')).toBe(
      'canakkale belediyesi'
    )
    expect(normalizeVenueAlias('Salon A')).not.toBe(normalizeVenueAlias('Salon B'))
  })

  it('same title/date/time + venue alias is HIGH_CONFIDENCE', () => {
    const a = ev({
      id: 'biletix_1',
      source: 'biletix',
      title: 'Anadolu Ateşi',
      startsAt: '2026-11-30T17:30:00.000Z',
      venue: 'İçdaş Kongre Merkezi',
    })
    const b = ev({
      id: 'bubilet_1',
      source: 'bubilet',
      title: 'Anadolu Ateşi',
      startsAt: '2026-11-30T17:30:00.000Z',
      venue: 'Çomü İçdaş Kongre Merkezi',
    })
    expect(classifyOccurrencePair(a, b).confidence).toBe('HIGH_CONFIDENCE')
  })

  it('same title/date + different session time is DISTINCT', () => {
    const a = ev({
      id: 'biletix_1',
      source: 'biletix',
      title: 'Ayna',
      startsAt: '2026-10-17T15:00:00.000Z',
      venue: 'The Keep',
    })
    const b = ev({
      id: 'bubilet_1',
      source: 'bubilet',
      title: 'Ayna',
      startsAt: '2026-10-17T18:00:00.000Z',
      venue: 'The Keep',
    })
    expect(classifyOccurrencePair(a, b).confidence).toBe('DISTINCT')
  })

  it('same title/date/time + different city is DISTINCT', () => {
    const a = ev({
      id: 'biletix_1',
      source: 'biletix',
      title: 'Turne',
      citySlug: 'ankara',
      startsAt: '2026-10-10T17:00:00.000Z',
      venue: 'MEB Şura',
    })
    const b = ev({
      id: 'bubilet_1',
      source: 'bubilet',
      title: 'Turne',
      citySlug: 'istanbul',
      city: 'İstanbul',
      startsAt: '2026-10-10T17:00:00.000Z',
      venue: 'MEB Şura',
    })
    expect(classifyOccurrencePair(a, b).confidence).toBe('DISTINCT')
  })

  it('similar venue with insufficient evidence stays AMBIGUOUS', () => {
    const a = ev({
      id: 'biletix_1',
      source: 'biletix',
      title: 'Gece',
      startsAt: '2026-10-01T18:00:00.000Z',
      venue: 'Sahne',
    })
    const b = ev({
      id: 'bubilet_1',
      source: 'bubilet',
      title: 'Gece',
      startsAt: '2026-10-01T18:00:00.000Z',
      venue: 'Sahne X',
    })
    expect(classifyOccurrencePair(a, b).confidence).toBe('AMBIGUOUS')
  })

  it('collapses a Biletix/Bubilet HIGH pair to one display row and keeps both ids in provenance', () => {
    const a = ev({
      id: 'biletix_hyd1d3',
      source: 'biletix',
      title: 'Anadolu Ateşi',
      startsAt: '2026-11-30T17:30:00.000Z',
      venue: 'İçdaş Kongre Merkezi',
      ticketUrl: 'https://www.biletix.com/etkinlik/5RG81/TURKIYE/tr',
      coverImageUrl: 'https://www.biletix.com/static/images/live/event/eventimages/960x540/a.png',
    })
    const b = ev({
      id: 'bubilet_1tijtsx',
      source: 'bubilet',
      title: 'Anadolu Ateşi',
      startsAt: '2026-11-30T17:30:00.000Z',
      venue: 'Çomü İçdaş Kongre Merkezi',
      ticketUrl: 'https://www.bubilet.com.tr/canakkale/etkinlik/anadolu-atesi/seans/271661',
      coverImageUrl: 'https://cdn.bubilet.com.tr/files/Etkinlik/anadolu.png',
    })
    const result = reconcileForDisplay([a, b])
    expect(result.events).toHaveLength(1)
    expect(result.suppressedDisplayCards).toBe(1)
    expect(result.providerRecordsDeleted).toBe(0)
    expect([a.id, b.id]).toContain(result.events[0].id)
  })

  it('does not treat unverified /001 as fabricated performance certainty', () => {
    expect(parseBiletixPerformanceUrl('https://www.biletix.com/etkinlik/5RG81/TURKIYE/tr')).toBeNull()
    const unverified = parseBiletixPerformanceUrl('https://www.biletix.com/performance/5RG81/001/TURKIYE/tr')
    expect(unverified?.performanceIndex).toBe('001')
  })

  it('maps structured categories without keyword deletion', () => {
    expect(classifyStructuredInventory({ category: 'concert' })).toBe('LIVE_EVENT')
    expect(classifyStructuredInventory({ category: 'exhibition' })).toBe('MUSEUM_ADMISSION')
    expect(classifyStructuredInventory({ category: 'other' })).toBe('UNKNOWN')
  })
})
