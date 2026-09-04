import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('P18.4H local feed geo gate', () => {
  const service = readFileSync(join(process.cwd(), 'src/services/feed/FeedService.ts'), 'utf8')
  const client = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
    'utf8'
  )
  const candidate = readFileSync(
    join(process.cwd(), 'src/services/feed/FeedCandidateService.ts'),
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

  it('fetchLocal still requires geo and filters by citySlug', () => {
    expect(candidate).toContain('async fetchLocal')
    expect(candidate).toContain('if (!opts.citySlug && !opts.districtSlug && !opts.region) return []')
    expect(candidate).toContain('eq(news.citySlug, opts.citySlug)')
  })
})
