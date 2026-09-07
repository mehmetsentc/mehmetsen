/**
 * P18 — Feed V2 site chrome + single-surface Reader return.
 * AUTOMATED — NOT HUMAN GO.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveSiteChromeVisible,
  resolveMobileNavVisible,
  resolveTopNavbarVisible,
  isFeedV2Pathname,
  isReelsPathname,
} from '@/lib/feed/reader/shellChrome'
import {
  canHistoryBackForOpen,
  claimUnownedReaderHistory,
  planReaderHistoryClose,
  pushOwnedReaderHistory,
  readReaderHistoryState,
  createReaderOpenId,
  createFeedSessionId,
} from '@/lib/feed/reader/history'

function mockHistory(startUrl: string) {
  const stack: Array<{ url: string; state: unknown }> = [{ url: startUrl, state: null }]
  let idx = 0
  const api = {
    get length() {
      return stack.length
    },
    get state() {
      return stack[idx]!.state
    },
    pushState(state: unknown, _title: string, url?: string | null) {
      stack.splice(idx + 1)
      stack.push({ url: url ?? stack[idx]!.url, state })
      idx = stack.length - 1
    },
    replaceState(state: unknown, _title: string, url?: string | null) {
      stack[idx] = { url: url ?? stack[idx]!.url, state }
    },
    back() {
      if (idx > 0) idx -= 1
    },
    current() {
      return stack[idx]!
    },
    snapshot() {
      return stack.map((e) => e.url)
    },
  }
  return api
}

describe('shell chrome authority', () => {
  it('Feed V2 never shows MobileNav (closed / open / any reader state)', () => {
    expect(
      resolveMobileNavVisible({ pathname: '/feed-v2', readerSurfaceActive: false })
    ).toBe(false)
    expect(
      resolveMobileNavVisible({ pathname: '/feed-v2', readerSurfaceActive: true })
    ).toBe(false)
  })

  it('Global Nav V2: Feed V2 shows top Navbar unless Reader surface active', () => {
    expect(
      resolveTopNavbarVisible({ pathname: '/feed-v2', readerSurfaceActive: false })
    ).toBe(true)
    expect(
      resolveTopNavbarVisible({ pathname: '/feed-v2', readerSurfaceActive: true })
    ).toBe(false)
    expect(
      resolveSiteChromeVisible({ pathname: '/feed-v2', readerSurfaceActive: false })
    ).toBe(true)
    expect(
      resolveSiteChromeVisible({ pathname: '/feed-v2', readerSurfaceActive: true })
    ).toBe(false)
  })

  it('HOME and /haber keep top chrome; MobileNav off under Global Nav V2', () => {
    expect(resolveSiteChromeVisible({ pathname: '/', readerSurfaceActive: false })).toBe(true)
    expect(
      resolveSiteChromeVisible({ pathname: '/haber/ornek', readerSurfaceActive: false })
    ).toBe(true)
    expect(resolveMobileNavVisible({ pathname: '/haber/ornek' })).toBe(false)
    expect(resolveTopNavbarVisible({ pathname: '/haber/ornek' })).toBe(true)
  })

  it('true /reels stays immersive without site chrome', () => {
    expect(isReelsPathname('/reels')).toBe(true)
    expect(resolveSiteChromeVisible({ pathname: '/reels', readerSurfaceActive: false })).toBe(
      false
    )
  })

  it('MainLayoutClient wires MobileNav + top Navbar separately', () => {
    const layout = readFileSync(
      join(process.cwd(), 'src/components/layout/MainLayoutClient.tsx'),
      'utf8'
    )
    expect(layout).toContain('resolveMobileNavVisible')
    expect(layout).toContain('resolveTopNavbarVisible')
    expect(layout).toContain('showMobileNav')
    expect(layout).toContain('data-feed-mobile-nav')
    expect(layout).not.toMatch(
      /const isReels = pathname === ROUTES\.REELS \|\| pathname === '\/feed-v2'/
    )
  })

  it('14 Feed hosts Level-2 exit in category nav; GlobalBackNav stays off Feed V2 under Nav V2', () => {
    const cat = readFileSync(
      join(process.cwd(), 'src/components/layout/CategoryNav.tsx'),
      'utf8'
    )
    expect(cat).toContain("pathname === '/feed-v2'")
    const feedCat = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedV2CategoryNav.tsx'),
      'utf8'
    )
    expect(feedCat).toContain('FeedV2ExitButton')
    const exit = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedV2ExitButton.tsx'),
      'utf8'
    )
    expect(exit).toContain('smart-feed-exit-nav')
    const back = readFileSync(
      join(process.cwd(), 'src/components/layout/BackNavButton.tsx'),
      'utf8'
    )
    expect(back).toContain('globalNavV2 && isFeedV2')
  })
})

describe('single-surface Reader return', () => {
  it('3–4 closing keeps Feed underlay contract; history deferred', () => {
    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(reader).toContain('data-reader-underlay="feed"')
    expect(reader).toContain('pendingHistoryPlanRef')
    expect(reader).toContain('Defer history.back')
    // history mutation must not run at beginClose start
    const beginIdx = reader.indexOf('const beginClose = useCallback')
    const finishIdx = reader.indexOf('const finishCloseUi = useCallback')
    const beginBody = reader.slice(beginIdx, beginIdx + 3500)
    expect(beginBody).toContain('pendingHistoryPlanRef.current = plan')
    expect(beginBody).not.toContain('popReaderHistory()')
    const finishBody = reader.slice(finishIdx, finishIdx + 5500)
    expect(finishBody).toContain('resolveFeedOwnerHistorySync')
    expect(finishBody).toContain('clearReaderChromeLock()')
    expect(finishBody).toContain('popReaderHistory()')
    expect(finishBody).toContain('replaceUnownedReaderWithFeed()')
    expect(finishBody).toContain('armFeedOwnerRescue()')
  })

  it('17–18 mid-close underlay is Feed — no HOME in Reader stack', () => {
    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(reader).toContain('data-reader-underlay="feed"')
    expect(reader).toMatch(/translate3d\(\$\{\(progress - 1\) \* 100\}%, 0, 0\)/)
    // Simulated 50% close: progress 0.5 → panel at 50%, underlay attr still feed
    expect(isFeedV2Pathname('/feed-v2')).toBe(true)
  })

  it('unowned claim must NOT history_back (would expose HOME under Reader)', () => {
    const h = mockHistory('/feed-v2?reader=direct')
    const openId = createReaderOpenId()
    claimUnownedReaderHistory({
      slug: 'direct',
      articleId: '1',
      readerOpenId: openId,
      feedSessionId: createFeedSessionId(),
      history: h,
      url: '/feed-v2?reader=direct',
    })
    expect(readReaderHistoryState(h.state)?.ownsFeedReturn).toBe(false)
    expect(
      canHistoryBackForOpen({
        currentState: h.state,
        readerOpenId: openId,
        phase: 'active',
      })
    ).toBe(false)
    expect(
      planReaderHistoryClose({
        reason: 'gesture',
        currentState: h.state,
        readerOpenId: openId,
        phase: 'active',
      })
    ).toBe('replace_unowned_feed')
  })

  it('5–9 owned cycles stay on Feed; never current HOME', () => {
    const h = mockHistory('/')
    h.pushState({ __NA: 1, idx: 1 }, '', '/feed-v2')
    const feedSessionId = createFeedSessionId()
    for (let i = 0; i < 10; i++) {
      const openId = `rdr_${i}`
      pushOwnedReaderHistory({
        slug: `a${i}`,
        articleId: String(i),
        readerOpenId: openId,
        feedSessionId,
        history: h,
      })
      expect(
        planReaderHistoryClose({
          reason: i % 2 === 0 ? 'gesture' : 'button',
          currentState: h.state,
          readerOpenId: openId,
          feedSessionId,
          phase: 'active',
        })
      ).toBe('replace_unowned_feed')
      // Production close: replace_unowned_feed — never intentional history.back()
      h.replaceState({ __NA: 1, idx: 1 }, '', '/feed-v2')
      expect(h.current().url).toBe('/feed-v2')
      expect(h.current().url).not.toBe('/')
    }
    expect(h.snapshot()[0]).toBe('/')
    expect(h.snapshot().filter((u) => u === '/').length).toBe(1)
  })
})

describe('open-authority + coach + media preserved', () => {
  it('capability latch + pan-y + coach still present', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('capabilitySessionRef')
    expect(client).toContain('ERROR_RETAIN_FEED')
    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(reader).toMatch(/touchAction:\s*['"]pan-y['"]/)
    const coach = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SwipeDiscoveryCoach.tsx'),
      'utf8'
    )
    expect(coach).toContain('pointer-events-none')
  })
})
