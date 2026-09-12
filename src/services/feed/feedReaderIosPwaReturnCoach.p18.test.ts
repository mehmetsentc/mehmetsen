/**
 * P0 — iOS PWA Reader return + swipe coach recovery contracts.
 * Feed→Reader LEFT open must remain unchanged.
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
  shouldIgnoreSystemBackEdge,
  shouldIgnoreSystemBackEdgeForReaderReturn,
} from '@/lib/feed/reader/gestureArbitration'
import {
  SWIPE_DISCOVERY_STORAGE_KEY,
  shouldShowSwipeDiscoveryCoach,
} from '@/lib/feed/reader/swipeDiscoveryCoach'
import {
  READER_RETURN_COACH_STORAGE_KEY,
  shouldShowReaderReturnCoach,
} from '@/lib/feed/reader/readerReturnCoach'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('Feed→Reader direction frozen (6567213 / 81f8558)', () => {
  it('LEFT open / RIGHT return progress signs unchanged', () => {
    expect(feedToReaderProgress(-100, 390)).toBeCloseTo(100 / 390)
    expect(feedToReaderProgress(100, 390)).toBe(0)
    expect(readerToFeedProgress(100, 390)).toBeCloseTo(100 / 390)
    expect(readerToFeedProgress(-100, 390)).toBe(0)
  })
})

describe('iOS PWA Reader return — system edge arbitration', () => {
  it('browser still ignores left edge; standalone PWA does not', () => {
    expect(shouldIgnoreSystemBackEdge(10, 390)).toBe(true)
    expect(
      shouldIgnoreSystemBackEdgeForReaderReturn(10, 390, { standalone: false })
    ).toBe(true)
    expect(
      shouldIgnoreSystemBackEdgeForReaderReturn(10, 390, { standalone: true })
    ).toBe(false)
    expect(
      shouldIgnoreSystemBackEdgeForReaderReturn(80, 390, { standalone: true })
    ).toBe(false)
  })

  it('Reader wires standalone edge + horizontal touch-action lock', () => {
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')
    expect(reader).toContain('shouldIgnoreSystemBackEdgeForReaderReturn')
    expect(reader).toContain('isStandaloneDisplayMode()')
    expect(reader).toContain('returnHorizontalLocked')
    expect(reader).toContain("touchAction: returnHorizontalLocked ? 'none' : 'pan-y'")
    expect(reader).toContain('data-reader-standalone')
  })
})

describe('swipe coaches — LEFT open / RIGHT return + re-teach keys', () => {
  it('Feed coach storage key is v9 and teaches LEFT', () => {
    expect(SWIPE_DISCOVERY_STORAGE_KEY).toBe('nahaber.feedSwipeDiscovery.v9')
    expect(shouldShowSwipeDiscoveryCoach({ state: { learned: false, shownCount: 0 } })).toBe(true)
    expect(shouldShowSwipeDiscoveryCoach({ state: { learned: true, shownCount: 2 } })).toBe(false)

    const coach = read('src/components/feed/smart/SwipeDiscoveryCoach.tsx')
    expect(coach).toContain('Sola kaydır')
    expect(coach).toContain('data-swipe-discovery-v9')
    expect(coach).toContain('setTravel(-SWIPE_DISCOVERY_TRAVEL_PX)')
    expect(coach).not.toContain('Sağa kaydır veya dokun')
  })

  it('Reader coach storage key is v5 and teaches RIGHT', () => {
    expect(READER_RETURN_COACH_STORAGE_KEY).toBe('nahaber.readerReturnCoach.v5')
    expect(shouldShowReaderReturnCoach({ state: { learned: false, shownCount: 0 } })).toBe(true)
    expect(shouldShowReaderReturnCoach({ state: { learned: true, shownCount: 1 } })).toBe(false)

    const coach = read('src/components/feed/smart/ReaderReturnCoach.tsx')
    expect(coach).toContain('sağa kaydır')
    expect(coach).toContain('data-reader-return-coach-v5')
    expect(coach).toContain('setTravel(READER_RETURN_COACH_TRAVEL_PX)')
    expect(coach).toContain('pointer-events-none absolute')
  })

  it('learned only via physical swipe paths in SmartFeedClient / Reader', () => {
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(client).toContain("openSource === 'swipe' || openSource === 'swipe_affordance'")
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')
    expect(reader).toContain("if (reason === 'gesture') markReaderReturnCoachLearned()")
    expect(reader).not.toContain("beginClose('button'); markReaderReturnCoachLearned")
  })
})
