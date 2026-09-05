/**
 * Canonical article geo resolution — persistence helpers only.
 * No geoRelevance / Haversine ranking imports.
 */
import { describe, expect, it } from 'vitest'
import { normalizeGeoSlug } from '@/lib/geo/normalizeGeoSlug'
import { resolveArticleGeo } from '@/lib/geo/resolveArticleGeo'
import { lookupVerifiedLocalityParent } from '@/constants/verifiedLocalityParents'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { USER_FEATURE_DEPENDENCIES } from '@/lib/user/userRolloutMatrix'
import { USER_ROLLOUT_FEATURE_KEYS } from '@/types/userRollout'
import { isNfRankLiveEnabled } from '@/lib/feed/featureFlag'

describe('unicode geo slug normalization', () => {
  it('1–4. Turkish district/province tokens → ASCII', () => {
    expect(normalizeGeoSlug('beşiktaş')).toBe('besiktas')
    expect(normalizeGeoSlug('başakşehir')).toBe('basaksehir')
    expect(normalizeGeoSlug('üsküdar')).toBe('uskudar')
    expect(normalizeGeoSlug('çanakkale')).toBe('canakkale')
    expect(normalizeGeoSlug('gönen')).toBe('gonen')
    expect(normalizeGeoSlug('ayvacık')).toBe('ayvacik')
    expect(normalizeGeoSlug('Muratpaşa')).toBe('muratpasa')
  })
})

describe('compound identity', () => {
  it('5. Gönen compound — never flat', () => {
    const bal = resolveArticleGeo({ citySlug: 'balikesir', districtSlug: 'gonen' })
    const isp = resolveArticleGeo({ citySlug: 'isparta', districtSlug: 'gönen' })
    expect(bal.canonicalGeoId).toBe('TR:balikesir:gonen')
    expect(isp.canonicalGeoId).toBe('TR:isparta:gonen')
    expect(bal.canonicalGeoId).not.toBe(isp.canonicalGeoId)
    expect(resolveArticleGeo({ districtSlug: 'gonen' }).resolutionLevel).toBe('UNRESOLVED')
  })

  it('Biga persists as compound identity', () => {
    expect(resolveArticleGeo({ citySlug: 'canakkale', district: 'Biga' }).canonicalGeoId).toBe(
      'TR:canakkale:biga'
    )
  })
})

describe('verified locality parents', () => {
  it('6. Side → Antalya/Manavgat', () => {
    const r = resolveArticleGeo({ province: 'Antalya', locality: 'Side' })
    expect(r.canonicalGeoId).toBe('TR:antalya:manavgat')
    expect(r.resolutionLevel).toBe('LOCALITY_PARENT')
    expect(r.localityDisplayName).toBe('Side')
    expect(r.locality).toBe('side')
  })

  it('7–10. Çanakkale beldes', () => {
    expect(resolveArticleGeo({ citySlug: 'canakkale', locality: 'Küçükkuyu' }).canonicalGeoId).toBe(
      'TR:canakkale:ayvacik'
    )
    expect(resolveArticleGeo({ citySlug: 'canakkale', locality: 'Geyikli' }).canonicalGeoId).toBe(
      'TR:canakkale:ezine'
    )
    expect(resolveArticleGeo({ citySlug: 'canakkale', locality: 'Evreşe' }).canonicalGeoId).toBe(
      'TR:canakkale:gelibolu'
    )
    expect(resolveArticleGeo({ citySlug: 'canakkale', locality: 'Terzialan' }).canonicalGeoId).toBe(
      'TR:canakkale:can'
    )
  })

  it('11–12. Çardak collision', () => {
    const ck = resolveArticleGeo({ province: 'Çanakkale', locality: 'Çardak' })
    expect(ck.canonicalGeoId).toBe('TR:canakkale:lapseki')
    expect(ck.canonicalGeoId).not.toBe('TR:denizli:cardak')

    const dz = resolveArticleGeo({ province: 'Denizli', district: 'Çardak' })
    expect(dz.canonicalGeoId).toBe('TR:denizli:cardak')
    expect(dz.resolutionLevel).toMatch(/DISTRICT_/)
  })

  it('13–14. Karabiga / Gümüşçay → Biga', () => {
    expect(resolveArticleGeo({ citySlug: 'canakkale', locality: 'Karabiga' }).canonicalGeoId).toBe(
      'TR:canakkale:biga'
    )
    expect(resolveArticleGeo({ citySlug: 'canakkale', locality: 'Gümüşçay' }).canonicalGeoId).toBe(
      'TR:canakkale:biga'
    )
  })

  it('15–16. unknown locality / ambiguous district without province', () => {
    expect(resolveArticleGeo({ citySlug: 'canakkale', locality: 'NowhereVille' }).resolutionLevel).toBe(
      'PROVINCE_ONLY'
    )
    expect(lookupVerifiedLocalityParent('canakkale', 'nowhere')).toBeNull()
    expect(resolveArticleGeo({ districtSlug: 'merkez' }).resolutionLevel).toBe('UNRESOLVED')
    expect(resolveArticleGeo({ districtSlug: 'merkez' }).canonicalGeoId).toBeNull()
  })

  it('17. raw display locality preserved', () => {
    const r = resolveArticleGeo({ citySlug: 'antalya', locality: 'Side' })
    expect(r.raw.locality).toBe('Side')
    expect(r.localityDisplayName).toBe('Side')
  })
})

describe('non-local + safety', () => {
  it('20. non-local article not forced into Yerel identity', () => {
    const r = resolveArticleGeo({})
    expect(r.resolutionLevel).toBe('NONE')
    expect(r.canonicalGeoId).toBeNull()
  })

  it('22–25. contracts / isolation markers', () => {
    delete process.env.FEED_V2_NFRANK_ENABLED
    expect(isNfRankLiveEnabled()).toBe(false)
    expect(USER_FEATURE_DEPENDENCIES.NFRANK_V1).toEqual(['SMART_FEED', 'SMART_FEED_RANKING_V1'])
    expect(USER_ROLLOUT_FEATURE_KEYS).toContain('NFRANK_V1')
    const src = readFileSync(join(process.cwd(), 'src/lib/geo/resolveArticleGeo.ts'), 'utf8')
    expect(src).not.toMatch(/openai|anthropic|generateText|\bllm\b|nominatim|maps\.google/i)
    const loc = readFileSync(join(process.cwd(), 'src/constants/verifiedLocalityParents.ts'), 'utf8')
    expect(loc).toContain('canakkale:cardak')
    expect(loc).toContain('TR:canakkale:lapseki')
  })
})
