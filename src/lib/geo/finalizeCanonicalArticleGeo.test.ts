/**
 * Canonical geo persistence finalize — future ingest path tests.
 * Persistence-only: no geoRelevance / centroid ranking imports.
 */
import { describe, expect, it } from 'vitest'
import {
  applyForcedDistrictDisplay,
  canonicalGeoPersistFingerprint,
  finalizeCanonicalArticleGeo,
} from '@/lib/geo/finalizeCanonicalArticleGeo'
import { resolveArticleGeo } from '@/lib/geo/resolveArticleGeo'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isNfRankLiveEnabled } from '@/lib/feed/featureFlag'
import { USER_FEATURE_DEPENDENCIES } from '@/lib/user/userRolloutMatrix'

describe('finalizeCanonicalArticleGeo persistence', () => {
  it('1–4. editorial / forcedDistrict survives with districtSlug + compound id', () => {
    const r = finalizeCanonicalArticleGeo({
      articleIsAbroad: false,
      editorialGeoLocked: true,
      city: null,
      citySlug: null,
      district: null,
      districtSlug: null,
      forcedCity: 'Çanakkale',
      forcedCitySlug: 'canakkale',
      forcedDistrict: 'Biga',
    })
    expect(r.citySlug).toBe('canakkale')
    expect(r.districtSlug).toBe('biga')
    expect(r.district).toBe('Biga')
    expect(r.canonicalGeoId).toBe('TR:canakkale:biga')
    expect(r.geoResolutionLevel).toMatch(/DISTRICT_/)
  })

  it('5–9. compound validation + Gönen collisions', () => {
    expect(
      finalizeCanonicalArticleGeo({
        articleIsAbroad: false,
        city: 'Balıkesir',
        citySlug: 'balikesir',
        district: 'Gönen',
        districtSlug: '',
      }).canonicalGeoId
    ).toBe('TR:balikesir:gonen')

    expect(
      finalizeCanonicalArticleGeo({
        articleIsAbroad: false,
        citySlug: 'isparta',
        district: 'Gönen',
        districtSlug: null,
      }).canonicalGeoId
    ).toBe('TR:isparta:gonen')

    const invalid = finalizeCanonicalArticleGeo({
      articleIsAbroad: false,
      citySlug: 'canakkale',
      district: 'Gönen',
      districtSlug: 'gonen',
    })
    expect(invalid.canonicalGeoId).toBeNull()
    expect(invalid.citySlug).toBe('canakkale')
    expect(invalid.districtSlug).toBe('')
    expect(invalid.geoResolutionLevel).toBe('PROVINCE_ONLY')
  })

  it('10–11. unicode + Turkish display', () => {
    const r2 = finalizeCanonicalArticleGeo({
      articleIsAbroad: false,
      city: 'İstanbul',
      citySlug: 'istanbul',
      district: 'Beşiktaş',
      districtSlug: 'beşiktaş',
    })
    expect(r2.districtSlug).toBe('besiktas')
    expect(r2.citySlug).toBe('istanbul')
    expect(r2.district).toMatch(/Beşiktaş|Besiktas/i)
    expect(r2.canonicalGeoId).toBe('TR:istanbul:besiktas')
  })

  it('12–21. verified localities + Çardak collision', () => {
    const side = finalizeCanonicalArticleGeo({
      articleIsAbroad: false,
      citySlug: 'antalya',
      city: 'Antalya',
      district: null,
      districtSlug: null,
      locality: 'Side',
    })
    expect(side.canonicalGeoId).toBe('TR:antalya:manavgat')
    expect(side.locality).toBe('Side')
    expect(side.districtSlug).toBe('manavgat')

    expect(
      finalizeCanonicalArticleGeo({
        articleIsAbroad: false,
        citySlug: 'canakkale',
        locality: 'Çardak',
        district: null,
        districtSlug: null,
      }).canonicalGeoId
    ).toBe('TR:canakkale:lapseki')

    expect(
      finalizeCanonicalArticleGeo({
        articleIsAbroad: false,
        citySlug: 'denizli',
        district: 'Çardak',
        districtSlug: null,
      }).canonicalGeoId
    ).toBe('TR:denizli:cardak')

    const beldes: Array<[string, string, string]> = [
      ['canakkale', 'Küçükkuyu', 'TR:canakkale:ayvacik'],
      ['canakkale', 'Geyikli', 'TR:canakkale:ezine'],
      ['canakkale', 'Evreşe', 'TR:canakkale:gelibolu'],
      ['canakkale', 'Terzialan', 'TR:canakkale:can'],
      ['canakkale', 'Karabiga', 'TR:canakkale:biga'],
      ['canakkale', 'Gümüşçay', 'TR:canakkale:biga'],
    ]
    for (const [prov, loc, geoId] of beldes) {
      expect(
        finalizeCanonicalArticleGeo({
          articleIsAbroad: false,
          citySlug: prov,
          locality: loc,
          district: null,
          districtSlug: null,
        }).canonicalGeoId
      ).toBe(geoId)
    }
  })

  it('22–23. centroid independence — identity persists without ranking/centroids', () => {
    const murat = finalizeCanonicalArticleGeo({
      articleIsAbroad: false,
      citySlug: 'antalya',
      district: 'Muratpaşa',
      districtSlug: 'muratpasa',
    })
    expect(murat.canonicalGeoId).toBe('TR:antalya:muratpasa')
    expect(murat.districtSlug).toBe('muratpasa')

    const ayv = finalizeCanonicalArticleGeo({
      articleIsAbroad: false,
      citySlug: 'canakkale',
      districtSlug: 'ayvacik',
      district: 'Ayvacık',
    })
    expect(ayv.canonicalGeoId).toBe('TR:canakkale:ayvacik')
    expect(ayv.districtSlug).toBe('ayvacik')
  })

  it('24–26. province-only / non-local / no false localize', () => {
    const prov = finalizeCanonicalArticleGeo({
      articleIsAbroad: false,
      citySlug: 'canakkale',
      district: null,
      districtSlug: null,
    })
    expect(prov.geoResolutionLevel).toBe('PROVINCE_ONLY')
    expect(prov.canonicalGeoId).toBeNull()

    expect(
      finalizeCanonicalArticleGeo({
        articleIsAbroad: true,
        citySlug: 'canakkale',
        forcedDistrict: 'Biga',
        district: 'Biga',
        districtSlug: null,
      }).canonicalGeoId
    ).toBeNull()

    expect(
      applyForcedDistrictDisplay({
        geoDistrict: 'Merkez',
        forcedDistrict: 'Biga',
        editorialGeoLocked: false,
      })
    ).toBe('Merkez')
    expect(
      applyForcedDistrictDisplay({
        geoDistrict: null,
        forcedDistrict: 'Biga',
        editorialGeoLocked: false,
      })
    ).toBe('Biga')
  })

  it('27–28. Firestore/PG field shape (serializer contract)', () => {
    const r = finalizeCanonicalArticleGeo({
      articleIsAbroad: false,
      citySlug: 'canakkale',
      forcedDistrict: 'Biga',
      district: 'Biga',
      districtSlug: '',
    })
    const fsDoc = {
      city: r.city,
      citySlug: r.citySlug,
      district: r.district,
      districtSlug: r.districtSlug,
      locality: r.locality || undefined,
      canonicalGeoId: r.canonicalGeoId,
    }
    const pgMirror = {
      cityName: r.city,
      citySlug: r.citySlug,
      districtName: r.district,
      districtSlug: r.districtSlug,
    }
    expect(fsDoc.districtSlug).toBe('biga')
    expect(fsDoc.canonicalGeoId).toBe('TR:canakkale:biga')
    expect(pgMirror.districtSlug).toBe('biga')
    expect(pgMirror.citySlug).toBe('canakkale')
  })

  it('29–31. idempotency + editorial wins', () => {
    const input = {
      articleIsAbroad: false,
      editorialGeoLocked: true,
      city: 'Antalya',
      citySlug: 'antalya',
      district: null as string | null,
      districtSlug: null as string | null,
      forcedCity: 'Antalya',
      forcedCitySlug: 'antalya',
      forcedDistrict: 'Manavgat',
    }
    const a = finalizeCanonicalArticleGeo(input)
    const b = finalizeCanonicalArticleGeo(input)
    expect(canonicalGeoPersistFingerprint(a)).toBe(canonicalGeoPersistFingerprint(b))
    expect(a.canonicalGeoId).toBe('TR:antalya:manavgat')

    const editorWins = finalizeCanonicalArticleGeo({
      ...input,
      city: 'Antalya',
      citySlug: 'antalya',
      district: 'Kepez',
      districtSlug: 'kepez',
      forcedDistrict: 'Manavgat',
      editorialGeoLocked: true,
    })
    expect(editorWins.canonicalGeoId).toBe('TR:antalya:manavgat')
  })

  it('9–10. draftToPublished / updatePublishedNews preserve districtSlug (source contract)', () => {
    const draftSrc = readFileSync(join(process.cwd(), 'src/services/newsDraftService.ts'), 'utf8')
    // Shared normalizeDraftGeoFields → atomic geo write boundary
    expect(draftSrc).toContain('normalizeDraftGeoFields')
    expect(draftSrc).toContain('applyCanonicalArticleGeoWrite')
    expect(draftSrc).toMatch(/districtSlug:\s*\(geoFields\.districtSlug/)
    expect(draftSrc).toContain('canonicalGeoId')
  })

  it('32–39. raw untouched + safety markers + no proximity ranking wiring', () => {
    const pipelineSrc = readFileSync(
      join(process.cwd(), 'src/services/newsroom/pipeline.ts'),
      'utf8'
    )
    expect(pipelineSrc).toContain('finalizeCanonicalArticleGeo')
    expect(pipelineSrc).not.toMatch(/raw_articles.*update|updateRawArticle/i)
    expect(pipelineSrc).not.toContain('LOCAL_NEARBY')
    expect(pipelineSrc).not.toContain('geoRelevance')
    delete process.env.FEED_V2_NFRANK_ENABLED
    expect(isNfRankLiveEnabled()).toBe(false)
    expect(USER_FEATURE_DEPENDENCIES.NFRANK_V1).toEqual([
      'SMART_FEED',
      'SMART_FEED_RANKING_V1',
    ])
    expect(resolveArticleGeo({ citySlug: 'canakkale', district: 'Biga' }).canonicalGeoId).toBe(
      'TR:canakkale:biga'
    )
  })
})
