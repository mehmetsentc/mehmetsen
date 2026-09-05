import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('P18.4H local feed geo gate — user geography (no proximity)', () => {
  const service = readFileSync(join(process.cwd(), 'src/services/feed/FeedService.ts'), 'utf8')
  const client = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
    'utf8'
  )
  const candidate = readFileSync(
    join(process.cwd(), 'src/services/feed/FeedCandidateService.ts'),
    'utf8'
  )
  const pipeline = readFileSync(
    join(process.cwd(), 'src/services/feed/FeedRankingPipeline.ts'),
    'utf8'
  )

  it('rejects local mode without city/district/region', () => {
    expect(service).toContain("emptyReason: 'location_required'")
    expect(service).toContain('citySlug?.trim()')
  })

  it('client passes resolved user city and prompts when missing', () => {
    expect(client).toContain('resolveFeedCity')
    expect(client).toContain('LocalLocationSetupSheet')
    expect(client).toContain("city: resolveFeedCity(activeMode)")
    expect(client).toContain('writeLocalNewsCitySlug')
    expect(client).toContain("userLocation.source !== 'fallback'")
  })

  it('fetchLocal requires geo and uses Firestore citySlug (not PG-only / not category-only)', () => {
    expect(candidate).toContain('async fetchLocal')
    expect(candidate).toContain('if (!opts.citySlug && !opts.districtSlug && !opts.region) return []')
    expect(candidate).toContain('fetchFirestoreLocalByCity')
    expect(candidate).toContain("where('citySlug', '==', citySlug)")
    expect(candidate).toContain("where('status', '==', 'published')")
    // Nationwide category=yerel alone must not be the local path
    expect(candidate).not.toMatch(
      /async fetchLocal[\s\S]{0,400}where\('categoryId',\s*'==',\s*'yerel/
    )
  })

  it('district exact rows are ordered before same-city remainder', () => {
    expect(candidate).toContain('mergeLocalGeoRows')
    expect(candidate).toContain('districtHits')
    expect(candidate).toContain('[...districtHits, ...cityHits]')
  })

  it('local mode must not nationwide-fill via older LEGACY_ALLOWED', () => {
    expect(pipeline).toContain("input.mode !== 'local'")
    expect(pipeline).toContain('LOCAL_NO_NATIONWIDE_FILL')
    expect(pipeline).toContain('fetchOlderLegacyAllowed')
  })

  it('Eskişehir must not enter Antalya local pool via underfill (source contracts)', () => {
    // Underfill gate excludes local from nationwide older legacy
    expect(pipeline).toMatch(/mode !== 'local'[\s\S]*fetchOlderLegacyAllowed/)
    // FS local enforces citySlug match
    expect(candidate).toContain("row.citySlug || '').toLowerCase() !== citySlug")
  })

  it('no Haversine / proximity activation in local repair', () => {
    // Comment may mention "no Haversine"; executable proximity must stay absent.
    expect(candidate).not.toMatch(/\bhaversine\s*\(|LOCAL_NEARBY|NEARBY_CROSS_PROVINCE/i)
    expect(pipeline).not.toMatch(/\bhaversine\s*\(|LOCAL_NEARBY|NEARBY_CROSS_PROVINCE/i)
  })

  it('unknown location UX preserved on client', () => {
    expect(client).toContain('setLocationSetupOpen(true)')
    expect(client).toContain('Yalnızca kendi şehrindeki yerel haberleri')
  })

  it('local FS path honors cursor / publishedBefore (pagination survives geo filter)', () => {
    expect(candidate).toContain('fetchFirestoreLocalByCity')
    expect(candidate).toMatch(/startAfter\(publishedBefore\)/)
    expect(candidate).toMatch(/startAfter\(cursorTs\)/)
    expect(candidate).toContain("where('citySlug', '==', citySlug)")
  })

  it('Yerel chip is mode=local not category=yerel nationwide archive', () => {
    const tabs = readFileSync(join(process.cwd(), 'src/lib/feed/feedV2Tabs.ts'), 'utf8')
    expect(tabs).toContain("id === 'yerel'")
    expect(tabs).toContain("mode: 'local'")
    expect(tabs).toMatch(/if \(id === 'yerel'\)[\s\S]*?kind: 'mode'/)
  })

  it('Sana Özel still calls fetchLocal as a pool (not redesigned)', () => {
    expect(pipeline).toContain("mode === 'personal'")
    expect(pipeline).toContain('feedCandidateService.fetchLocal')
  })
})
