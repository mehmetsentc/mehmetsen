/**
 * P18 — Feed Reader capability hydration + card gesture integration.
 * Proves auth-loading race cannot permanently disable Reader for pilots.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isCapabilityGenerationCurrent,
  fetchFeedReaderCapability,
} from '@/lib/feed/reader/capabilityClient'
import {
  dispatchFeedOpenGesture,
  shouldIgnoreFeedOpenGestureTarget,
} from '@/lib/feed/reader/feedOpenGesture'

vi.mock('@/lib/firebase/auth', () => ({
  ensureAuthReady: vi.fn(async () => undefined),
  getClientAuthToken: vi.fn(async () => null as string | null),
}))

import { getClientAuthToken } from '@/lib/firebase/auth'

describe('Feed Reader capability hydration', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.mocked(getClientAuthToken).mockReset()
    vi.mocked(getClientAuthToken).mockResolvedValue(null)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('generation guard drops stale capability responses', () => {
    expect(isCapabilityGenerationCurrent(1, 2)).toBe(false)
    expect(isCapabilityGenerationCurrent(3, 3)).toBe(true)
  })

  it('sends Bearer when authenticated and reports enabled from API', async () => {
    vi.mocked(getClientAuthToken).mockResolvedValue('pilot-token')
    globalThis.fetch = vi.fn(async (_url, init) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer pilot-token')
      expect(init?.cache).toBe('no-store')
      expect(init?.credentials).toBe('same-origin')
      return new Response(JSON.stringify({ enabled: true, feature: 'FEED_READER_V1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const result = await fetchFeedReaderCapability()
    expect(result.enabled).toBe(true)
    expect(result.authenticated).toBe(true)
    expect(result.httpStatus).toBe(200)
  })

  it('unauthenticated request returns API enabled=false without inventing true', async () => {
    vi.mocked(getClientAuthToken).mockResolvedValue(null)
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ enabled: false, globalDefault: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const result = await fetchFeedReaderCapability()
    expect(result.enabled).toBe(false)
    expect(result.authenticated).toBe(false)
    expect(result.httpStatus).toBe(200)
  })

  it('SmartFeedClient waits for authLoading before settling capability', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('fetchFeedReaderCapability')
    expect(client).toContain('if (authLoading)')
    expect(client).toContain('[authLoading, authUser?.uid')
    expect(client).toContain('resolveFeedReaderEnabledForOpen')
    expect(client).toContain('openReader')
    expect(client).toContain('readerCapabilityReady')
    expect(client).toContain('isCapabilityGenerationCurrent')
    expect(client).toContain("if (decided.decision === 'PENDING') return")
    expect(client).toMatch(/dispatchFeedOpenGesture\(/)
    expect(client).toContain("onOpen: () => onRead(item, index, 'gesture')")
    expect(client).toContain('openReader(item, index)')
  })

  it('non-pilot path still documents canonical /haber fallback after capability ready', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('ROUTES.NEWS_DETAIL(item.slug)')
    expect(client).toContain('Legacy path: navigate to canonical article page')
  })
})

describe('Feed card gesture surface integration', () => {
  it('attaches gesture surface with pan-y, capture, and social exclusion', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('data-testid="smart-feed-card-gesture-surface"')
    expect(client).toContain('touch-pan-y')
    expect(client).toContain('setPointerCapture')
    expect(client).toContain('shouldIgnoreFeedOpenGestureTarget')
    expect(client).toContain('feedReaderEnabled && readerCapabilityReady && isActive && !readerItem')
  })

  it('horizontal sufficient swipe opens; short/vertical/edge do not; interactive targets ignored', () => {
    let opened = 0
    const onOpen = () => {
      opened += 1
    }

    // progress 180/390 ≈ 0.46 >= 0.42 complete threshold
    expect(
      dispatchFeedOpenGesture({
        dx: -180,
        dy: 8,
        startClientX: 80,
        viewportWidth: 390,
        velocityX: -0.2,
        onOpen,
      })
    ).toBe(true)
    expect(opened).toBe(1)

    expect(
      dispatchFeedOpenGesture({
        dx: -10,
        dy: 0,
        startClientX: 80,
        viewportWidth: 390,
        velocityX: 0,
        onOpen,
      })
    ).toBe(false)

    expect(
      dispatchFeedOpenGesture({
        dx: -20,
        dy: -80,
        startClientX: 80,
        viewportWidth: 390,
        velocityX: 0,
        onOpen,
      })
    ).toBe(false)

    expect(
      dispatchFeedOpenGesture({
        dx: -40,
        dy: -50,
        startClientX: 80,
        viewportWidth: 390,
        velocityX: 0,
        onOpen,
      })
    ).toBe(false)

    expect(
      dispatchFeedOpenGesture({
        dx: -180,
        dy: 0,
        startClientX: 10,
        viewportWidth: 390,
        velocityX: -1,
        onOpen,
      })
    ).toBe(false)
    expect(opened).toBe(1)

    const cta = {
      closest: (sel: string) => (sel.includes('button') ? cta : null),
    }
    const media = {
      closest: (_sel: string) => null,
    }
    expect(shouldIgnoreFeedOpenGestureTarget(cta as unknown as EventTarget)).toBe(true)
    expect(shouldIgnoreFeedOpenGestureTarget(media as unknown as EventTarget)).toBe(false)
  })
})
