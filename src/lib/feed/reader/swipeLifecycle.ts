/**
 * Feed ↔ Reader gesture lifecycle isolation helpers (pure + tiny in-memory ring).
 * No telemetry / persistence.
 */

export const FEED_READER_RETURN_GESTURE_ARM_MS = 350
/** After close begins, block leftover horizontal opens (anim 320ms + settle). */
export const FEED_READER_REOPEN_LOCK_MS = 1200
/** Same article must not remount after a successful close. */
export const FEED_READER_SAME_ARTICLE_REOPEN_MS = 1200
/** Close commit: visible peek of feed should finish, not snap the article back. */
export const FEED_READER_CLOSE_HARD_COMPLETE = 0.2
export const SWIPE_LIFECYCLE_RING_MAX = 28

export type SwipeLifecycleEvent =
  | 'FEED_POINTER_DOWN'
  | 'FEED_HORIZONTAL_LOCK'
  | 'FEED_PROGRESS'
  | 'FEED_GESTURE_COMMIT'
  | 'FEED_GESTURE_CANCEL_IGNORED_COMMIT_LOCK'
  | 'FEED_GESTURE_CANCEL'
  | 'FEED_OPEN_PENDING'
  | 'FEED_OPEN_FAIL'
  | 'READER_SESSION_CREATE'
  | 'READER_COMMITTED'
  | 'READER_RETURN_BLOCKED_ARM'
  | 'READER_CLOSE_BEGIN'
  | 'READER_CLOSE_FINISH'
  | 'READER_SESSION_CLEAR'
  | 'FEED_GESTURE_EPOCH_BUMP'
  | `MOUNT_READER:${string}`
  | `UNMOUNT_READER:${string}`
  | `CANCEL_REASON=${string}`

/** After Feed gesture decides OPEN, ignore preview cancels until open settles/fails. */
export function shouldIgnoreFeedOpenCancel(opts: {
  commitLockArticleId: string | null | undefined
  articleId: string
}): boolean {
  return Boolean(opts.commitLockArticleId && opts.commitLockArticleId === opts.articleId)
}

/** Reader close gestures must not arm until a settle window after commit. */
export function isReaderReturnGestureArmed(opts: {
  committedAtMs: number | null | undefined
  nowMs: number
  armMs?: number
}): boolean {
  if (opts.committedAtMs == null || !Number.isFinite(opts.committedAtMs)) return false
  const arm = opts.armMs ?? FEED_READER_RETURN_GESTURE_ARM_MS
  return opts.nowMs - opts.committedAtMs >= arm
}

/** Feed open is blocked until `untilMs` — leftover swipe after close. */
export function isFeedReaderReopenLocked(opts: {
  untilMs: number | null | undefined
  nowMs: number
}): boolean {
  if (opts.untilMs == null || !Number.isFinite(opts.untilMs)) return false
  return opts.nowMs < opts.untilMs
}

/** Same-article remount after close — Arıkan-style bounce. */
export function isFeedReaderSameArticleReopenLocked(opts: {
  closedArticleId: string | null | undefined
  articleId: string
  untilMs: number | null | undefined
  nowMs: number
}): boolean {
  if (!opts.closedArticleId || opts.closedArticleId !== opts.articleId) return false
  return isFeedReaderReopenLocked({ untilMs: opts.untilMs, nowMs: opts.nowMs })
}

export function appendSwipeLifecycleRing(
  prev: readonly string[],
  event: SwipeLifecycleEvent,
  max = SWIPE_LIFECYCLE_RING_MAX
): string[] {
  const next = prev.length ? [...prev, event] : [event]
  if (next.length <= max) return next
  return next.slice(next.length - max)
}

export function formatSwipeLifecycleRing(events: readonly string[]): string {
  if (!events.length) return '—'
  return events.join('>')
}
