/**
 * Feed V2 chrome geometry — navbar-safe card layout tokens.
 * Mobile bottom nav + safe-area; desktop uses a light breathing pad only.
 */

/** Breathing space above the visible mobile bottom-nav pill (12–20px band). */
export const FEED_V2_BOTTOM_NAV_BREATH_REM = 1

/**
 * CSS custom properties for Feed V2 card chrome.
 * Consumed by FullscreenNewsCard + globals.
 */
export const FEED_V2_CHROME_CSS_VARS = {
  /** Reserved space above floating MobileNav so Haberi Oku / publisher stay tappable. */
  '--feed-v2-bottom-clearance':
    'calc(var(--mobile-nav-pill-h, 3.5rem) + var(--mobile-nav-float-gap, 0.625rem) + var(--safe-bottom, 0px) + 1rem)',
  /** Approximate top chrome already accounted by site Navbar spacer + category chips. */
  '--feed-v2-top-clearance':
    'max(5.5rem, calc(var(--mobile-sat, env(safe-area-inset-top, 0px)) + 4.25rem))',
} as const

/** Pure helper for tests — bottom clearance formula without env(). */
export function feedV2BottomClearancePx(opts: {
  pillH: number
  floatGap: number
  safeBottom: number
  breathPx?: number
}): number {
  const breath = opts.breathPx ?? 16
  return opts.pillH + opts.floatGap + opts.safeBottom + breath
}

/** Viewports used in nav-safe regression matrix. */
export const FEED_V2_LAYOUT_TEST_HEIGHTS = [667, 736, 812, 844, 852, 896, 932] as const
