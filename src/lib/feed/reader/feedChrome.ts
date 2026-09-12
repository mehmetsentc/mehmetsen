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
   * Required lower band: Haberi Oku (~56px) + gap + publisher/follow (~48px).
   * Protected — always first-paint visible (outside nested copy scroll).
   */
  '--feed-v2-action-zone': '7.5rem',
  /**
   * Hero / media — flex zone for sharp foreground image + tap surface.
   * Short phones: shorter media. Tall phones: larger primary hero.
   */
  '--feed-v2-hero-min': 'clamp(16dvh, 22dvh, 28dvh)',
  '--feed-v2-hero-max': 'clamp(32dvh, 44dvh, 52dvh)',
  /**
   * Copy-only nested scroll cap (chips + full headline/summary).
   * Action stack sits BELOW this region and must not require scroll.
   */
  '--feed-v2-copy-scroll-max': 'min(38dvh, 17rem)',
  /**
   * Typographic rhythm (reference visual — not line-clamp).
   */
  '--feed-v2-gap-cat-headline': '0.75rem',
  '--feed-v2-gap-headline-summary': '0.875rem',
  '--feed-v2-gap-summary-cta': '1.375rem',
  '--feed-v2-gap-cta-publisher': '0.875rem',
  /**
   * @deprecated Alias kept for older diagnostics; prefer copy-scroll-max.
   * Bottom chrome total room ≈ copy + action (not a scroll that hides publisher).
   */
  '--feed-v2-bottom-stack-max': 'min(62dvh, 28rem)',
  /** @deprecated Prefer bottom-stack / copy-scroll; kept for diagnostics. */
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

/** Haberi Oku ~56 + gap ~14 + publisher ~48 (design). */
export function feedV2ActionZonePx(): number {
  return 120
}

/**
 * Adaptive hero floor by viewport height (content/actions win on short phones).
 */
export function feedV2HeroMinPx(viewportHeight: number): number {
  if (viewportHeight <= 700) return Math.round(viewportHeight * 0.16)
  if (viewportHeight <= 812) return Math.round(viewportHeight * 0.2)
  return Math.round(viewportHeight * 0.24)
}

/** Hero share of card height (design — flex leftover, capped). */
export function feedV2HeroShare(viewportHeight: number): { min: number; max: number } {
  return {
    min: feedV2HeroMinPx(viewportHeight),
    max: Math.round(viewportHeight * 0.48),
  }
}

/** Reference rhythm gaps (CSS px targets for tests). */
export const FEED_V2_RHYTHM_GAPS = {
  catHeadlineMin: 10,
  catHeadlineMax: 14,
  headlineSummaryMin: 12,
  headlineSummaryMax: 16,
  summaryCtaMin: 20,
  summaryCtaMax: 24,
  ctaPublisherMin: 12,
  ctaPublisherMax: 16,
} as const

export function feedV2RhythmGapsOk(gaps: {
  headlineToSummary: number
  summaryToCta: number
  ctaToPublisher: number
}): boolean {
  const g = FEED_V2_RHYTHM_GAPS
  return (
    gaps.headlineToSummary >= g.headlineSummaryMin - 1 &&
    gaps.summaryToCta >= g.summaryCtaMin - 2 &&
    gaps.ctaToPublisher >= g.ctaPublisherMin - 1
  )
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
 * First-paint invariant: chips + full copy + Haberi Oku + publisher fit without
 * nested scroll, given adaptive hero floor.
 */
export function feedV2FirstPaintFits(opts: {
  viewportHeight: number
  safeTop?: number
  safeBottom?: number
  topChromePx?: number
  copyPx: number
  actionZonePx?: number
  heroMinPx?: number
}): boolean {
  const budget = feedV2ContentBudgetPx(opts)
  const actions = opts.actionZonePx ?? feedV2ActionZonePx()
  const hero = opts.heroMinPx ?? feedV2HeroMinPx(opts.viewportHeight)
  return budget - hero - opts.copyPx - actions >= 0
}

/**
 * Prove CTA+publisher remain above the safe bottom for a viewport height,
 * given full copy height and reserved action zone (post first-paint repair).
 */
export function feedV2ActionsFitViewport(opts: {
  viewportHeight: number
  safeTop?: number
  safeBottom?: number
  copyPreviewPx: number
  actionZonePx?: number
}): boolean {
  return feedV2FirstPaintFits({
    ...opts,
    copyPx: opts.copyPreviewPx,
  })
}

/**
 * Whether a required element is inside the first-paint safe band (no nested scroll).
 * top/bottom are getBoundingClientRect() values; safeBottomInset is home-indicator.
 */
export function feedV2ElementInFirstPaint(opts: {
  top: number
  bottom: number
  viewportHeight: number
  contentTop?: number
  safeBottomInset?: number
}): boolean {
  const contentTop = opts.contentTop ?? 0
  const safeBottom = feedV2BottomClearancePx({
    safeBottom: opts.safeBottomInset ?? 0,
  })
  const visibleBottom = opts.viewportHeight - safeBottom
  return opts.top >= contentTop - 1 && opts.bottom <= visibleBottom + 1
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

/** Typical first-paint copy height estimate (full text + rhythm gaps, no clamp). */
export function feedV2TypicalCopyPx(viewportHeight: number): number {
  const chips = 32
  const headlineLines = viewportHeight < 700 ? 3 : 4
  const summaryLines = viewportHeight < 700 ? 3 : 4
  const headline = headlineLines * 24
  const summary = summaryLines * 20
  const gaps = 12 + 14 + 8 // cat→headline, headline→summary breathing (summary→cta on action zone)
  return chips + headline + summary + gaps
}

/** Summary line clamp by viewport height (presentation only — unused on Feed V2 card). */
export function feedV2SummaryLineClamp(viewportHeight: number): number {
  if (viewportHeight < 700) return 2
  if (viewportHeight < 820) return 3
  return 4
}

/** Headline line clamp by viewport height (presentation only — unused on Feed V2 card). */
export function feedV2HeadlineLineClamp(viewportHeight: number): number {
  if (viewportHeight < 700) return 3
  return 4
}
