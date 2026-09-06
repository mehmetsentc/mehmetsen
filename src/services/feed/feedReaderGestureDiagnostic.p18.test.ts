/**
 * P18 — Feed → Reader mobile swipe forensic helpers + card integration contracts.
 * AUTOMATED only — not HUMAN GO.
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/firebase/auth', () => ({
  ensureAuthReady: vi.fn(async () => undefined),
  getClientAuthToken: vi.fn(async () => null as string | null),
  auth: { currentUser: null },
}))

import {
  classifyFeedOpenGestureDecision,
  dispatchFeedOpenGesture,
  shouldIgnoreFeedOpenGestureTarget,
} from '@/lib/feed/reader/feedOpenGesture'
import { READER_GESTURE } from '@/lib/feed/reader/gestureArbitration'
import { EMPTY_FEED_READER_DEBUG } from '@/lib/feed/reader/readerDebug'

describe('Feed Reader gesture diagnostic contracts', () => {
  it('readerDebug snapshot includes gesture forensic fields', () => {
    expect(EMPTY_FEED_READER_DEBUG).toMatchObject({
      gestureHandlerAttached: false,
      pointerDownReceived: false,
      pointerMoveReceived: false,
      pointerUpReceived: false,
      pointerCancelReceived: false,
      gestureDx: null,
      gestureDy: null,
      gestureAxis: null,
      gestureQualified: false,
      gestureDecision: null,
      onReadCalled: false,
      readerOpenRequested: false,
    })
  })

  it('SmartFeedClient wires gesture pointer debug only for readerDebug panel', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('onGesturePointerDebug')
    expect(client).toContain('classifyFeedOpenGestureDecision')
    expect(client).toContain('gestureHandlerAttached')
    expect(client).toContain("'CANCELLED'")
    expect(client).toContain("'IGNORED_INTERACTIVE'")
    expect(client).toContain('HANDLER_ABSENT')
  })

  it('realistic mobile left swipe sequence opens via shared onOpen path', () => {
    let opened = 0
    // 300,400 → 210,405 → 170,406  (dx≈-130, dy≈6) on 390vw
    const dx = 170 - 300
    const dy = 406 - 400
    const classified = classifyFeedOpenGestureDecision({
      dx,
      dy,
      startClientX: 300,
      viewportWidth: 390,
      velocityX: -0.7,
    })
    expect(classified.axis).toBe('horizontal')
    expect(classified.decision).toBe('OPEN_READER')
    expect(
      dispatchFeedOpenGesture({
        dx,
        dy,
        startClientX: 300,
        viewportWidth: 390,
        velocityX: -0.7,
        onOpen: () => {
          opened += 1
        },
      })
    ).toBe(true)
    expect(opened).toBe(1)
  })

  it('vertical-dominant and short horizontal do not open', () => {
    // 300,400 → 295,520
    expect(
      classifyFeedOpenGestureDecision({
        dx: -5,
        dy: 120,
        startClientX: 300,
        viewportWidth: 390,
        velocityX: 0,
      }).decision
    ).toBe('NONE')

    // 300,400 → 280,402 (short)
    const short = classifyFeedOpenGestureDecision({
      dx: -20,
      dy: 2,
      startClientX: 300,
      viewportWidth: 390,
      velocityX: -0.1,
    })
    expect(short.axis === 'none' || short.decision === 'SNAP_BACK' || short.decision === 'NONE').toBe(
      true
    )
    expect(short.open).toBe(false)
  })

  it('iOS left-edge start is IGNORED_IOS_EDGE', () => {
    expect(
      classifyFeedOpenGestureDecision({
        dx: -180,
        dy: 0,
        startClientX: 10,
        viewportWidth: 390,
        velocityX: -1,
      }).decision
    ).toBe('IGNORED_IOS_EDGE')
  })

  it('interactive targets are ignored at down (Haberi Oku / social)', () => {
    const button = { closest: (sel: string) => (sel.includes('button') ? button : null) }
    expect(shouldIgnoreFeedOpenGestureTarget(button as unknown as EventTarget)).toBe(true)
  })

  it('documents open thresholds and Feed→Reader direction (left / negative dx)', () => {
    expect(READER_GESTURE.dominance).toBe(1.35)
    expect(READER_GESTURE.activatePx).toBe(14)
    expect(READER_GESTURE.completePx).toBe(72)
    expect(READER_GESTURE.completeVelocity).toBe(0.45)
    expect(READER_GESTURE.systemBackEdgePx).toBe(22)
    // Right swipe (positive dx) must not open
    expect(
      classifyFeedOpenGestureDecision({
        dx: 180,
        dy: 0,
        startClientX: 80,
        viewportWidth: 390,
        velocityX: 0.8,
      }).open
    ).toBe(false)
  })

  it('FeedArticleReader reverse gesture uses preventDefault after horizontal lock', () => {
    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(reader).toContain('e.preventDefault()')
    expect(reader).toContain('readerToFeedProgress')
    expect(reader).toContain("beginClose('gesture')")
    expect(reader).toContain('closingRef')
    expect(reader).toContain('planReaderHistoryClose')
    expect(reader).not.toContain('replaceFeedUrl')
    expect(reader).not.toContain("animateTo(0, 'gesture')")
  })

  it('open path establishes horizontal ownership with non-passive preventDefault', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    const fnIdx = client.indexOf('function FeedCardWithImpression')
    const surface = client.slice(fnIdx, fnIdx + 12000)
    expect(surface).toContain('touch-pan-y')
    expect(surface).toContain('data-testid="smart-feed-card-gesture-surface"')
    expect(surface).toContain('setPointerCapture')
    expect(surface).toContain('{ passive: false }')
    expect(surface).toContain('ev.preventDefault()')
    expect(surface).toContain('onOpenReaderProgress')
  })
})
