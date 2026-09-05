/**
 * Feed → Reader open-gesture helpers shared by FeedCardWithImpression.
 */
import { evaluateFeedOpenGesture } from '@/components/feed/smart/FeedArticleReader'

const INTERACTIVE_GESTURE_BLOCK_SELECTOR =
  'button, a, input, textarea, [data-no-reader-gesture="1"]'

type ClosestCapable = { closest: (selectors: string) => unknown }

/** Social / CTA / link targets must not start a Reader open drag. */
export function shouldIgnoreFeedOpenGestureTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as unknown as ClosestCapable).closest !== 'function') return false
  return Boolean((target as unknown as ClosestCapable).closest(INTERACTIVE_GESTURE_BLOCK_SELECTOR))
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
