/**
 * READ-ONLY Task 19 dry-run — asserts repaired semantics for known
 * Production contradiction snapshots (prior audit). No Firestore I/O.
 */
import { describe, expect, it } from 'vitest'
import { applyCanonicalArticleGeoWrite } from '@/lib/geo/canonicalArticleGeoWrite'

const contradictions = [
  {
    id: '7fn8168BPfm9h40xc1pA',
    city: 'Antalya',
    citySlug: 'antalya',
    location: { city: 'Mersin', district: 'Akdeniz', country: 'Türkiye', lat: 0, lng: 0 },
    canonicalGeoId: 'TR:mersin:akdeniz',
    expectCitySlug: 'antalya',
  },
  {
    id: '8ZwsBqC6y5NQ9ETNWe1K',
    city: 'Mersin',
    citySlug: 'mersin',
    location: { city: 'Mardin', district: 'Mazıdağı', country: 'Türkiye', lat: 0, lng: 0 },
    canonicalGeoId: 'TR:mardin:mazidagi',
    expectCitySlug: 'mersin',
  },
  {
    id: 'oyh5Abyp499BINNsKRoc',
    city: 'Osmaniye',
    citySlug: 'osmaniye',
    location: { city: 'Düzce', district: 'Merkez', country: 'Türkiye', lat: 0, lng: 0 },
    canonicalGeoId: 'TR:duzce:merkez',
    expectCitySlug: 'osmaniye',
  },
  {
    id: 'zkafJ9dBZwMI2zqKimTJ',
    city: 'Antalya',
    citySlug: 'antalya',
    location: { city: 'Düzce', district: 'Merkez', country: 'Türkiye', lat: 0, lng: 0 },
    canonicalGeoId: 'TR:duzce:merkez',
    expectCitySlug: 'antalya',
  },
  {
    id: 'jJUihos910Xb6VEGFee8',
    city: 'Kahramanmaraş',
    citySlug: 'kahramanmaras',
    location: { city: 'Kırşehir', district: 'Akpınar', country: 'Türkiye', lat: 0, lng: 0 },
    canonicalGeoId: 'TR:kirsehir:akpinar',
    expectCitySlug: 'kahramanmaras',
  },
] as const

describe('Task 19 Production contradiction dry-run (read-only)', () => {
  for (const d of contradictions) {
    it(`${d.id}: top-level CMS intent wins; stale canonical/location cleared`, () => {
      const r = applyCanonicalArticleGeoWrite(
        {
          city: d.city,
          citySlug: d.citySlug,
          district: '',
          districtSlug: '',
          location: d.location,
          canonicalGeoId: d.canonicalGeoId,
          geoResolutionLevel: 'DISTRICT_EXACT',
          country: 'Türkiye',
        },
        {
          city: d.city,
          citySlug: d.citySlug,
          district: '',
          districtSlug: '',
        },
        { editorialGeoLocked: true, rejectInvalidCompound: true }
      )
      expect(r.ok).toBe(true)
      if (!r.ok) return
      // Authority: top-level citySlug/districtSlug (current Feed / last CMS intent)
      expect(r.state.citySlug).toBe(d.expectCitySlug)
      expect(r.state.districtSlug).toBe('')
      expect(r.state.canonicalGeoId).toBeNull()
      expect(r.state.geoResolutionLevel).toBe('PROVINCE_ONLY')
      expect(r.state.location?.city?.toLowerCase()).not.toBe(d.location.city.toLowerCase())
      expect(r.state.location?.district).toBeUndefined()
    })
  }
})
