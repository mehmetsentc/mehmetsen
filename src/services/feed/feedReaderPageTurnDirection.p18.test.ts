/**
 * P0 — Feed↔Reader native page-turn direction (human product authority).
 * Feed→Reader: finger LEFT (dx<0), Reader enters from RIGHT.
 * Reader→Feed: finger RIGHT (dx>0), Reader exits RIGHT.
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
  feedToReaderProgress,
  readerToFeedProgress,
  shouldCompleteTransition,
} from '@/lib/feed/reader/gestureArbitration'
import {
  classifyFeedOpenGestureDecision,
  dispatchFeedOpenGesture,
} from '@/lib/feed/reader/feedOpenGesture'

describe('product direction: Feed LEFT open / Reader RIGHT close', () => {
  const w = 390

  it('sign table for open/close progress', () => {
    expect(feedToReaderProgress(0, w)).toBe(0)
    expect(feedToReaderProgress(-20, w)).toBeCloseTo(20 / w)
    expect(feedToReaderProgress(-80, w)).toBeCloseTo(80 / w)
    expect(feedToReaderProgress(-180, w)).toBeCloseTo(180 / w)
    expect(feedToReaderProgress(180, w)).toBe(0) // wrong direction

    expect(readerToFeedProgress(0, w)).toBe(0)
    expect(readerToFeedProgress(80, w)).toBeCloseTo(80 / w)
    expect(readerToFeedProgress(-80, w)).toBe(0) // wrong direction
  })

  it('LEFT swipe opens; RIGHT swipe does not', () => {
    expect(
      classifyFeedOpenGestureDecision({
        dx: -160,
        dy: 4,
        startClientX: 300,
        viewportWidth: w,
        velocityX: -0.8,
      }).open
    ).toBe(true)
    expect(
      classifyFeedOpenGestureDecision({
        dx: 160,
        dy: 4,
        startClientX: 80,
        viewportWidth: w,
        velocityX: 0.8,
      }).open
    ).toBe(false)
  })

  it('dispatch opens only on completing LEFT swipe', () => {
    let n = 0
    expect(
      dispatchFeedOpenGesture({
        dx: -160,
        dy: 4,
        startClientX: 300,
        viewportWidth: w,
        velocityX: -0.8,
        onOpen: () => {
          n += 1
        },
      })
    ).toBe(true)
    expect(n).toBe(1)
    expect(
      dispatchFeedOpenGesture({
        dx: 160,
        dy: 4,
        startClientX: 80,
        viewportWidth: w,
        velocityX: 0.8,
        onOpen: () => {
          n += 1
        },
      })
    ).toBe(false)
  })

  it('complete transition uses positive velocity in completing direction', () => {
    const p = feedToReaderProgress(-140, w)
    expect(shouldCompleteTransition({ progress: p, velocityX: 0.6 })).toBe(true)
  })
})

describe('wiring: transforms + coaches + single Reader key', () => {
  const client = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
    'utf8'
  )
  const reader = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
    'utf8'
  )
  const coach = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/SwipeDiscoveryCoach.tsx'),
    'utf8'
  )
  const ret = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/ReaderReturnCoach.tsx'),
    'utf8'
  )
  const comments = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/CommentsBottomSheet.tsx'),
    'utf8'
  )
  const discovery = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/FeedDiscoveryRail.tsx'),
    'utf8'
  )

  it('Feed underlay moves LEFT; Reader enters from RIGHT', () => {
    expect(client).toContain('translate3d(${-pageProgress * 28}%')
    expect(reader).toContain('translate3d(${(1 - progress) * 100}%')
    expect(client).toContain('finger LEFT only (negative dx)')
    expect(reader).toContain('finger RIGHT only (positive dx)')
  })

  it('single Reader ownership key uses generation (stable across commit)', () => {
    expect(client).toContain('key={`reader-${readerSession.generation}`}')
    expect(client).toContain('MOUNT_READER:')
    expect(client).toContain('UNMOUNT_READER:')
  })

  it('discovery uses article category context', () => {
    expect(client).toContain('discoveryCategory={item.category ?? category}')
    expect(discovery).toContain('Prefer same-category')
  })

  it('coaches teach LEFT open / RIGHT return', () => {
    expect(coach).toContain('Sola kaydır')
    expect(coach).not.toContain('Sağa kaydır veya dokun')
    expect(ret).toContain('sağa kaydır veya dokun')
  })

  it('comments composer enforces 16px to avoid iOS focus zoom', () => {
    expect(comments).toContain("fontSize: '16px'")
    expect(comments).toContain('data-ios-font-min="16"')
    expect(comments).toContain('setViewportBox(null)')
  })
})
