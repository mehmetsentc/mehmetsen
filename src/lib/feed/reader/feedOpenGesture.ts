/**
 * Feed → Reader open-gesture helpers shared by FeedCardWithImpression.
 */
import { evaluateFeedOpenGesture } from '@/components/feed/smart/FeedArticleReader'
import { classifyAxisIntent, shouldIgnoreSystemBackEdge } from '@/lib/feed/reader/gestureArbitration'
import type { FeedReaderGestureDecision } from '@/lib/feed/reader/readerDebug'

const INTERACTIVE_GESTURE_BLOCK_SELECTOR =
  'button, a, input, textarea, [data-no-reader-gesture="1"]'

type ClosestCapable = { closest: (selectors: string) => unknown }

/** Social / CTA / link targets must not start a Reader open drag. */
export function shouldIgnoreFeedOpenGestureTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as unknown as ClosestCapable).closest !== 'function') return false
  return Boolean((target as unknown as ClosestCapable).closest(INTERACTIVE_GESTURE_BLOCK_SELECTOR))
}

/**
 * Pure diagnostic classification for pilot readerDebug panel.
 * Does not open Reader and does not emit telemetry.
 */
export function classifyFeedOpenGestureDecision(opts: {
  dx: number
  dy: number
  startClientX: number
  viewportWidth: number
  velocityX: number
}): {
  decision: FeedReaderGestureDecision
  axis: 'none' | 'horizontal' | 'vertical'
  qualified: boolean
  open: boolean
  progress: number
} {
  if (shouldIgnoreSystemBackEdge(opts.startClientX, opts.viewportWidth)) {
    return { decision: 'IGNORED_IOS_EDGE', axis: 'none', qualified: false, open: false, progress: 0 }
  }
  const axis = classifyAxisIntent(opts.dx, opts.dy)
  const evaluated = evaluateFeedOpenGesture(opts)
  if (axis !== 'horizontal') {
    return {
      decision: 'NONE',
      axis,
      qualified: false,
      open: false,
      progress: evaluated.progress,
    }
  }
  if (evaluated.open) {
    return {
      decision: 'OPEN_READER',
      axis,
      qualified: true,
      open: true,
      progress: evaluated.progress,
    }
  }
  return {
    decision: 'SNAP_BACK',
    axis,
    qualified: true,
    open: false,
    progress: evaluated.progress,
  }
}

/**
 * Card pointer-up → same open decision as Haberi Oku (caller supplies onOpen → onRead).
 * Returns whether open was requested.
 */
export function dispatchFeedOpenGesture(opts: {
  dx: number
  dy: number
  startClientX: number
  viewportWidth: number
  velocityX: number
  onOpen: () => void
}): boolean {
  const result = evaluateFeedOpenGesture({
    dx: opts.dx,
    dy: opts.dy,
    startClientX: opts.startClientX,
    viewportWidth: opts.viewportWidth,
    velocityX: opts.velocityX,
  })
  if (!result.open) return false
  opts.onOpen()
  return true
}
