/**
 * Nested Feed card content scroll ownership helpers (pure).
 */

type ClosestCapable = { closest: (selectors: string) => unknown }

/**
 * Nested Feed card content scroll can still consume vertical dy.
 * When true, feed snap / card navigation must not steal the gesture yet.
 */
export function nestedFeedContentCanScroll(
  target: EventTarget | null,
  dy: number
): boolean {
  if (!target || typeof (target as unknown as ClosestCapable).closest !== 'function') return false
  const el = (target as unknown as ClosestCapable).closest(
    '[data-feed-nested-scroll="1"]'
  ) as HTMLElement | null
  if (!el) return false
  const max = el.scrollHeight - el.clientHeight
  if (max <= 1) return false
  const top = el.scrollTop
  // dy > 0 = finger down = content scrolls up (reveal lower) → need room below
  if (dy > 0) return top < max - 1
  if (dy < 0) return top > 1
  return false
}
