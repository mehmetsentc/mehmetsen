/**
 * P18 — Motion + tappable affordance + replace-close HOME fix.
 * AUTOMATED — NOT HUMAN GO.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  markSwipeDiscoveryLearned,
  priorKeysWouldHaveSuppressedCoach,
  readSwipeDiscoveryState,
  recordSwipeDiscoveryShown,
  shouldShowSwipeDiscoveryCoach,
  SWIPE_DISCOVERY_STORAGE_KEY,
  SWIPE_DISCOVERY_STORAGE_KEY_V5,
  SWIPE_DISCOVERY_TRAVEL_PX,
} from '@/lib/feed/reader/swipeDiscoveryCoach'
import {
  markReaderReturnCoachLearned,
  READER_RETURN_COACH_STORAGE_KEY,
  shouldShowReaderReturnCoach,
} from '@/lib/feed/reader/readerReturnCoach'
import {
  planReaderHistoryClose,
  resolveFeedOwnerHistorySync,
  simulateReaderHistoryStack,
} from '@/lib/feed/reader/history'
import { FEED_READER_DURATION_MS, FEED_READER_EASING } from '@/lib/feed/reader/tokens'
import { READER_GESTURE } from '@/lib/feed/reader/gestureArbitration'

const mem = new Map<string, string>()

beforeEach(() => {
  mem.clear()
  // @ts-expect-error test stub
  globalThis.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v)
    },
    removeItem: (k: string) => {
      mem.delete(k)
    },
  }
})

describe('HOME escape — replace close never backs', () => {
  it('owned close plans replace; 20 replace cycles stay on Feed', () => {
    expect(
      planReaderHistoryClose({
        reason: 'gesture',
        readerOpenId: 'r',
        phase: 'active',
        currentState: {
          nahaberFeedReader: true,
          articleId: '1',
          slug: 'a',
          ownsFeedReturn: true,
          readerOpenId: 'r',
          feedSessionId: 'f',
        },
      })
    ).toBe('replace_unowned_feed')

    const sim = simulateReaderHistoryStack({
      initial: ['/', '/feed-v2'],
      openCloseCycles: 20,
      closeMode: 'replace',
    })
    expect(sim.current).toBe('/feed-v2')
    expect(sim.stack.includes('/')).toBe(true) // under Feed is OK
    expect(sim.current).not.toBe('/')
  })

  it('legacy history_back resolve remaps away from back', () => {
    expect(
      resolveFeedOwnerHistorySync({
        planned: 'history_back',
        foreignPopDuringClose: false,
        pathname: '/feed-v2',
        search: '?reader=x',
      })
    ).toBe('replace_unowned_feed')
  })
})

describe('tappable RIGHT/LEFT affordances', () => {
  it('RIGHT Haberi Aç affordance is a button hit target; learns on swipe or affordance', () => {
    expect(SWIPE_DISCOVERY_STORAGE_KEY).toBe('nahaber.feedSwipeDiscovery.v9')
    mem.set(SWIPE_DISCOVERY_STORAGE_KEY_V5, JSON.stringify({ learned: true, shownCount: 99 }))
    expect(priorKeysWouldHaveSuppressedCoach()).toBe(true)
    expect(shouldShowSwipeDiscoveryCoach()).toBe(true)
    for (let i = 0; i < 10; i++) recordSwipeDiscoveryShown()
    expect(shouldShowSwipeDiscoveryCoach()).toBe(true)
    markSwipeDiscoveryLearned()
    expect(readSwipeDiscoveryState().learned).toBe(true)
    expect(shouldShowSwipeDiscoveryCoach()).toBe(false)

    const coach = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SwipeDiscoveryCoach.tsx'),
      'utf8'
    )
    expect(coach).toContain('feed-swipe-discovery-affordance')
    expect(coach).toContain('min-h-11')
    expect(coach).toContain('pointer-events-auto')
    expect(coach).toContain('onAffordanceActivate')
    expect(coach).toContain('data-swipe-discovery-v9')
    expect(SWIPE_DISCOVERY_TRAVEL_PX).toBeGreaterThanOrEqual(36)

    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain("onRead(item, index, 'swipe_affordance')")
    expect(client).toContain("openSource === 'swipe' || openSource === 'swipe_affordance'")
  })

  it('LEFT return affordance taps beginClose(gesture); Back Arrow does not mark learned alone', () => {
    expect(READER_RETURN_COACH_STORAGE_KEY).toBe('nahaber.readerReturnCoach.v5')
    expect(shouldShowReaderReturnCoach()).toBe(true)
    markReaderReturnCoachLearned()
    expect(shouldShowReaderReturnCoach()).toBe(false)

    const coach = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/ReaderReturnCoach.tsx'),
      'utf8'
    )
    expect(coach).toContain('reader-return-affordance')
    expect(coach).toContain('min-h-11')
    expect(coach).toContain('pointer-events-auto')

    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(reader).toContain("onAffordanceActivate={() => beginClose('gesture')}")
    expect(reader).toContain("onClick={() => beginClose('button')}")
    expect(reader).toContain("if (reason === 'gesture') markReaderReturnCoachLearned()")
  })
})

describe('page motion', () => {
  it('duration/easing within iOS-like range; underlay progress wired', () => {
    expect(FEED_READER_DURATION_MS).toBeGreaterThanOrEqual(260)
    expect(FEED_READER_DURATION_MS).toBeLessThanOrEqual(380)
    expect(FEED_READER_EASING).toContain('cubic-bezier')
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('readerUnderlayProgress')
    expect(client).toContain('pageProgress')
    expect(client).toContain('FEED_READER_EASING')
    expect(READER_GESTURE.dominance).toBe(1.35)
    expect(READER_GESTURE.activatePx).toBe(14)
    expect(READER_GESTURE.completePx).toBe(72)
  })
})

describe('card overflow preserved', () => {
  it('nested scroll still hosts CTA/publisher', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('smart-feed-copy-scroll')
    expect(card).toContain('smart-feed-action-zone')
    expect(card).toContain('onSwipeAffordanceActivate')
  })
})
