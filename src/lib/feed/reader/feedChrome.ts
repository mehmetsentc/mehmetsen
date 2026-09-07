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
   * Shared Feed V2 + FeedArticleReader outer surface width.
   * Reader reference (max-w-[44rem]) — Feed must match to avoid open/close jump.
   * Mobile: min(100%, 44rem) = full viewport. Do not shrink Reader.
   */
  '--feed-reader-surface-max': '44rem',
  /**
   * Bottom pad without MobileNav reservation.
   * Design: 16–24px safe breath under publisher.
   */
  '--feed-v2-bottom-clearance':
    'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))',
  /** Top clearance for Feed category chips under site header (Global Nav V2). */
  '--feed-v2-top-clearance': '3.5rem',
  /**
   * Required lower band: Haberi Oku (~56px) + publisher/follow (~48px).
   * Design dikey alan dağılımı.
   */
  '--feed-v2-action-zone': '6.75rem',
  /**
   * Hero / media flexible region — design targets ~38–44% of card height.
   * Floor only; flex-1 grows into remaining space after action zone.
   */
  '--feed-v2-hero-min': 'clamp(28dvh, 34dvh, 40dvh)',
  /**
   * Nested scroll stack: chips + full headline/summary + Haberi Oku + publisher.
   * Caps height so hero retains floor; overflow scrolls to reach CTA/follow.
   */
  '--feed-v2-bottom-stack-max': 'min(54dvh, 26rem)',
  /** @deprecated Prefer bottom-stack nested scroll; kept for diagnostics. */
  '--feed-v2-copy-max': 'min(34dvh, 15.5rem)',
} as const

/** Shared outer surface max width in rem (Feed shell + Reader overlay). */
export const FEED_READER_SURFACE_MAX_REM = 44

/** Tailwind-friendly class for shared surface — keep in sync with CSS var. */
export const FEED_READER_SURFACE_CLASS =
  'w-full max-w-[var(--feed-reader-surface-max,44rem)] md:mx-auto' as const

/** Expected CSS px at 16px root for desktop parity checks. */
export function feedReaderSurfaceMaxPx(rootFontPx = 16): number {
  return FEED_READER_SURFACE_MAX_REM * rootFontPx
}

/** Pure helper for tests — safe-area bottom clearance (no MobileNav pill). */
export function feedV2BottomClearancePx(opts: {
  safeBottom: number
  breathPx?: number
}): number {
  const breath = opts.breathPx ?? 12
  // Design target ~16–24px breath when inset is 0; with inset, clear home indicator.
  return Math.max(16, opts.safeBottom + breath)
}

/** Haberi Oku ~56 + publisher ~48 (design). */
export function feedV2ActionZonePx(): number {
  return 108
}

/** Hero share of card height (design 38–44%). */
export function feedV2HeroShare(viewportHeight: number): { min: number; max: number } {
  return {
    min: Math.round(viewportHeight * 0.38),
    max: Math.round(viewportHeight * 0.44),
  }
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
  // Design: hero ~38% floor; remaining must still fit copy + actions.
  const heroFloor = Math.round(opts.viewportHeight * 0.32)
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
