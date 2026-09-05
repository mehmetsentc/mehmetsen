/**
 * CMS atomic canonical geo write boundary tests.
 * Persistence consistency only — no geoRelevance / proximity imports.
 */
import { describe, expect, it } from 'vitest'
import {
  applyCanonicalArticleGeoWrite,
  canonicalArticleGeoToPersistFields,
  canonicalGeoIdentityConsistent,
  geoPatchTouchesIdentity,
  mergeCanonicalArticleGeoPatch,
  type ExistingCanonicalArticleGeo,
} from '@/lib/geo/canonicalArticleGeoWrite'
import { finalizeCanonicalArticleGeo } from '@/lib/geo/finalizeCanonicalArticleGeo'

const mersinAkdeniz: ExistingCanonicalArticleGeo = {
  city: 'Mersin',
  citySlug: 'mersin',
  district: 'Akdeniz',
  districtSlug: 'akdeniz',
  locality: '',
  canonicalGeoId: 'TR:mersin:akdeniz',
  geoResolutionLevel: 'DISTRICT_EXACT',
  geoResolutionSource: 'compound_slugs',
  location: {
    city: 'Mersin',
    district: 'Akdeniz',
    country: 'Türkiye',
    lat: 0,
    lng: 0,
  },
  country: 'Türkiye',
  countrySlug: '',
}

describe('7fn bad sequence reproduction + repair', () => {
  it('1. reproduces Production contradiction when geo fields update independently (pre-repair contract)', () => {
    // Simulate OLD broken behavior: top-level patch without touching location/canonicalGeoId
    const broken = {
      city: 'Antalya',
      citySlug: 'antalya',
      district: '',
      districtSlug: '',
      location: mersinAkdeniz.location,
      canonicalGeoId: mersinAkdeniz.canonicalGeoId,
    }
    expect(canonicalGeoIdentityConsistent(broken)).toBe(false)
  })

  it('2. same sequence is consistent after applyCanonicalArticleGeoWrite', () => {
    const result = applyCanonicalArticleGeoWrite(
      mersinAkdeniz,
      {
        city: 'Antalya',
        citySlug: 'antalya',
        // district omitted — city change drops invalid residual district
      },
      { rejectInvalidCompound: true, editorialGeoLocked: true }
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(true)
    expect(result.state.citySlug).toBe('antalya')
    expect(result.state.districtSlug).toBe('')
    expect(result.state.canonicalGeoId).toBeNull()
    expect(result.state.geoResolutionLevel).toBe('PROVINCE_ONLY')
    expect(result.state.location?.city).toMatch(/Antalya/i)
    expect(result.state.location?.district).toBeUndefined()
    expect(canonicalGeoIdentityConsistent(result.state)).toBe(true)
  })
})

describe('PATCH omit vs clear', () => {
  it('3–4. headline-only / no geo keys → preserve (changed=false)', () => {
    const r = applyCanonicalArticleGeoWrite(mersinAkdeniz, {}, {})
    expect(r.ok && r.changed === false).toBe(true)
    if (!r.ok) return
    expect(r.state.canonicalGeoId).toBe('TR:mersin:akdeniz')
    expect(r.state.citySlug).toBe('mersin')
    expect(r.state.districtSlug).toBe('akdeniz')
  })

  it('3b. CMS re-sends same citySlug (AdminNewsEditor) → no geo rewrite', () => {
    const withCoords: ExistingCanonicalArticleGeo = {
      ...mersinAkdeniz,
      location: {
        city: 'Mersin',
        district: 'Akdeniz',
        country: 'Türkiye',
        lat: 36.8,
        lng: 34.6,
      },
    }
    const r = applyCanonicalArticleGeoWrite(
      withCoords,
      {
        city: 'Mersin',
        citySlug: 'mersin',
        district: 'Akdeniz',
        districtSlug: 'akdeniz',
        country: 'Türkiye',
        countrySlug: '',
      },
      { editorialGeoLocked: true, rejectInvalidCompound: true }
    )
    expect(r.ok && r.changed === false).toBe(true)
    if (!r.ok) return
    expect(r.state.location?.lat).toBe(36.8)
    expect(r.state.location?.lng).toBe(34.6)
    expect(r.state.canonicalGeoId).toBe('TR:mersin:akdeniz')
  })

  it('geoPatchTouchesIdentity false for empty patch', () => {
    expect(geoPatchTouchesIdentity({})).toBe(false)
    expect(geoPatchTouchesIdentity({ citySlug: 'antalya' })).toBe(true)
  })

  it('7. explicit geo clear clears dependents', () => {
    const r = applyCanonicalArticleGeoWrite(
      mersinAkdeniz,
      { city: '', citySlug: '', district: '', districtSlug: '', locality: '' },
      { editorialGeoLocked: true }
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.citySlug).toBe('')
    expect(r.state.districtSlug).toBe('')
    expect(r.state.canonicalGeoId).toBeNull()
    expect(r.state.location).toBeNull()
    expect(r.state.geoResolutionLevel).toBe('NONE')
  })

  it('8. omitted district preserves when city unchanged', () => {
    const r = applyCanonicalArticleGeoWrite(
      mersinAkdeniz,
      { city: 'Mersin' }, // city display tweak only, same slug not in patch
      { editorialGeoLocked: true }
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.districtSlug).toBe('akdeniz')
    expect(r.state.canonicalGeoId).toBe('TR:mersin:akdeniz')
  })
})

describe('human authority + compounds', () => {
  it('5–6. explicit human city/district change is atomic', () => {
    const r = applyCanonicalArticleGeoWrite(
      mersinAkdeniz,
      {
        city: 'Antalya',
        citySlug: 'antalya',
        district: 'Manavgat',
        districtSlug: 'manavgat',
      },
      { editorialGeoLocked: true, rejectInvalidCompound: true }
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.citySlug).toBe('antalya')
    expect(r.state.districtSlug).toBe('manavgat')
    expect(r.state.canonicalGeoId).toBe('TR:antalya:manavgat')
    expect(r.state.location?.city).toMatch(/Antalya/i)
    expect(r.state.location?.district).toMatch(/Manavgat/i)
  })

  it('9–12. compound validation', () => {
    const biga = applyCanonicalArticleGeoWrite(
      {},
      { citySlug: 'canakkale', city: 'Çanakkale', districtSlug: 'biga', district: 'Biga' },
      { rejectInvalidCompound: true, editorialGeoLocked: true }
    )
    expect(biga.ok && biga.state.canonicalGeoId).toBe('TR:canakkale:biga')

    const bal = applyCanonicalArticleGeoWrite(
      {},
      { citySlug: 'balikesir', districtSlug: 'gonen', district: 'Gönen' },
      { rejectInvalidCompound: true, editorialGeoLocked: true }
    )
    expect(bal.ok && bal.state.canonicalGeoId).toBe('TR:balikesir:gonen')

    const isp = applyCanonicalArticleGeoWrite(
      {},
      { citySlug: 'isparta', districtSlug: 'gonen' },
      { rejectInvalidCompound: true, editorialGeoLocked: true }
    )
    expect(isp.ok && isp.state.canonicalGeoId).toBe('TR:isparta:gonen')

    const bad = applyCanonicalArticleGeoWrite(
      {},
      { citySlug: 'canakkale', districtSlug: 'gonen' },
      { rejectInvalidCompound: true, editorialGeoLocked: true }
    )
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.code).toBe('INVALID_COMPOUND_GEO')
  })

  it('13–15. localities + Çardak', () => {
    const side = applyCanonicalArticleGeoWrite(
      {},
      { citySlug: 'antalya', locality: 'Side' },
      { editorialGeoLocked: true }
    )
    expect(side.ok).toBe(true)
    if (!side.ok) return
    expect(side.state.districtSlug).toBe('manavgat')
    expect(side.state.canonicalGeoId).toBe('TR:antalya:manavgat')

    const cardakCk = applyCanonicalArticleGeoWrite(
      {},
      { citySlug: 'canakkale', locality: 'Çardak' },
      { editorialGeoLocked: true }
    )
    expect(cardakCk.ok).toBe(true)
    if (!cardakCk.ok) return
    expect(cardakCk.state.districtSlug).toBe('lapseki')

    const cardakDz = applyCanonicalArticleGeoWrite(
      {},
      { citySlug: 'denizli', district: 'Çardak', districtSlug: 'cardak' },
      { rejectInvalidCompound: true, editorialGeoLocked: true }
    )
    expect(cardakDz.ok).toBe(true)
    if (!cardakDz.ok) return
    expect(cardakDz.state.canonicalGeoId).toBe('TR:denizli:cardak')
  })

  it('16. unicode normalize', () => {
    const r = applyCanonicalArticleGeoWrite(
      {},
      { citySlug: 'istanbul', districtSlug: 'beşiktaş', district: 'Beşiktaş' },
      { editorialGeoLocked: true }
    )
    expect(r.ok && r.state.districtSlug).toBe('besiktas')
    if (!r.ok) return
    expect(r.state.canonicalGeoId).toBe('TR:istanbul:besiktas')
  })

  it('17–18. province-only; no district invention', () => {
    const r = applyCanonicalArticleGeoWrite(
      {},
      { citySlug: 'antalya', city: 'Antalya', districtSlug: '', district: '' },
      { editorialGeoLocked: true }
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.citySlug).toBe('antalya')
    expect(r.state.districtSlug).toBe('')
    expect(r.state.canonicalGeoId).toBeNull()
    expect(r.state.geoResolutionLevel).toBe('PROVINCE_ONLY')
  })

  it('19. centroid independence — Ayvacık identity valid', () => {
    const r = applyCanonicalArticleGeoWrite(
      {},
      { citySlug: 'canakkale', districtSlug: 'ayvacik', district: 'Ayvacık' },
      { editorialGeoLocked: true }
    )
    expect(r.ok && r.state.canonicalGeoId).toBe('TR:canakkale:ayvacik')
  })

  it('20. newsroom golden Ankara/Çankaya', () => {
    const r = finalizeCanonicalArticleGeo({
      articleIsAbroad: false,
      editorialGeoLocked: true,
      forcedCity: 'Ankara',
      forcedCitySlug: 'ankara',
      forcedDistrict: 'Çankaya',
    })
    expect(r.canonicalGeoId).toBe('TR:ankara:cankaya')
    expect(r.districtSlug).toBe('cankaya')
  })

  it('26. location/top-level/canonicalGeoId agree after write', () => {
    const r = applyCanonicalArticleGeoWrite(
      {},
      { citySlug: 'osmaniye', districtSlug: 'duzici', district: 'Düziçi' },
      { editorialGeoLocked: true }
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(canonicalGeoIdentityConsistent(r.state)).toBe(true)
    expect(r.state.location?.city).toBeTruthy()
    const fields = canonicalArticleGeoToPersistFields(r.state)
    expect(fields.canonicalGeoId).toBe(r.state.canonicalGeoId)
    expect(fields.citySlug).toBe(r.state.citySlug)
  })
})

describe('merge helpers', () => {
  it('citySlug change drops foreign residual district when district omitted', () => {
    const { intended } = mergeCanonicalArticleGeoPatch(mersinAkdeniz, {
      citySlug: 'antalya',
      city: 'Antalya',
    })
    expect(intended.citySlug).toBe('antalya')
    expect(intended.districtSlug).toBe('')
  })
})

describe('slug-only CMS docs', () => {
  it('14. adana+seyhan+null geoId materializes on write boundary', () => {
    const r = applyCanonicalArticleGeoWrite(
      {
        city: 'Adana',
        citySlug: 'adana',
        districtSlug: 'seyhan',
        district: '',
        canonicalGeoId: null,
      },
      { citySlug: 'adana', districtSlug: 'seyhan', city: 'Adana' },
      { editorialGeoLocked: true }
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.canonicalGeoId).toBe('TR:adana:seyhan')
    expect(r.state.districtSlug).toBe('seyhan')
    expect(canonicalGeoIdentityConsistent(r.state)).toBe(true)
  })
})
