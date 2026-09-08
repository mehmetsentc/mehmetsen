/**
 * P18 — Feed↔Reader gesture lifecycle isolation (human loop: Haberi Oku revive / auto-return).
 * AUTOMATED — not HUMAN GO.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FEED_READER_RETURN_GESTURE_ARM_MS,
  appendSwipeLifecycleRing,
  isReaderReturnGestureArmed,
  shouldIgnoreFeedOpenCancel,
} from '@/lib/feed/reader/swipeLifecycle'

describe('swipe lifecycle isolation helpers', () => {
  it('ignores feed preview cancel while commit lock matches article', () => {
    expect(
      shouldIgnoreFeedOpenCancel({
        commitLockArticleId: 'a1',
        articleId: 'a1',
      })
    ).toBe(true)
    expect(
      shouldIgnoreFeedOpenCancel({
        commitLockArticleId: 'a1',
        articleId: 'a2',
      })
    ).toBe(false)
    expect(
      shouldIgnoreFeedOpenCancel({
        commitLockArticleId: null,
        articleId: 'a1',
      })
    ).toBe(false)
  })

  it('Reader return gesture arms only after settle window', () => {
    const t0 = 1_000
    expect(
      isReaderReturnGestureArmed({
        committedAtMs: t0,
        nowMs: t0 + 50,
        armMs: FEED_READER_RETURN_GESTURE_ARM_MS,
      })
    ).toBe(false)
    expect(
      isReaderReturnGestureArmed({
        committedAtMs: t0,
        nowMs: t0 + FEED_READER_RETURN_GESTURE_ARM_MS,
        armMs: FEED_READER_RETURN_GESTURE_ARM_MS,
      })
    ).toBe(true)
    expect(
      isReaderReturnGestureArmed({
        committedAtMs: null,
        nowMs: t0 + 999,
      })
    ).toBe(false)
  })

  it('lifecycle ring retains Feed→Reader→Feed events', () => {
    let ring: string[] = []
    for (const ev of [
      'FEED_GESTURE_COMMIT',
      'READER_COMMITTED',
      'READER_CLOSE_FINISH',
      'READER_SESSION_CLEAR',
      'FEED_GESTURE_EPOCH_BUMP',
    ] as const) {
      ring = appendSwipeLifecycleRing(ring, ev)
    }
    expect(ring.join('>')).toContain('FEED_GESTURE_COMMIT')
    expect(ring.join('>')).toContain('READER_SESSION_CLEAR')
  })
})

describe('lifecycle wiring contracts', () => {
  const client = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
    'utf8'
  )
  const reader = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
    'utf8'
  )

  it('Feed commit lock blocks cancel; epoch resets drag; pointerdown clears stale listeners', () => {
    expect(client).toContain('feedGestureCommitLockRef')
    expect(client).toContain('shouldIgnoreFeedOpenCancel')
    expect(client).toContain('FEED_GESTURE_CANCEL_IGNORED_COMMIT_LOCK')
    expect(client).toContain('feedGestureEpoch')
    expect(client).toContain('FEED_GESTURE_EPOCH_BUMP')
    expect(client).toContain('Always clear stale move listeners')
    expect(client).toContain('clearNativeMove()')
  })

  it('Reader return gesture requires arm window after commit', () => {
    expect(reader).toContain('committedAtMsRef')
    expect(reader).toContain('isReaderReturnGestureArmed')
    expect(reader).toContain('FEED_READER_RETURN_GESTURE_ARM_MS')
  })

  it('does not change gesture thresholds', () => {
    const arb = readFileSync(
      join(process.cwd(), 'src/lib/feed/reader/gestureArbitration.ts'),
      'utf8'
    )
    expect(arb).toContain('activatePx: 14')
    expect(arb).toContain('dominance: 1.35')
    expect(arb).toContain('completePx: 72')
    expect(arb).toContain('hardCompleteProgress: 0.32')
  })

  it('HUD retained and extended with lifecycle ring', () => {
    expect(client).toContain('feed-swipe-event-hud')
    expect(client).toContain('pushSwipeLifecycle')
    expect(client).toContain('lifecycle:')
  })
})
