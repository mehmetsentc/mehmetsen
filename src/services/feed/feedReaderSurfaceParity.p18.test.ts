/**
 * P18 responsive surface parity + Feed V2 exit — AUTOMATED (not HUMAN GO).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FEED_READER_SURFACE_CLASS,
  FEED_READER_SURFACE_MAX_REM,
  FEED_V2_CHROME_CSS_VARS,
  feedReaderSurfaceMaxPx,
} from '@/lib/feed/reader/feedChrome'
import {
  FEED_V2_ENTRY_ORIGIN_KEY,
  FEED_V2_EXIT_FALLBACK,
  captureFeedV2EntryFromReferrer,
  peekFeedV2EntryOrigin,
  rememberFeedV2EntryOrigin,
  resolveFeedV2ExitHref,
} from '@/lib/feed/reader/feedV2Exit'
import { ROUTES } from '@/constants/routes'

const root = process.cwd()

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('P18 shared Feed/Reader surface authority', () => {
  it('token is Reader reference 44rem and exported as shared class', () => {
    expect(FEED_V2_CHROME_CSS_VARS['--feed-reader-surface-max']).toBe('44rem')
    expect(FEED_READER_SURFACE_MAX_REM).toBe(44)
    expect(feedReaderSurfaceMaxPx(16)).toBe(704)
    expect(FEED_READER_SURFACE_CLASS).toContain('--feed-reader-surface-max')
    expect(FEED_READER_SURFACE_CLASS).toContain('md:mx-auto')
  })

  it('Feed shells + Reader outer use shared class; no md:max-w-lg tower', () => {
    const page = read('src/app/(main)/feed-v2/page.tsx')
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    const skeleton = read('src/components/feed/smart/FullscreenNewsCardSkeleton.tsx')
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')

    for (const src of [page, client, card, skeleton, reader]) {
      expect(src).toContain('FEED_READER_SURFACE_CLASS')
      expect(src).not.toMatch(/md:max-w-lg/)
    }
    expect(reader).not.toMatch(/max-w-\[44rem\]/)
    expect(reader).toContain('--reader-prose-max')
    expect(card).toContain('smart-feed-copy-scroll')
  })

  it('geometry helper: mobile viewport uses full width; desktop caps at 704', () => {
    const viewports = [
      { w: 375, h: 667 },
      { w: 390, h: 844 },
      { w: 393, h: 852 },
      { w: 430, h: 932 },
      { w: 768, h: 1024 },
      { w: 820, h: 1180 },
      { w: 1280, h: 720 },
      { w: 1366, h: 768 },
      { w: 1440, h: 900 },
      { w: 1920, h: 1080 },
    ]
    const cap = feedReaderSurfaceMaxPx(16)
    for (const vp of viewports) {
      const surfaceW = Math.min(vp.w, cap)
      const feedW = surfaceW
      const readerW = surfaceW
      const left =
        vp.w > cap ? Math.round((vp.w - cap) / 2) : 0
      expect(Math.abs(feedW - readerW)).toBe(0)
      expect(Math.abs(left - left)).toBe(0)
      // Mobile: full bleed; desktop: centered column
      if (vp.w <= 430) expect(surfaceW).toBe(vp.w)
      if (vp.w >= 1280) expect(surfaceW).toBe(704)
    }
  })
})

describe('P18 Feed V2 exit authority', () => {
  let store: Map<string, string>

  beforeEach(() => {
    store = new Map()
    const sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    }
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: sessionStorage,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'window', {
      value: { sessionStorage, location: { origin: 'https://nahaber.com' } },
      configurable: true,
    })
  })

  afterEach(() => {
    store.clear()
  })

  it('remembers / and /feed; never stamps feed-v2 or login', () => {
    rememberFeedV2EntryOrigin('/')
    expect(peekFeedV2EntryOrigin()).toBe('/')
    expect(resolveFeedV2ExitHref()).toBe('/')

    rememberFeedV2EntryOrigin('/feed')
    expect(resolveFeedV2ExitHref()).toBe('/feed')

    rememberFeedV2EntryOrigin('/feed-v2')
    expect(peekFeedV2EntryOrigin()).toBe('/feed')

    rememberFeedV2EntryOrigin('/login')
    expect(resolveFeedV2ExitHref()).toBe('/feed')
  })

  it('direct entry without origin falls back to Ana Feed', () => {
    expect(peekFeedV2EntryOrigin()).toBeNull()
    expect(resolveFeedV2ExitHref()).toBe(FEED_V2_EXIT_FALLBACK)
    expect(FEED_V2_EXIT_FALLBACK).toBe(ROUTES.FEED)
  })

  it('same-origin referrer capture fills missing stamp', () => {
    Object.defineProperty(globalThis, 'document', {
      value: { referrer: 'https://nahaber.com/feed' },
      configurable: true,
    })
    captureFeedV2EntryFromReferrer()
    expect(resolveFeedV2ExitHref()).toBe('/feed')
  })

  it('exit control never uses history.back; nav chrome stamps origin', () => {
    const exitBtn = read('src/components/feed/smart/FeedV2ExitButton.tsx')
    const exitLib = read('src/lib/feed/reader/feedV2Exit.ts')
    const cat = read('src/components/feed/smart/FeedV2CategoryNav.tsx')
    const navbar = read('src/components/layout/Navbar.tsx')
    const sidebar = read('src/components/layout/Sidebar.tsx')
    const history = read('src/lib/feed/reader/history.ts')

    expect(exitBtn).toContain('resolveFeedV2ExitHref')
    expect(exitBtn).toContain('router.push')
    expect(exitBtn).not.toMatch(/history\.back\(|router\.back\(/)
    expect(exitBtn).toContain('smart-feed-exit-nav')
    expect(exitBtn).toContain('min-h-[44px]')
    expect(exitLib).toContain(FEED_V2_ENTRY_ORIGIN_KEY)
    expect(cat).toContain('FeedV2ExitButton')
    expect(cat).toContain('exitHidden')
    expect(navbar).toContain('rememberFeedV2EntryOrigin')
    expect(sidebar).toContain('rememberFeedV2EntryOrigin')
    // Reader close must stay replace_unowned_feed — no intentional history.back
    expect(history).toContain('replace_unowned_feed')
    expect(history).toContain('happy-path close now plans replace_unowned_feed only')
  })
})
