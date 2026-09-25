/**
 * Feed 2 / story / article-open engagement.
 *
 * Qualified *impressions* (seen/suppress) stay at FEED_IMPRESSION_CONFIG (60% / 750ms).
 * Counted *views* and read-time for ranking start at 3s (or immediately on content open / page).
 */

export const FEED_VIEW_CONFIG = {
  visibilityRatio: 0.6,
  minVisibleMs: 3_000,
} as const

export const FEED_ENGAGEMENT_MAX_DWELL_MS = 30 * 60 * 1000
export const FEED_ENGAGEMENT_FLUSH_MIN_MS = 250
export const ARTICLE_WATCH_RETENTION_DAYS = 90

export type ArticleEngagementSource = 'feed' | 'story' | 'open' | 'reader' | 'page'
export type ArticleWatchSurface = 'feed' | 'story' | 'reader' | 'page'

export function isImmediateViewSource(source: ArticleEngagementSource): boolean {
  return source === 'open' || source === 'reader' || source === 'page'
}

export function engagementSourceToSurface(source: ArticleEngagementSource): ArticleWatchSurface {
  if (source === 'feed' || source === 'story' || source === 'page') return source
  return 'reader'
}

export function watchActorKey(
  userId: string | null | undefined,
  sessionHash: string | null | undefined
): string | null {
  const uid = typeof userId === 'string' ? userId.trim() : ''
  if (uid) return `u:${uid}`
  const hash = typeof sessionHash === 'string' ? sessionHash.trim() : ''
  if (hash) return `g:${hash}`
  return null
}

export function clampEngagementDwellMs(dwellMs: unknown): number {
  const n = typeof dwellMs === 'number' ? dwellMs : Number(dwellMs)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(Math.round(n), FEED_ENGAGEMENT_MAX_DWELL_MS)
}

export function shouldCountEngagementView(
  source: ArticleEngagementSource,
  dwellMs: number
): boolean {
  if (isImmediateViewSource(source)) return true
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
 * View increments once, only after 3s on feed/story (open/reader/page always counts).
 */
export function nextEngagementFlush(
  state: EngagementFlushState,
  source: ArticleEngagementSource
): EngagementFlushResult {
  const elapsed = clampEngagementDwellMs(state.elapsedMs)
  const flushed = Math.max(0, Math.min(state.flushedMs, elapsed))
  const rawDelta = elapsed - flushed
  // Feed/story: no view and no read-time until the 3s gate. Open/reader/page write immediately.
  if (!isImmediateViewSource(source) && elapsed < FEED_VIEW_CONFIG.minVisibleMs && !state.viewCounted) {
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

export function averageDurationMs(totalMs: number, sessions: number): number {
  if (!Number.isFinite(totalMs) || !Number.isFinite(sessions) || sessions <= 0 || totalMs <= 0) {
    return 0
  }
  return Math.round(totalMs / sessions)
}

/** Ranking uses averages so a long skim-fest does not beat fewer real reads. */
export const WATCH_AVG_MINUTE_CAP = 8

export function articleWatchRankingSignals(input: {
  readDurationMs?: number | null
  pageDurationMs?: number | null
  watchSessionCount?: number | null
  pageSessionCount?: number | null
}): { totalReadMinutes: number; avgContentMinutes: number; avgPageMinutes: number } {
  const totalReadMinutes = readMinutesFromDurationMs(input.readDurationMs)
  const avgContentMinutes = Math.min(
    WATCH_AVG_MINUTE_CAP,
    averageDurationMs(input.readDurationMs ?? 0, input.watchSessionCount ?? 0) / 60_000
  )
  const avgPageMinutes = Math.min(
    WATCH_AVG_MINUTE_CAP,
    averageDurationMs(input.pageDurationMs ?? 0, input.pageSessionCount ?? 0) / 60_000
  )
  return { totalReadMinutes, avgContentMinutes, avgPageMinutes }
}

export function formatDurationCompact(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) return '0 sn'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} sn`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  if (min < 60) return rem ? `${min} dk ${rem} sn` : `${min} dk`
  const hr = Math.floor(min / 60)
  const m = min % 60
  return m ? `${hr} sa ${m} dk` : `${hr} sa`
}

export type WatchSessionWrite = {
  isNew: boolean
  viewDelta: number
  contentDelta: number
  pageDelta: number
  watchSessionDelta: number
  pageSessionDelta: number
  nextViewCounted: boolean
}

/** Pure merge: heartbeat upserts one session; news totals only move on new/flip. */
export function applyWatchSessionWrite(input: {
  existing: { viewCounted: boolean } | null
  surface: ArticleWatchSurface
  dwellDeltaMs: number
  countView: boolean
}): WatchSessionWrite {
  const dwell = clampEngagementDwellMs(input.dwellDeltaMs)
  const isNew = !input.existing
  const already = input.existing?.viewCounted === true
  const viewDelta = input.countView && !already ? 1 : 0
  const contentDelta = input.surface === 'page' ? 0 : dwell
  const pageDelta = input.surface === 'page' ? dwell : 0
  return {
    isNew,
    viewDelta,
    contentDelta,
    pageDelta,
    watchSessionDelta: isNew ? 1 : 0,
    pageSessionDelta: isNew && input.surface === 'page' ? 1 : 0,
    nextViewCounted: already || viewDelta > 0,
  }
}

export function publicArticleSocialCounts(row: {
  likesCount?: number | null
  commentsCount?: number | null
  savesCount?: number | null
  sharesCount?: number | null
  viewsCount?: number | null
}): { likes: number; comments: number; saves: number; shares: number; views: number } {
  return {
    likes: row.likesCount ?? 0,
    comments: row.commentsCount ?? 0,
    saves: row.savesCount ?? 0,
    shares: row.sharesCount ?? 0,
    views: row.viewsCount ?? 0,
  }
}
