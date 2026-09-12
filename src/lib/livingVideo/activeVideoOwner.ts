/**
 * LP7R.2 Living Video — single active playback owner.
 *
 * "Normally only ONE Living Paper autoplay video may actively play. When
 * another video qualifies: pause previous." This module is the shared
 * coordinator every LivingVideoPlayer instance claims/releases through, so
 * that guarantee holds across an arbitrary number of independently-mounted
 * cards (Lead/Secondary/Sections/Latest/masonry) without them needing to
 * know about each other.
 *
 * Deliberately a plain module-level singleton, not React context: the
 * cards that need to coordinate are NOT necessarily in the same React
 * subtree (a card in the "Latest" masonry rail and a card in "Sections"
 * have no common component ancestor closer than the page itself), and a
 * context provider would need to live in a genuinely shared ancestor —
 * which, on the publisher page, is fine, but this module is also the
 * mechanism LP7R.2 Task 8 uses to pause the newspaper's video from
 * ArticleLiftShell, a completely different part of the tree (a parallel
 * route). A plain singleton is the smallest correct primitive for that;
 * see pauseAllLivingVideo() below.
 *
 * This is playback state only — see qualification.ts's file doc comment.
 * Nothing here writes to Feed 2, social_events, or any telemetry.
 */

type ForcedPauseListener = () => void

let activeId: string | null = null
const listeners = new Map<string, ForcedPauseListener>()

/**
 * Register a LivingVideoPlayer instance. `onForcedPause` is called when
 * this instance loses ownership because another instance claimed it, or
 * because pauseAllLivingVideo() was called (e.g. Article Lift opening).
 * Returns an unregister function — callers MUST call it on unmount to
 * avoid stale listeners.
 */
export function registerLivingVideo(id: string, onForcedPause: ForcedPauseListener): () => void {
  listeners.set(id, onForcedPause)
  return () => {
    listeners.delete(id)
    if (activeId === id) activeId = null
  }
}

/** Claim the single playback slot. Pauses whoever held it before, if anyone. */
export function claimActiveVideo(id: string): void {
  if (activeId === id) return
  const previous = activeId
  activeId = id
  if (previous && previous !== id) {
    listeners.get(previous)?.()
  }
}

/** Voluntarily give up the slot (e.g. user paused, or video scrolled offscreen). */
export function releaseActiveVideo(id: string): void {
  if (activeId === id) activeId = null
}

export function isActiveVideo(id: string): boolean {
  return activeId === id
}

/**
 * LP7R.2 Task 8 — Article Lift + Video ownership. Called by
 * ArticleLiftShell on mount so a Publisher Newspaper video playing in the
 * background is never simultaneously active with the lifted article's
 * own video. Deliberately unconditional (it doesn't need to know which
 * id, if any, is currently active) and deliberately does not resume
 * anything on its own — on Article Return, each still-qualified
 * LivingVideoPlayer re-evaluates and may resume MUTED through its own
 * normal qualification flow, never automatically with sound (see
 * qualification.ts's nextLivingVideoState: there is no transition that
 * produces 'playing-with-sound' without an explicit USER_UNMUTE event).
 */
export function pauseAllLivingVideo(): void {
  const previous = activeId
  activeId = null
  if (previous) listeners.get(previous)?.()
}

/**
 * Test-only reset. This module is an intentional singleton for real
 * usage (see file doc comment), which is exactly what breaks test
 * isolation between cases — this lets tests start clean without
 * reaching into module internals.
 */
export function __resetActiveVideoOwnerForTests(): void {
  activeId = null
  listeners.clear()
}
