/**
 * Shared Feed 2 tap contract — city (Çanakkale / Antalya) and national nahaber.com.
 * Single tap opens the article; double tap likes. No host-specific branching.
 */
export const FEED_CARD_DOUBLE_TAP_MS = 280
export const FEED_CARD_TAP_MOVE_PX = 14

export const FEED_CARD_TAP_IGNORE_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '[data-no-reader-gesture="1"]',
  '[data-testid="smart-feed-discovery-rail"]',
  '[data-testid="smart-feed-social-dock"]',
].join(', ')

type ClosestCapable = { closest: (selectors: string) => unknown }

export function shouldIgnoreFeedCardTapTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as unknown as ClosestCapable).closest !== 'function') return false
  return Boolean((target as unknown as ClosestCapable).closest(FEED_CARD_TAP_IGNORE_SELECTOR))
}

export type FeedCardTapDecision = 'ignore' | 'double-like' | 'single-open'

export function decideFeedCardTap(opts: {
  moved: boolean
  ignoreTarget: boolean
  now: number
  lastTapAt: number
  doubleTapMs?: number
}): FeedCardTapDecision {
  if (opts.moved || opts.ignoreTarget) return 'ignore'
  const windowMs = opts.doubleTapMs ?? FEED_CARD_DOUBLE_TAP_MS
  if (opts.lastTapAt > 0 && opts.now - opts.lastTapAt < windowMs) return 'double-like'
  return 'single-open'
}
