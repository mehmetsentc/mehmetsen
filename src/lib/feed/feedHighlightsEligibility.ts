/**
 * Feed V2 — Highlights ("Öne Çıkanlar") placement eligibility.
 * Lightweight deterministic gate — NOT a second ranking engine.
 * Reuses existing cadence authority (every 8th card) + quality/layout gates.
 * P17 approved visual ships with blur-bg + sharp fg hero card composition.
 */

/** Existing product cadence: every 8th card (1-based positions 8, 16, …). */
export const FEED_HIGHLIGHTS_CADENCE = 8

/**
 * Below this viewport height, optional Highlights may be suppressed so
 * headline / summary / Haberi Oku remain readable (READABILITY > discovery).
 */
export const FEED_HIGHLIGHTS_MIN_VIEWPORT_HEIGHT = 640

/** Feed rail quality floor — weaker than this → hide module (rail also enforces). */
export const FEED_HIGHLIGHTS_MIN_ITEMS = 2

export type FeedHighlightsEligibilityInput = {
  /** 0-based index in the current Feed window. */
  index: number
  itemsLength: number
  category?: string | null
  /** Optional layout gate (CSS px). Omit to skip short-viewport suppression. */
  viewportHeight?: number | null
}

export type FeedHighlightsEligibilityResult = {
  eligible: boolean
  reason:
    | 'eligible'
    | 'empty-feed'
    | 'last-card'
    | 'cadence'
    | 'no-category'
    | 'short-viewport'
}

/**
 * Deterministic Highlights placement for Feed cards.
 * Same inputs → same result. No Math.random.
 *
 * Consecutive Highlights are prevented by cadence spacing (8).
 */
export function shouldShowFeedHighlights(
  input: FeedHighlightsEligibilityInput
): FeedHighlightsEligibilityResult {
  const { index, itemsLength, category, viewportHeight } = input

  if (!Number.isFinite(itemsLength) || itemsLength <= 0) {
    return { eligible: false, reason: 'empty-feed' }
  }
  if (!Number.isFinite(index) || index < 0 || index >= itemsLength) {
    return { eligible: false, reason: 'empty-feed' }
  }
  // Never on the last loaded card (existing SmartFeedClient rule).
  if (index >= itemsLength - 1) {
    return { eligible: false, reason: 'last-card' }
  }
  // Preserve approved cadence: (index + 1) % 8 === 0
  if ((index + 1) % FEED_HIGHLIGHTS_CADENCE !== 0) {
    return { eligible: false, reason: 'cadence' }
  }
  if (!category?.trim()) {
    return { eligible: false, reason: 'no-category' }
  }
  if (
    viewportHeight != null &&
    Number.isFinite(viewportHeight) &&
    viewportHeight > 0 &&
    viewportHeight < FEED_HIGHLIGHTS_MIN_VIEWPORT_HEIGHT
  ) {
    return { eligible: false, reason: 'short-viewport' }
  }

  return { eligible: true, reason: 'eligible' }
}
