import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('P18.3B Smart Feed UX', () => {
  it('category nav hosts Feed exit + chips without floating GlobalBackNav gap', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedV2CategoryNav.tsx'),
      'utf8'
    )
    expect(src).toContain('FeedV2ExitButton')
    expect(src).toContain('safe-area-inset-top')
    expect(src).toContain('smart-feed-category-nav')
  })

  it('summary uses full text (no CSS line-clamp)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(src).toContain('data-testid="smart-feed-summary"')
    expect(src).not.toMatch(/line-clamp/)
    expect(src).not.toMatch(/item\.summary\.slice|item\.summary\.substring/)
    expect(src).not.toContain('smart-feed-mid-copy')
  })

  it('Feed V2 exit is Level-2 control with Ana Feed fallback (not blind history.back)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedV2ExitButton.tsx'),
      'utf8'
    )
    expect(src).toContain('smart-feed-exit-nav')
    expect(src).toContain('resolveFeedV2ExitHref')
    expect(src).not.toMatch(/history\.back\(|router\.back\(/)
    const lib = readFileSync(join(process.cwd(), 'src/lib/feed/reader/feedV2Exit.ts'), 'utf8')
    expect(lib).toContain('ROUTES.FEED')
  })
})

describe('P18.3B guest seen persistence', () => {
  beforeEach(() => {
    const localMap = new Map<string, string>()
    const sessionMap = new Map<string, string>()
    const localStorage = {
      getItem: (k: string) => localMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        localMap.set(k, v)
      },
      removeItem: (k: string) => {
        localMap.delete(k)
      },
    }
    const sessionStorage = {
      getItem: (k: string) => sessionMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        sessionMap.set(k, v)
      },
      removeItem: (k: string) => {
        sessionMap.delete(k)
      },
    }
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('sessionStorage', sessionStorage)
    vi.stubGlobal('window', { localStorage, sessionStorage })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists guest seen in localStorage across read/write', async () => {
    const { readGuestSeen, writeGuestSeen } = await import('@/lib/feed/feedSeenClient')
    const ids = new Set(['a1', 'a2'])
    writeGuestSeen(ids)
    const again = readGuestSeen()
    expect(again.has('a1')).toBe(true)
    expect(again.has('a2')).toBe(true)
  })
})

describe('P18.3B ranking config personal mix', () => {
  it('personal mode elevates engagement and freshness without AI', async () => {
    const { FEED_RANKING_CONFIG_V1 } = await import('@/lib/feed/rankingConfig')
    expect(FEED_RANKING_CONFIG_V1.modeProfiles.personal.engagement).toBe(1.15)
    expect(FEED_RANKING_CONFIG_V1.modeProfiles.personal.freshness).toBe(1.1)
    expect(FEED_RANKING_CONFIG_V1.modeProfiles.personal.interest).toBe(1.25)
    expect(FEED_RANKING_CONFIG_V1.modeProfiles.personal.discovery).toBe(1.3)
  })
})
