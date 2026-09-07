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
    'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.65rem))',
  /** Top clearance for Feed category chips + floating exit (when present). */
  '--feed-v2-top-clearance':
    'max(5.25rem, calc(var(--mobile-sat, env(safe-area-inset-top, 0px)) + 4rem))',
  /** Reserved lower interaction band: Haberi Oku + publisher/follow. */
  '--feed-v2-action-zone': '7.25rem',
  /** Flexible hero floor — yields before actions clip. */
  '--feed-v2-hero-min': 'clamp(4vh, 8vh, 12vh)',
} as const

/** Pure helper for tests — safe-area bottom clearance (no MobileNav pill). */
export function feedV2BottomClearancePx(opts: {
  safeBottom: number
  breathPx?: number
}): number {
  const breath = opts.breathPx ?? 10
  return Math.max(16, opts.safeBottom + breath)
}

/** Approximate reserved action zone (CTA + publisher) in px. */
export function feedV2ActionZonePx(): number {
  return 116
}

/**
 * Available content budget after top Feed chrome + bottom safe area.
 * Does not include hero — hero is leftover flex space.
 */
export function feedV2ContentBudgetPx(opts: {
  viewportHeight: number
  safeTop?: number
  safeBottom?: number
  topChromePx?: number
}): number {
  const safeTop = opts.safeTop ?? 0
  const safeBottom = opts.safeBottom ?? 0
  const topChrome = opts.topChromePx ?? Math.max(84, safeTop + 64)
  const bottom = feedV2BottomClearancePx({ safeBottom })
  return Math.max(0, opts.viewportHeight - topChrome - bottom)
}

/**
 * Prove CTA+publisher remain above the safe bottom for a viewport height,
 * given clamped copy height and reserved action zone.
 */
export function feedV2ActionsFitViewport(opts: {
  viewportHeight: number
  safeTop?: number
  safeBottom?: number
  copyPreviewPx: number
  actionZonePx?: number
}): boolean {
  const budget = feedV2ContentBudgetPx(opts)
  const actions = opts.actionZonePx ?? feedV2ActionZonePx()
  const heroFloor = Math.min(opts.viewportHeight * 0.08, 72)
  return budget - heroFloor - opts.copyPreviewPx - actions >= 0
}

/** Viewports used in layout regression matrix (w×h). */
export const FEED_V2_LAYOUT_TEST_VIEWPORTS = [
  { w: 375, h: 667 },
  { w: 390, h: 736 },
  { w: 375, h: 812 },
  { w: 390, h: 844 },
  { w: 393, h: 852 },
  { w: 414, h: 896 },
  { w: 430, h: 932 },
] as const

/** @deprecated Prefer FEED_V2_LAYOUT_TEST_VIEWPORTS */
export const FEED_V2_LAYOUT_TEST_HEIGHTS = FEED_V2_LAYOUT_TEST_VIEWPORTS.map((v) => v.h)

/** Summary line clamp by viewport height (presentation only). */
export function feedV2SummaryLineClamp(viewportHeight: number): number {
  if (viewportHeight < 700) return 2
  if (viewportHeight < 820) return 3
  return 4
}

/** Headline line clamp by viewport height (presentation only). */
export function feedV2HeadlineLineClamp(viewportHeight: number): number {
  if (viewportHeight < 700) return 3
  return 4
}
