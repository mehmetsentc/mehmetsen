/**
 * Feed V2 chrome geometry — immersive card layout tokens.
 * No MobileNav on /feed-v2 — only home-indicator / safe-area breathing.
 */

/**
 * CSS custom properties for Feed V2 card chrome.
 * Consumed by FullscreenNewsCard + globals.
 */
export const FEED_V2_CHROME_CSS_VARS = {
  /**
   * Bottom pad without MobileNav reservation.
   * Safe-area + light breath so Haberi Oku / publisher clear the home indicator.
   */
  '--feed-v2-bottom-clearance':
    'max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.85rem))',
  /** Top clearance for Feed category chips + floating exit (when present). */
  '--feed-v2-top-clearance':
    'max(5.5rem, calc(var(--mobile-sat, env(safe-area-inset-top, 0px)) + 4.25rem))',
} as const

/** Pure helper for tests — safe-area bottom clearance (no MobileNav pill). */
export function feedV2BottomClearancePx(opts: {
  safeBottom: number
  breathPx?: number
}): number {
  const breath = opts.breathPx ?? 14
  return Math.max(20, opts.safeBottom + breath)
}

/** Viewports used in layout regression matrix. */
export const FEED_V2_LAYOUT_TEST_HEIGHTS = [667, 736, 812, 844, 852, 896, 932] as const
