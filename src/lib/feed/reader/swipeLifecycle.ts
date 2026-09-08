/**
 * Feed ↔ Reader gesture lifecycle isolation helpers (pure + tiny in-memory ring).
 * No telemetry / persistence.
 */

export const FEED_READER_RETURN_GESTURE_ARM_MS = 350
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
