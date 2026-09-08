/**
 * P18 — Swipe event HUD + live-drag wiring contracts (diagnostic only).
 * AUTOMATED — not HUMAN GO / not a swipe repair.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  appendSwipeEventSequence,
  formatSwipeEventHudLines,
  shouldShowFeedSwipeEventHud,
  EMPTY_SWIPE_EVENT_HUD,
} from '@/lib/feed/reader/swipeEventHud'
import { feedToReaderProgress } from '@/lib/feed/reader/gestureArbitration'

describe('swipe event HUD gate (pilot grant + readerDebug)', () => {
  it('shows only for explicit grant + ?readerDebug=1', () => {
    expect(
      shouldShowFeedSwipeEventHud({
        readerDebugQuery: true,
        currentMatchesActiveFeedReaderGrant: true,
      })
    ).toBe(true)
    expect(
      shouldShowFeedSwipeEventHud({
        readerDebugQuery: true,
        currentMatchesActiveFeedReaderGrant: false,
      })
    ).toBe(false)
    expect(
      shouldShowFeedSwipeEventHud({
        readerDebugQuery: false,
        currentMatchesActiveFeedReaderGrant: true,
      })
    ).toBe(false)
    expect(
      shouldShowFeedSwipeEventHud({
        readerDebugQuery: true,
        currentMatchesActiveFeedReaderGrant: null,
      })
    ).toBe(false)
  })

  it('sequence ring collapses consecutive MOVE and resets on DOWN', () => {
    expect(appendSwipeEventSequence('', 'DOWN')).toBe('DOWN')
    expect(appendSwipeEventSequence('DOWN', 'MOVE')).toBe('DOWN>MOVE')
    expect(appendSwipeEventSequence('DOWN>MOVE', 'MOVE')).toBe('DOWN>MOVE')
    expect(appendSwipeEventSequence('DOWN>MOVE', 'CANCEL')).toBe('DOWN>MOVE>CANCEL')
    expect(appendSwipeEventSequence('DOWN>MOVE>UP', 'DOWN')).toBe('DOWN')
  })

  it('HUD lines are compact and include progress', () => {
    const lines = formatSwipeEventHudLines({
      ...EMPTY_SWIPE_EVENT_HUD,
      event: 'MOVE',
      pointerType: 'touch',
      startX: 80,
      currentX: 200,
      dx: 120,
      startY: 400,
      currentY: 405,
      dy: 5,
      owner: 'HORIZONTAL',
      directionValid: true,
      activated: true,
      captured: true,
      progress: 120 / 390,
      sequence: 'DOWN>MOVE',
      moveCount: 3,
      lastAction: 'LOCK',
    })
    expect(lines.some((l) => l.includes('prog:'))).toBe(true)
    expect(lines.some((l) => l.includes('own:HORIZONTAL'))).toBe(true)
  })
})

describe('live drag wiring (code contracts)', () => {
  const client = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
    'utf8'
  )

  it('pointermove sets dragProgress AND onOpenReaderProgress during drag', () => {
    const fn = client.slice(client.indexOf('function FeedCardWithImpression'))
    expect(fn).toContain('setDragProgress(progress)')
    expect(fn).toContain('onOpenReaderProgress?.(progress)')
    expect(fn).toContain('feedToReaderProgress(dx, width)')
    expect(fn).toContain('translate3d(${-pageProgress * 28}%')
  })

  it('parent creates readerSession on progress before commit', () => {
    expect(client).toContain('onOpenReaderProgress={')
    expect(client).toContain('committed: false')
    expect(client).toContain('openSource: \'swipe\'')
    expect(client).toContain('{readerSession ? (')
  })

  it('HUD mounts with pointer-events-none and no speculative threshold edits', () => {
    expect(client).toContain('feed-swipe-event-hud')
    expect(client).toContain('pointer-events-none')
    expect(client).toContain('shouldShowFeedSwipeEventHud')
    const arb = readFileSync(
      join(process.cwd(), 'src/lib/feed/reader/gestureArbitration.ts'),
      'utf8'
    )
    expect(arb).toContain('activatePx: 14')
    expect(arb).toContain('dominance: 1.35')
    expect(arb).toContain('completePx: 72')
    expect(arb).toContain('hardCompleteProgress: 0.32')
  })

  it('-dx progress is monotonic; +dx stays 0', () => {
    const w = 390
    expect(feedToReaderProgress(-20, w)).toBeCloseTo(20 / 390)
    expect(feedToReaderProgress(-50, w)).toBeCloseTo(50 / 390)
    expect(feedToReaderProgress(-100, w)).toBeCloseTo(100 / 390)
    expect(feedToReaderProgress(-180, w)).toBeCloseTo(180 / 390)
    expect(feedToReaderProgress(180, w)).toBe(0)
    expect(feedToReaderProgress(-20, w) < feedToReaderProgress(-50, w)).toBe(true)
  })
})
