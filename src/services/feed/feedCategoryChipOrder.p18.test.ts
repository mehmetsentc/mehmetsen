import { describe, expect, it } from 'vitest'
import {
  buildFallbackFeedV2Tabs,
  buildFeedV2Tabs,
} from '@/lib/feed/feedV2Tabs'
import {
  FEED_V2_CATEGORY_FALLBACK_ORDER,
  feedV2CategoryParentBucket,
} from '@/lib/feed/feedV2CategoryBuckets'

describe('Feed V2 dynamic category chip ordering', () => {
  it('Sana Özel is always index 0', () => {
    const tabs = buildFeedV2Tabs(['spor', 'magazin', 'ekonomi'])
    expect(tabs[0]?.id).toBe('personal')
    expect(tabs[0]?.label).toMatch(/Sana/i)
  })

  it('Magazin is NOT statically pinned after Sana Özel; Takip is not #2 either', () => {
    const fallback = buildFallbackFeedV2Tabs()
    expect(fallback[1]?.id).not.toBe('magazin')
    expect(fallback[1]?.id).not.toBe('following')

    const dynamic = buildFeedV2Tabs(['spor', 'turizm', 'magazin'])
    expect(dynamic[1]?.id).toBe('spor')
    expect(dynamic[2]?.id).toBe('turizm')
    expect(dynamic.findIndex((t) => t.id === 'magazin')).toBeGreaterThan(2)
  })

  it('newest eligible category becomes index 1; second becomes index 2', () => {
    const tabs = buildFeedV2Tabs(['asayis', 'saglik', 'yerel'])
    expect(tabs.map((t) => t.id).slice(0, 4)).toEqual(['personal', 'asayis', 'saglik', 'yerel'])
  })

  it('null/missing activity categories append via deterministic fallback (after timed ones)', () => {
    const tabs = buildFeedV2Tabs(['spor'])
    const ids = tabs.map((t) => t.id)
    expect(ids[0]).toBe('personal')
    expect(ids[1]).toBe('spor')
    expect(ids).toContain('ekonomi')
    expect(ids.indexOf('spor')).toBeLessThan(ids.indexOf('ekonomi'))
  })

  it('equal-timestamp tie-break uses fallback order then categoryId (documented)', () => {
    expect(FEED_V2_CATEGORY_FALLBACK_ORDER.indexOf('spor')).toBeLessThan(
      FEED_V2_CATEGORY_FALLBACK_ORDER.indexOf('magazin')
    )
  })

  it('category ID normalization collapses aliases into one bucket', () => {
    expect(feedV2CategoryParentBucket('yerel-haber')).toBe('yerel')
    expect(feedV2CategoryParentBucket('yerel')).toBe('yerel')
    expect(feedV2CategoryParentBucket('konser')).toBe('kultur')
    expect(feedV2CategoryParentBucket('magazin')).toBe('magazin')
    expect(feedV2CategoryParentBucket('gundem', true)).toBe('son-dakika')
    expect(feedV2CategoryParentBucket('son-dakika')).toBe('son-dakika')
  })

  it('no duplicate chips', () => {
    const tabs = buildFeedV2Tabs(['spor', 'spor', 'ekonomi', 'spor'])
    const ids = tabs.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('freshness source must not be PG-only (Feed V2 uses FS+PG)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/services/feed/feedCategoryFreshness.ts'),
      'utf8'
    )
    expect(src).toContain('collectFromFirestore')
    expect(src).toContain('collectFromPostgres')
    expect(src).toContain('canAppearInSmartFeed')
    expect(src).toContain('publishedAt')
    expect(src).not.toMatch(/raw_articles/)
    expect(src).toContain('CACHE_TTL_MS = 90_000')
  })
})
