import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  decideFeedCardTap,
  FEED_CARD_DOUBLE_TAP_MS,
} from '@/lib/feed/reader/feedCardTapGesture'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('Feed 2 card tap', () => {
  it('single tap opens; double tap likes; move/controls are ignored', () => {
    expect(decideFeedCardTap({ moved: false, ignoreTarget: false, now: 1000, lastTapAt: 0 })).toBe(
      'single-open'
    )
    expect(
      decideFeedCardTap({
        moved: false,
        ignoreTarget: false,
        now: 1000,
        lastTapAt: 1000 - FEED_CARD_DOUBLE_TAP_MS + 20,
      })
    ).toBe('double-like')
    expect(
      decideFeedCardTap({
        moved: false,
        ignoreTarget: false,
        now: 1000,
        lastTapAt: 1000 - FEED_CARD_DOUBLE_TAP_MS - 1,
      })
    ).toBe('single-open')
    expect(decideFeedCardTap({ moved: true, ignoreTarget: false, now: 1000, lastTapAt: 0 })).toBe(
      'ignore'
    )
    expect(decideFeedCardTap({ moved: false, ignoreTarget: true, now: 1000, lastTapAt: 900 })).toBe(
      'ignore'
    )
  })

  it('city, Antalya, and nahaber Feed 2 share the same SmartFeed card tap', () => {
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    const hook = read('src/lib/feed/reader/useFeedCardTapGestures.ts')
    const cityLoader = read('src/components/city/CityMobileFeedLoader.tsx')
    const national = read('src/app/(main)/feed-v2/page.tsx')
    const cityPage = read('src/components/city/CitySmartFeedPage.tsx')

    expect(card).toContain("from '@/lib/feed/reader/useFeedCardTapGestures'")
    expect(card).toContain('data-testid="smart-feed-tap-surface"')
    expect(card).toContain('{...tapGestures}')
    expect(card).not.toMatch(/lockCitySlug|canakkale|antalya|www\.nahaber/)
    expect(hook).toContain('onSingleTapRef.current()')
    expect(hook).toContain('onDoubleTapLikeRef.current')
    expect(hook).toContain('FEED_CARD_DOUBLE_TAP_MS')
    expect(cityLoader).toContain('SmartFeedClient')
    expect(national).toContain('SmartFeedClient')
    expect(cityPage).toContain('SmartFeedClient')
  })
})
