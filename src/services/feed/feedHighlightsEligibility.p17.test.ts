/**
 * P17 Feed V2 — Highlights eligibility (deterministic placement).
 * AUTOMATED — NOT HUMAN GO.
 */
import { describe, expect, it } from 'vitest'
import {
  FEED_HIGHLIGHTS_CADENCE,
  FEED_HIGHLIGHTS_MIN_ITEMS,
  FEED_HIGHLIGHTS_MIN_VIEWPORT_HEIGHT,
  shouldShowFeedHighlights,
} from '@/lib/feed/feedHighlightsEligibility'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('shouldShowFeedHighlights', () => {
  it('is not eligible on every article', () => {
    const results = Array.from({ length: 16 }, (_, index) =>
      shouldShowFeedHighlights({
        index,
        itemsLength: 20,
        category: 'spor',
        viewportHeight: 812,
      })
    )
    const eligible = results.filter((r) => r.eligible)
    expect(eligible.length).toBe(2) // positions 8 and 16 (1-based)
    expect(eligible.every((r) => r.reason === 'eligible')).toBe(true)
    expect(results[0]?.eligible).toBe(false)
    expect(results[7]?.eligible).toBe(true)
    expect(results[8]?.eligible).toBe(false)
  })

  it('is deterministic for the same input', () => {
    const input = {
      index: 7,
      itemsLength: 20,
      category: 'teknoloji',
      viewportHeight: 844,
    }
    expect(shouldShowFeedHighlights(input)).toEqual(shouldShowFeedHighlights(input))
  })

  it('prevents consecutive Highlights via cadence spacing', () => {
    expect(FEED_HIGHLIGHTS_CADENCE).toBeGreaterThanOrEqual(2)
    for (let i = 0; i < 24; i++) {
      const a = shouldShowFeedHighlights({
        index: i,
        itemsLength: 30,
        category: 'dunya',
        viewportHeight: 812,
      })
      const b = shouldShowFeedHighlights({
        index: i + 1,
        itemsLength: 30,
        category: 'dunya',
        viewportHeight: 812,
      })
      if (a.eligible) expect(b.eligible).toBe(false)
    }
  })

  it('suppresses last card, missing category, short viewport', () => {
    expect(
      shouldShowFeedHighlights({
        index: 7,
        itemsLength: 8,
        category: 'spor',
        viewportHeight: 812,
      }).reason
    ).toBe('last-card')
    expect(
      shouldShowFeedHighlights({
        index: 7,
        itemsLength: 20,
        category: null,
        viewportHeight: 812,
      }).reason
    ).toBe('no-category')
    expect(
      shouldShowFeedHighlights({
        index: 7,
        itemsLength: 20,
        category: 'spor',
        viewportHeight: FEED_HIGHLIGHTS_MIN_VIEWPORT_HEIGHT - 1,
      }).reason
    ).toBe('short-viewport')
  })

  it('wire: SmartFeedClient uses eligibility authority', () => {
    const client = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(client).toContain('shouldShowFeedHighlights')
    expect(client).toContain('viewportHeight: cardHeightPx')
    expect(client).not.toContain(
      'showDiscoveryRail={(index + 1) % 8 === 0 && index < items.length - 1}'
    )
  })

  it('Feed rail quality gate requires >=2 items', () => {
    expect(FEED_HIGHLIGHTS_MIN_ITEMS).toBe(2)
    const rail = read('src/components/feed/smart/FeedDiscoveryRail.tsx')
    expect(rail).toContain('next.length >= 2')
    // Reader path unchanged — still allows single items via isReader branch.
    expect(rail).toContain('isReader ? next.length > 0')
  })
})
