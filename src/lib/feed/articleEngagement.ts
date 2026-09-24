/**
 * Feed 2 / story / article-open engagement.
 *
 * Qualified *impressions* (seen/suppress) stay at FEED_IMPRESSION_CONFIG (60% / 750ms).
 * Counted *views* and read-time for ranking start at 3s (or immediately on content open).
 */

export const FEED_VIEW_CONFIG = {
  visibilityRatio: 0.6,
  minVisibleMs: 3_000,
} as const

export const FEED_ENGAGEMENT_MAX_DWELL_MS = 30 * 60 * 1000
export const FEED_ENGAGEMENT_FLUSH_MIN_MS = 250

export type ArticleEngagementSource = 'feed' | 'story' | 'open'

export function clampEngagementDwellMs(dwellMs: unknown): number {
  const n = typeof dwellMs === 'number' ? dwellMs : Number(dwellMs)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(Math.round(n), FEED_ENGAGEMENT_MAX_DWELL_MS)
}

export function shouldCountEngagementView(
  source: ArticleEngagementSource,
  dwellMs: number
): boolean {
  if (source === 'open') return true
  return dwellMs >= FEED_VIEW_CONFIG.minVisibleMs
}

export type EngagementFlushState = {
  elapsedMs: number
  flushedMs: number
  viewCounted: boolean
}

export type EngagementFlushResult = {
  dwellDeltaMs: number
  countView: boolean
  nextFlushedMs: number
  nextViewCounted: boolean
}

/**
 * Incremental flush: send only new dwell since last write.
 * View increments once, only after 3s on feed/story (open always counts).
 */
export function nextEngagementFlush(
  state: EngagementFlushState,
  source: ArticleEngagementSource
): EngagementFlushResult {
  const elapsed = clampEngagementDwellMs(state.elapsedMs)
  const flushed = Math.max(0, Math.min(state.flushedMs, elapsed))
  const rawDelta = elapsed - flushed
  // Feed/story: no view and no read-time until the 3s gate. Open writes immediately.
  if (source !== 'open' && elapsed < FEED_VIEW_CONFIG.minVisibleMs && !state.viewCounted) {
    return { dwellDeltaMs: 0, countView: false, nextFlushedMs: flushed, nextViewCounted: false }
  }

  const countView = !state.viewCounted && shouldCountEngagementView(source, elapsed)
  const skipDwell = rawDelta < FEED_ENGAGEMENT_FLUSH_MIN_MS && !countView
  return {
    dwellDeltaMs: skipDwell ? 0 : rawDelta,
    countView: skipDwell ? false : countView,
    nextFlushedMs: skipDwell ? flushed : elapsed,
    nextViewCounted: state.viewCounted || (!skipDwell && countView),
  }
}

export function readMinutesFromDurationMs(readDurationMs: number | null | undefined): number {
  if (!readDurationMs || readDurationMs <= 0) return 0
  return readDurationMs / 60_000
}
