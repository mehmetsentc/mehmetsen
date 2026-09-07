import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { resolveCategoryFilterIds } from '@/lib/feed/resolveCategoryFilterIds'
import {
  clearFeedRestore,
  clearFeedRestoreForFeedV2Nav,
  consumePendingFeedRestore,
  readFeedRestore,
  saveFeedRestore,
} from '@/lib/feed/feedRestoration'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('P18 category hierarchy expand', () => {
  it('Spor parent includes taxonomy children (no hard-coded list in expander)', () => {
    const ids = resolveCategoryFilterIds('spor')
    expect(ids[0]).toBe('spor')
    expect(ids).toContain('futbol')
    expect(ids).toContain('basketbol')
    expect(ids).toContain('voleybol')
    const src = readFileSync(
      join(process.cwd(), 'src/lib/feed/resolveCategoryFilterIds.ts'),
      'utf8'
    )
    expect(src).not.toMatch(/futbol.*basketbol/)
    expect(src).toContain('getSubcategories')
  })

  it('leaf Futbol stays leaf-only', () => {
    expect(resolveCategoryFilterIds('futbol')).toEqual(['futbol'])
  })

  it('FS category fill uses per-category quota (no parent starve)', () => {
    const candidate = readFileSync(
      join(process.cwd(), 'src/services/feed/FeedCandidateService.ts'),
      'utf8'
    )
    expect(candidate).toContain('perCategoryQuota')
    expect(candidate).toContain('categoryHierarchyUnderfilled')
    expect(candidate).not.toMatch(/if \(merged\.length >= needed\) break/)
  })
})

describe('P18 Sana Özel foreign-local deprioritize', () => {
  it('localScore / localFeature no longer soft-boost any foreign citySlug', () => {
    const scoring = readFileSync(
      join(process.cwd(), 'src/services/feed/FeedScoringService.ts'),
      'utf8'
    )
    const nf = readFileSync(
      join(process.cwd(), 'src/services/feed/nfRank/NFRankEngine.ts'),
      'utf8'
    )
    expect(scoring).toContain('Ordinary foreign-city tags must not soft-boost')
    expect(scoring).not.toMatch(/if \(rowCity\) return 0\.4/)
    expect(nf).not.toMatch(/if \(rowCity\) return 0\.35/)
    expect(scoring).toContain("row.source === 'LOCAL'")
    // Yerel mode path untouched in FeedService
    const service = readFileSync(join(process.cwd(), 'src/services/feed/FeedService.ts'), 'utf8')
    expect(service).toContain("emptyReason: 'location_required'")
  })
})

describe('P18 warm Feed V2 restore', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('route_exit survives Zap from Profile; canonical does not', () => {
    saveFeedRestore({
      mode: 'personal',
      category: 'spor',
      articleId: 'a6',
      scrollIndex: 6,
      items: Array.from({ length: 7 }, (_, i) => ({ articleId: `a${i}` })) as never,
      pending: true,
      source: 'route_exit',
      userKey: 'guest',
    })
    clearFeedRestoreForFeedV2Nav({ pathname: '/profile' })
    expect(readFeedRestore()?.source).toBe('route_exit')
    expect(consumePendingFeedRestore()?.scrollIndex).toBe(6)
    clearFeedRestore()

    saveFeedRestore({
      mode: 'personal',
      articleId: 'a2',
      scrollIndex: 0,
      items: [{ articleId: 'a2' } as never],
      pending: true,
      source: 'canonical',
      userKey: 'guest',
    })
    clearFeedRestoreForFeedV2Nav({ pathname: '/haber/x' })
    expect(readFeedRestore()).toBeNull()
  })

  it('re-tap on /feed-v2 clears warm snapshot', () => {
    saveFeedRestore({
      mode: 'personal',
      articleId: 'a1',
      scrollIndex: 3,
      items: [{ articleId: 'a1' } as never],
      pending: true,
      source: 'route_exit',
    })
    clearFeedRestoreForFeedV2Nav({ pathname: '/feed-v2' })
    expect(readFeedRestore()).toBeNull()
  })

  it('auth userKey mismatch invalidates personalized snapshot', () => {
    saveFeedRestore({
      mode: 'personal',
      articleId: 'a1',
      scrollIndex: 1,
      items: [{ articleId: 'a1' } as never],
      pending: true,
      source: 'route_exit',
      userKey: 'uid-a',
    })
    expect(consumePendingFeedRestore({ userKey: 'uid-b' })).toBeNull()
    expect(readFeedRestore()).toBeNull()
  })

  it('nav uses clearFeedRestoreForFeedV2Nav; client saves route_exit + quiet refresh', () => {
    const nav = readFileSync(join(process.cwd(), 'src/components/layout/Navbar.tsx'), 'utf8')
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(nav).toContain('clearFeedRestoreForFeedV2Nav')
    expect(client).toContain("source: 'route_exit'")
    expect(client).toContain('impressedArticleIdsRef')
    expect(client).toContain('quiet')
  })
})
