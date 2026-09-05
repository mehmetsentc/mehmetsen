/**
 * P18 — second human NO-GO diagnostic contracts + Haberi Oku integration.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  decideFeedReadAction,
  shouldShowFeedReaderDebugPanel,
  isFeedReaderDebugPilot,
  FEED_READER_DEBUG_PILOT_UID,
} from '@/lib/feed/reader/readerDebug'
import { fetchFeedReaderCapability } from '@/lib/feed/reader/capabilityClient'

vi.mock('@/lib/firebase/auth', () => ({
  ensureAuthReady: vi.fn(async () => undefined),
  getClientAuthToken: vi.fn(async () => null as string | null),
}))

import { getClientAuthToken } from '@/lib/firebase/auth'

describe('Feed Reader decideFeedReadAction', () => {
  it('treats authLoading / pending as PENDING (not CANONICAL)', () => {
    expect(
      decideFeedReadAction({
        authLoading: true,
        capabilityReady: false,
        capabilityEnabled: false,
        capabilityError: false,
      })
    ).toEqual({ decision: 'PENDING', fallbackReason: 'AUTH_LOADING' })

    expect(
      decideFeedReadAction({
        authLoading: false,
        capabilityReady: false,
        capabilityEnabled: false,
        capabilityError: false,
      })
    ).toEqual({ decision: 'PENDING', fallbackReason: 'CAPABILITY_PENDING' })
  })

  it('opens Reader only when capability ready+enabled', () => {
    expect(
      decideFeedReadAction({
        authLoading: false,
        capabilityReady: true,
        capabilityEnabled: true,
        capabilityError: false,
      })
    ).toEqual({ decision: 'OPEN_READER', fallbackReason: null })
  })

  it('canonical fallback only when settled disabled', () => {
    expect(
      decideFeedReadAction({
        authLoading: false,
        capabilityReady: true,
        capabilityEnabled: false,
        capabilityError: false,
      })
    ).toEqual({ decision: 'CANONICAL_FALLBACK', fallbackReason: 'CAPABILITY_DISABLED' })
  })
})

describe('Haberi Oku visible button integration contract', () => {
  it('FullscreenNewsCard Haberi Oku is a button (not Link/anchor)', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    const idx = card.indexOf('data-testid="smart-feed-read-cta"')
    expect(idx).toBeGreaterThan(0)
    const window = card.slice(Math.max(0, idx - 120), idx + 450)
    expect(window).toContain('<button')
    expect(window).toContain('type="button"')
    expect(window).toContain('onClick={onReadClick}')
    expect(window).toMatch(/Haberi Oku/)
    expect(window).not.toMatch(/<Link[^>]*smart-feed-read-cta/)
    expect(window).not.toMatch(/href=\{[^}]*NEWS_DETAIL/)
  })

  it('SmartFeedClient wires Haberi Oku → onRead → decide → openReader; canonical only on settled disable', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain("onReadClick={() => onRead(item, index, 'button')}")
    expect(client).toContain('decideFeedReadAction')
    expect(client).toContain("if (decided.decision === 'OPEN_READER')")
    expect(client).toContain('openReader(item, index)')
    expect(client).toContain('ROUTES.NEWS_DETAIL(item.slug)')
    expect(client).toContain("if (decided.decision === 'PENDING') return")
    expect(client).toContain('feed-reader-debug-panel')
    expect(client).toContain("readerDebug') === '1'")
    // Gesture shares same onRead
    expect(client).toContain("onOpen: () => onRead(item, index, 'gesture')")
  })

  it('lists every Feed V2 /haber navigation call site in SmartFeedClient', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    const haberPushes = [...client.matchAll(/router\.push\(ROUTES\.NEWS_DETAIL\([^)]*\)\)/g)].map(
      (m) => m[0]
    )
    // Only the settled capability fallback may push article detail from Feed V2 client.
    expect(haberPushes).toEqual(['router.push(ROUTES.NEWS_DETAIL(item.slug))'])
  })

  it('FeedArticleReader body error does not auto-router.push; offers Link only', () => {
    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(reader).not.toContain('router.push')
    expect(reader).toContain('Tam haber sayfasını aç')
    expect(reader).toContain('href={canonicalPath}')
  })
})

describe('readerDebug panel gate', () => {
  it('shows only for exact pilot + readerDebug=1', () => {
    expect(
      shouldShowFeedReaderDebugPanel({
        readerDebugQuery: true,
        uid: FEED_READER_DEBUG_PILOT_UID,
      })
    ).toBe(true)
    expect(
      shouldShowFeedReaderDebugPanel({
        readerDebugQuery: true,
        uid: 'other-user',
      })
    ).toBe(false)
    expect(
      shouldShowFeedReaderDebugPanel({
        readerDebugQuery: false,
        uid: FEED_READER_DEBUG_PILOT_UID,
      })
    ).toBe(false)
    expect(isFeedReaderDebugPilot(FEED_READER_DEBUG_PILOT_UID)).toBe(true)
  })
})

describe('capability HTTP client contract', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.mocked(getClientAuthToken).mockReset()
    vi.mocked(getClientAuthToken).mockResolvedValue(null)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('records httpStatus + server authenticated flag without inventing enabled', async () => {
    vi.mocked(getClientAuthToken).mockResolvedValue('tok')
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          enabled: true,
          feature: 'FEED_READER_V1',
          globalDefault: false,
          authenticated: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const result = await fetchFeedReaderCapability()
    expect(result.enabled).toBe(true)
    expect(result.httpStatus).toBe(200)
    expect(result.authenticated).toBe(true)
    expect(result.serverAuthenticated).toBe(true)
    expect(result.globalDefault).toBe(false)
  })
})
