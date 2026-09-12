/**
 * P17 — Per-card swipe coach + Reader recommendation layout contracts.
 * AUTOMATED — NOT HUMAN GO. No Production writes.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FEED_COACH_SESSION_MAX_IDS,
  hasFeedCoachShownForArticle,
  listFeedCoachSessionShownIds,
  markFeedCoachHandledForArticle,
  markSwipeDiscoveryLearned,
  resetSwipeDiscoveryPresentation,
  shouldShowSwipeDiscoveryCoach,
  SWIPE_DISCOVERY_STORAGE_KEY,
  SWIPE_DISCOVERY_TRAVEL_PX,
} from '@/lib/feed/reader/swipeDiscoveryCoach'
import {
  hasReaderCoachShownForScope,
  markReaderReturnCoachLearned,
  readerCoachScopeKey,
  resetReaderReturnCoachPresentation,
  shouldShowReaderReturnCoach,
  READER_RETURN_COACH_STORAGE_KEY,
  READER_RETURN_COACH_TRAVEL_PX,
} from '@/lib/feed/reader/readerReturnCoach'
import { FEED_READER_CSS_VARS } from '@/lib/feed/reader/tokens'
import {
  shouldIgnoreSystemBackEdge,
  shouldIgnoreSystemBackEdgeForReaderReturn,
} from '@/lib/feed/reader/gestureArbitration'

const mem = new Map<string, string>()

function installStorage() {
  const api = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => {
      mem.set(k, v)
    },
    removeItem: (k: string) => {
      mem.delete(k)
    },
    clear: () => mem.clear(),
    key: () => null,
    get length() {
      return mem.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: api, configurable: true })
}

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('P17 Feed coach per-article session ownership', () => {
  beforeEach(() => {
    mem.clear()
    installStorage()
    resetSwipeDiscoveryPresentation()
    resetReaderReturnCoachPresentation()
  })
  afterEach(() => {
    resetSwipeDiscoveryPresentation()
    resetReaderReturnCoachPresentation()
  })

  it('1-2: Card A coach once; same A does not endless-repeat', () => {
    expect(shouldShowSwipeDiscoveryCoach({ articleId: 'A' })).toBe(true)
    markFeedCoachHandledForArticle('A')
    expect(shouldShowSwipeDiscoveryCoach({ articleId: 'A' })).toBe(false)
    expect(hasFeedCoachShownForArticle('A')).toBe(true)
  })

  it('3-4-6: Card B / C / D each eligible independently', () => {
    markFeedCoachHandledForArticle('A')
    expect(shouldShowSwipeDiscoveryCoach({ articleId: 'B' })).toBe(true)
    markFeedCoachHandledForArticle('B')
    expect(shouldShowSwipeDiscoveryCoach({ articleId: 'C' })).toBe(true)
    markFeedCoachHandledForArticle('C')
    expect(shouldShowSwipeDiscoveryCoach({ articleId: 'D' })).toBe(true)
  })

  it('5: return to B in same session does not nag', () => {
    markFeedCoachHandledForArticle('B')
    markFeedCoachHandledForArticle('C')
    expect(shouldShowSwipeDiscoveryCoach({ articleId: 'B' })).toBe(false)
  })

  it('7: successful A LEFT swipe does NOT globally suppress B/C/D', () => {
    markSwipeDiscoveryLearned('A')
    expect(shouldShowSwipeDiscoveryCoach({ articleId: 'A' })).toBe(false)
    expect(shouldShowSwipeDiscoveryCoach({ articleId: 'B' })).toBe(true)
    expect(shouldShowSwipeDiscoveryCoach({ articleId: 'C' })).toBe(true)
    expect(shouldShowSwipeDiscoveryCoach({ articleId: 'D' })).toBe(true)
  })

  it('10: Haberi Oku path does not call mark without article scope in client', () => {
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(client).toMatch(/openSource === 'swipe' \|\| openSource === 'swipe_affordance'/)
    expect(client).toContain('markSwipeDiscoveryLearned(item.articleId)')
    expect(client).not.toMatch(/openSource === 'button'\) markSwipeDiscoveryLearned/)
    expect(client).not.toMatch(/haberi_oku.*markSwipeDiscoveryLearned/)
  })

  it('12: Feed coach direction LEFT (negative travel)', () => {
    expect(SWIPE_DISCOVERY_TRAVEL_PX).toBeGreaterThan(0)
    const coach = read('src/components/feed/smart/SwipeDiscoveryCoach.tsx')
    expect(coach).toContain('-SWIPE_DISCOVERY_TRAVEL_PX')
    expect(coach).toContain('Sola kaydır — haberi aç')
    expect(coach).toContain('data-swipe-discovery-v10')
  })

  it('14: coach root is pointer-events-none', () => {
    const coach = read('src/components/feed/smart/SwipeDiscoveryCoach.tsx')
    expect(coach).toContain('pointer-events-none')
    expect(SWIPE_DISCOVERY_STORAGE_KEY).toBe('nahaber.feedSwipeDiscovery.v10')
    expect(FEED_COACH_SESSION_MAX_IDS).toBeLessThanOrEqual(64)
    expect(listFeedCoachSessionShownIds().length).toBe(0)
  })
})

describe('P17 Reader coach per-generation ownership', () => {
  beforeEach(() => {
    mem.clear()
    installStorage()
    resetReaderReturnCoachPresentation()
  })

  it('8-9: Reader A and Reader B coaches are independent', () => {
    const a = readerCoachScopeKey({ articleId: 'A', generation: 1 })
    const b = readerCoachScopeKey({ articleId: 'B', generation: 2 })
    expect(shouldShowReaderReturnCoach({ scopeKey: a })).toBe(true)
    markReaderReturnCoachLearned(a)
    expect(shouldShowReaderReturnCoach({ scopeKey: a })).toBe(false)
    expect(shouldShowReaderReturnCoach({ scopeKey: b })).toBe(true)
    expect(hasReaderCoachShownForScope(a)).toBe(true)
  })

  it('11: Back arrow does not globally disable Reader coaches', () => {
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')
    expect(reader).toContain("if (reason === 'gesture')")
    expect(reader).toContain('markReaderReturnCoachLearned(')
    expect(reader).not.toContain("beginClose('button'); markReaderReturnCoachLearned")
    expect(READER_RETURN_COACH_STORAGE_KEY).toBe('nahaber.readerReturnCoach.v6')
  })

  it('13: Reader coach direction RIGHT (positive travel)', () => {
    expect(READER_RETURN_COACH_TRAVEL_PX).toBeGreaterThan(0)
    const coach = read('src/components/feed/smart/ReaderReturnCoach.tsx')
    expect(coach).toContain('READER_RETURN_COACH_TRAVEL_PX')
    expect(coach).not.toContain('-READER_RETURN_COACH_TRAVEL_PX')
    expect(coach).toContain('Akışa dönmek için sağa kaydır')
    expect(coach).toContain('data-reader-return-coach-v6')
  })
})

describe('P17 Reader recommendations layout', () => {
  it('15-18: recommendations in Reader scroll flow with footer clearance', () => {
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')
    expect(reader).toContain('data-testid="feed-reader-recommendations"')
    expect(reader).toContain('variant="reader"')
    expect(reader).toContain('feed-reader-footer-clearance')
    expect(reader).toContain('--reader-footer-clearance')
    expect(FEED_READER_CSS_VARS['--reader-footer-clearance']).toContain('safe-area-inset-bottom')
    // Absolute footer stays; clearance spacer precedes it in scroll content.
    expect(reader).toContain('data-testid="feed-reader-footer"')
    expect(reader).toMatch(/absolute inset-x-0 bottom-0[\s\S]*feed-reader-footer/)
  })

  it('19-20: empty/short results render cleanly (null when empty)', () => {
    const rail = read('src/components/feed/smart/FeedDiscoveryRail.tsx')
    expect(rail).toContain("loadState === 'empty'")
    expect(rail).toContain('return null')
    expect(rail).toContain('Bu konuda daha fazlası')
    expect(rail).toContain("variant === 'reader'")
  })

  it('21: related open replaces Reader — single generation key', () => {
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(client).toContain('onOpenRelatedArticle')
    expect(client).toContain("openSource: 'unknown'")
    expect(client).toContain('key={`reader-${readerSession.generation}`}')
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')
    expect(reader).toContain('onOpenRelatedArticle')
  })

  it('22: contextual category request remains intact', () => {
    const rail = read('src/components/feed/smart/FeedDiscoveryRail.tsx')
    expect(rail).toContain('?category=')
    expect(rail).toContain('/api/feed/v2/rails')
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')
    expect(reader).toContain('category={item.category}')
  })

  it('recommendation section does not blanket-block Reader return gesture', () => {
    const rail = read('src/components/feed/smart/FeedDiscoveryRail.tsx')
    expect(rail).toContain("isReader ? {} : { 'data-no-reader-gesture': '1' }")
    expect(rail).toContain('data-testid="feed-reader-discovery-tile"')
    expect(rail).toContain('data-no-reader-gesture="1"')
  })
})

describe('P17 gesture + PWA regression contracts', () => {
  it('23-26: Feed LEFT open / Reader RIGHT return / PWA edge / Safari edge', () => {
    const arb = read('src/lib/feed/reader/gestureArbitration.ts')
    expect(arb).toContain('shouldIgnoreSystemBackEdgeForReaderReturn')
    expect(arb).toContain('shouldIgnoreSystemBackEdge')
    expect(
      shouldIgnoreSystemBackEdgeForReaderReturn(4, 390, { standalone: true })
    ).toBe(false)
    expect(shouldIgnoreSystemBackEdge(4, 390)).toBe(true)
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')
    expect(reader).toContain("touchAction: returnHorizontalLocked ? 'none' : 'pan-y'")
    expect(reader).toContain('shouldIgnoreSystemBackEdgeForReaderReturn')
  })

  it('28-29: peek + single Reader preserved', () => {
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(client).toContain('READER_GESTURE.peekProgress')
    expect(client).toContain('key={`reader-${readerSession.generation}`}')
    const matches = client.match(/<FeedArticleReader/g)
    expect(matches?.length).toBe(1)
  })
})
