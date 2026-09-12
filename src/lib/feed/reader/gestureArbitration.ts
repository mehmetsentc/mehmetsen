/**
 * Feed Reader gesture arbitration — pure helpers.
 * Horizontal page-turn only when horizontal intent dominates vertical scroll.
 */

export const READER_GESTURE = {
  /** abs(dx) must exceed abs(dy) * this ratio */
  dominance: 1.35,
  /** px before interactive turn engages */
  activatePx: 14,
  /** px / velocity to complete open/close (tuned for one-handed mobile) */
  completePx: 72,
  completeVelocity: 0.45,
  /** ignore starts from extreme left edge (iOS system back) */
  systemBackEdgePx: 22,
  /** hard-complete progress fraction of viewport width (~0.32 ≈ 125px @390) */
  hardCompleteProgress: 0.32,
  /** flick: velocity × this vs completeVelocity, with min progress */
  flickVelocityFactor: 1.6,
  flickMinProgress: 0.14,
  /** max interactive progress mapped from drag */
  maxProgress: 1,
  /**
   * Touch/hold discovery peek — subtle Reader edge from RIGHT (~4%).
   * Not a second Reader; reuses uncommitted readerSession progress.
   */
  peekProgress: 0.04,
  /** Short still-down qualify so quick taps do not flash peek */
  peekQualifyMs: 72,
} as const

/** Movement still qualifies as "hold" (below axis activation). */
export function isStillHoldMovement(
  dx: number,
  dy: number,
  activatePx = READER_GESTURE.activatePx
): boolean {
  return Math.abs(dx) < activatePx && Math.abs(dy) < activatePx
}

export type AxisIntent = 'none' | 'horizontal' | 'vertical'

export function classifyAxisIntent(
  dx: number,
  dy: number,
  opts: { dominance?: number; activatePx?: number } = {}
): AxisIntent {
  const dominance = opts.dominance ?? READER_GESTURE.dominance
  const activatePx = opts.activatePx ?? READER_GESTURE.activatePx
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  if (adx < activatePx && ady < activatePx) return 'none'
  if (adx > ady * dominance) return 'horizontal'
  if (ady > adx * dominance) return 'vertical'
  return 'none'
}

export function shouldIgnoreSystemBackEdge(
  startClientX: number,
  viewportWidth: number,
  edgePx: number = READER_GESTURE.systemBackEdgePx
): boolean {
  if (!Number.isFinite(startClientX) || viewportWidth <= 0) return false
  return startClientX <= edgePx
}

/**
 * Reader → Feed return starts LEFT→RIGHT — users naturally begin near the left edge.
 * Safari browser: keep left-edge ignore so iOS system Back can own that strip.
 * Installed PWA/standalone: there is no Safari Back chrome — applying the same
 * ignore blocks the primary return gesture (CLASS F). Allow edge starts in PWA.
 */
export function shouldIgnoreSystemBackEdgeForReaderReturn(
  startClientX: number,
  viewportWidth: number,
  opts?: {
    edgePx?: number
    /** When true (installed PWA), do not reject left-edge starts. */
    standalone?: boolean
  }
): boolean {
  if (opts?.standalone) return false
  return shouldIgnoreSystemBackEdge(
    startClientX,
    viewportWidth,
    opts?.edgePx ?? READER_GESTURE.systemBackEdgePx
  )
}

/** Feed → Reader: finger LEFT (negative dx) progresses open. Reader enters from RIGHT. */
export function feedToReaderProgress(dx: number, width: number): number {
  if (width <= 0) return 0
  const p = (-dx) / width
  return Math.min(READER_GESTURE.maxProgress, Math.max(0, p))
}

/** Reader → Feed: finger RIGHT (positive dx) progresses close. Reader exits RIGHT. */
export function readerToFeedProgress(dx: number, width: number): number {
  if (width <= 0) return 0
  const p = dx / width
  return Math.min(READER_GESTURE.maxProgress, Math.max(0, p))
}

export function shouldCompleteTransition(opts: {
  progress: number
  velocityX: number
  /** positive velocity in the completing direction */
  completeVelocity?: number
  completeProgress?: number
}): boolean {
  const completeVelocity = opts.completeVelocity ?? READER_GESTURE.completeVelocity
  const completeProgress = opts.completeProgress ?? READER_GESTURE.completePx / 320
  if (opts.progress >= READER_GESTURE.hardCompleteProgress) return true
  if (opts.progress >= completeProgress && opts.velocityX >= completeVelocity) return true
  if (
    opts.velocityX >= completeVelocity * READER_GESTURE.flickVelocityFactor &&
    opts.progress >= READER_GESTURE.flickMinProgress
  ) {
    return true
  }
  return false
}

export function prefersReducedMotion(
  mq: { matches: boolean } | null | undefined = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null
): boolean {
  return Boolean(mq?.matches)
}
