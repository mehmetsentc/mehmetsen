/**
 * Feed Reader gesture arbitration — pure helpers.
 * Horizontal page-turn only when horizontal intent dominates vertical scroll.
 */

export const READER_GESTURE = {
  /** abs(dx) must exceed abs(dy) * this ratio */
  dominance: 1.35,
  /** px before interactive turn engages */
  activatePx: 18,
  /** px / velocity to complete open/close */
  completePx: 96,
  completeVelocity: 0.55,
  /** ignore starts from extreme left edge (iOS system back) */
  systemBackEdgePx: 22,
  /** max interactive progress mapped from drag */
  maxProgress: 1,
} as const

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
  edgePx = READER_GESTURE.systemBackEdgePx
): boolean {
  if (!Number.isFinite(startClientX) || viewportWidth <= 0) return false
  return startClientX <= edgePx
}

/** Feed → Reader: drag left (negative dx) progresses open. */
export function feedToReaderProgress(dx: number, width: number): number {
  if (width <= 0) return 0
  const p = (-dx) / width
  return Math.min(READER_GESTURE.maxProgress, Math.max(0, p))
}

/** Reader → Feed: drag right (positive dx) progresses close. */
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
  if (opts.progress >= 0.42) return true
  if (opts.progress >= completeProgress && opts.velocityX >= completeVelocity) return true
  if (opts.velocityX >= completeVelocity * 1.6 && opts.progress >= 0.18) return true
  return false
}

export function prefersReducedMotion(
  mq: { matches: boolean } | null | undefined = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null
): boolean {
  return Boolean(mq?.matches)
}
