/**
 * P18 — Real-iPhone Feed→Reader swipe: touch-action ownership forensic tests.
 * AUTOMATED only — not HUMAN GO.
 *
 * Root cause class: hit-tested touch-action:manipulation on the hero zone lets
 * iOS WebKit own horizontal pan → pointercancel before axis lock / capture.
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
import {
  classifyAxisIntent,
  feedToReaderProgress,
  READER_GESTURE,
  shouldCompleteTransition,
} from '@/lib/feed/reader/gestureArbitration'

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('iOS touch-action ownership for Feed→Reader open', () => {
  const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
  const client = read('src/components/feed/smart/SmartFeedClient.tsx')
  const surface = client.slice(
    client.indexOf('function FeedCardWithImpression'),
    client.indexOf('function FeedCardWithImpression') + 14000
  )

  it('hero + gesture surface declare pan-y (not manipulation) for open ownership', () => {
    expect(card).toContain('data-feed-open-touch-action="pan-y"')
    expect(card).toContain('flex-1 touch-pan-y')
    expect(card).not.toMatch(
      /data-testid="smart-feed-double-tap-zone"[\s\S]{0,400}touch-manipulation/
    )
    expect(surface).toContain('data-feed-open-touch-action="pan-y"')
    expect(surface).toContain('touch-pan-y')
    expect(surface).toContain("touchAction: horizontalLocked ? 'none'")
  })

  it('media layer cannot own default touch-action:auto under the hero', () => {
    expect(card).toMatch(
      /pointer-events-none absolute inset-0 bg-black[\s\S]{0,40}smart-feed-media|smart-feed-media[\s\S]{0,80}pointer-events-none/
    )
  })

  it('pointercancel aborts open (no dispatch) — contract remains snap-back only', () => {
    expect(surface).toContain('onPointerCancel')
    expect(surface).toContain('onOpenReaderCancel')
    const cancelBlock = surface.slice(
      surface.indexOf('onPointerCancel'),
      surface.indexOf('onPointerCancel') + 280
    )
    expect(cancelBlock).not.toContain('onOpenReaderGesture')
    expect(cancelBlock).not.toContain('dispatchFeedOpenGesture')
  })

  it('capture only after horizontal lock; Haberi Oku keeps touch-manipulation', () => {
    const downBlock = surface.slice(
      surface.indexOf('onPointerDown={(e) => {'),
      surface.indexOf('onPointerUp={(e) => {')
    )
    expect(downBlock).not.toContain('setPointerCapture(e.pointerId)')
    expect(downBlock).toContain('setPointerCapture(ev.pointerId)')
    expect(card).toContain('smart-feed-read-cta')
    expect(card).toMatch(/smart-feed-read-cta[\s\S]{0,500}touch-manipulation/)
  })
})

describe('direction + thresholds (finger RIGHT / positive dx)', () => {
  it('documents product direction unambiguously', () => {
    // finger: x=80 → x=260 on 390vw → dx=+180 → open
    expect(feedToReaderProgress(180, 390)).toBeCloseTo(180 / 390, 5)
    expect(feedToReaderProgress(-180, 390)).toBe(0)
  })

  it('examples: activate / cancel / open', () => {
    // dx=-20, dy=3 → horizontal axis but negative dx never progresses open
    expect(classifyAxisIntent(-20, 3)).toBe('horizontal')
    expect(
      classifyFeedOpenGestureDecision({
        dx: -20,
        dy: 3,
        startClientX: 300,
        viewportWidth: 390,
        velocityX: -0.2,
      }).open
    ).toBe(false)

    // dx=-80, dy=10 → LEFT finger — must NOT open
    expect(
      classifyFeedOpenGestureDecision({
        dx: -80,
        dy: 10,
        startClientX: 300,
        viewportWidth: 390,
        velocityX: -0.6,
      }).open
    ).toBe(false)

    // dx=+80, dy=10 → RIGHT axis lock, but below completePx/hardComplete without flick
    const rightShort = classifyFeedOpenGestureDecision({
      dx: 80,
      dy: 10,
      startClientX: 80,
      viewportWidth: 390,
      velocityX: 0.6,
    })
    expect(rightShort.axis).toBe('horizontal')
    expect(rightShort.open).toBe(false)

    // dx=+160, dy=10 → completes
    const right = classifyFeedOpenGestureDecision({
      dx: 160,
      dy: 10,
      startClientX: 80,
      viewportWidth: 390,
      velocityX: 0.6,
    })
    expect(right.axis).toBe('horizontal')
    expect(right.open).toBe(true)

    // dx=-100, dy=90 → not horizontal-dominant (100 < 90*1.35)
    expect(classifyAxisIntent(-100, 90)).toBe('none')
  })

  it('hardComplete and below-threshold', () => {
    const width = 390
    const hardDx = READER_GESTURE.hardCompleteProgress * width
    expect(
      shouldCompleteTransition({
        progress: feedToReaderProgress(hardDx, width),
        velocityX: 0,
      })
    ).toBe(true)
    expect(
      shouldCompleteTransition({
        progress: feedToReaderProgress(20, width),
        velocityX: 0,
      })
    ).toBe(false)
  })

  it('interactive targets block gesture start; blank/h2 do not', () => {
    const button = { closest: (sel: string) => (sel.includes('button') ? button : null) }
    const blank = { closest: () => null }
    expect(shouldIgnoreFeedOpenGestureTarget(button as unknown as EventTarget)).toBe(true)
    expect(shouldIgnoreFeedOpenGestureTarget(blank as unknown as EventTarget)).toBe(false)
  })

  it('dispatch opens only on completing RIGHT swipe', () => {
    let n = 0
    expect(
      dispatchFeedOpenGesture({
        dx: 160,
        dy: 4,
        startClientX: 70,
        viewportWidth: 390,
        velocityX: 0.8,
        onOpen: () => {
          n += 1
        },
      })
    ).toBe(true)
    expect(n).toBe(1)
    expect(
      dispatchFeedOpenGesture({
        dx: -160,
        dy: 4,
        startClientX: 300,
        viewportWidth: 390,
        velocityX: -0.8,
        onOpen: () => {
          n += 1
        },
      })
    ).toBe(false)
    expect(n).toBe(1)
  })
})

describe('coach tap is separate from drag gesture', () => {
  it('SwipeDiscoveryCoach uses affordance tap authority, not drag capture', () => {
    const coach = read('src/components/feed/smart/SwipeDiscoveryCoach.tsx')
    const smart = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(coach).toContain('onAffordanceActivate')
    expect(coach).toContain('data-no-reader-gesture="1"')
    expect(coach).not.toContain('setPointerCapture')
    expect(smart).toContain("onRead(item, index, 'swipe_affordance')")
  })
})
