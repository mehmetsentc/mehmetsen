/**
 * LP7R.2 Living Video — pure qualification + playback-state logic.
 *
 * Deliberately framework-free and DOM-free (no IntersectionObserver, no
 * HTMLVideoElement) so it can be unit-tested directly, matching this
 * repo's convention of extracting pure business logic out of components
 * that would otherwise need a DB/DOM harness this repo doesn't have (see
 * src/lib/publisher/provenance.ts and editorialTiers.ts for the same
 * pattern). The DOM-facing half (IntersectionObserver wiring, the actual
 * <video> element) lives in src/hooks/useLivingVideoQualification.ts and
 * src/components/publisher/LivingVideoPlayer.tsx, which call into this
 * module for every decision rather than deciding inline.
 *
 * IMPORTANT — this is playback state only. Per the LP7R.2 spec: qualifying
 * for muted autoplay here is NOT a Smart Feed "qualified impression," and
 * nothing in this module (or anything that calls it) may write feed
 * telemetry, social_events, ranking signals, or any other Feed 2 data.
 */

/** ">=60% of the media surface visible" per the spec. */
export const LIVING_VIDEO_VISIBILITY_THRESHOLD = 0.6

/** "short stability/dwell before autoplay" — chosen to be perceptible but
 * not sluggish; consistent with this app's other short-motion durations
 * (see tailwind.config.ts transitionDuration.quick = 180ms) while being
 * long enough that a fast scroll-past never triggers a decode+network
 * fetch for a video the reader was never going to watch. */
export const LIVING_VIDEO_DWELL_MS = 400

export function isVisibleEnough(intersectionRatio: number): boolean {
  return intersectionRatio >= LIVING_VIDEO_VISIBILITY_THRESHOLD
}

/**
 * Pure autoplay decision: visible enough AND has stayed visible enough for
 * at least the dwell window, continuously (any drop below threshold must
 * reset the caller's continuousVisibleMs back to 0 — this function doesn't
 * track time itself, it only judges a snapshot, so continuity is the
 * caller's responsibility, exercised by useLivingVideoQualification).
 */
export function shouldAutoplay(params: {
  isVisibleEnough: boolean
  continuousVisibleMs: number
}): boolean {
  if (!params.isVisibleEnough) return false
  return params.continuousVisibleMs >= LIVING_VIDEO_DWELL_MS
}

/**
 * Progressive loading strategy (Task 6). `nearRootMargin` is how far from
 * the viewport "near" starts (passed to IntersectionObserver's rootMargin
 * by the caller) — this function only maps the two observed booleans to a
 * <video> preload strategy, it doesn't own the margin value itself.
 */
export type VideoPreloadStrategy = 'none' | 'metadata' | 'auto'

export function preloadStrategyFor(params: {
  isNearViewport: boolean
  isQualified: boolean
}): VideoPreloadStrategy {
  if (params.isQualified) return 'auto'
  if (params.isNearViewport) return 'metadata'
  return 'none'
}

/** Task 7 — the full set of controlled playback states. No browser-native
 * broken-media surface is ever shown; every failure mode maps to one of
 * these instead. */
export type LivingVideoPlaybackState =
  | 'poster'
  | 'loading'
  | 'ready'
  | 'autoplay-muted'
  | 'playing-with-sound'
  | 'paused'
  | 'blocked'
  | 'failed'
  | 'offscreen'

export type LivingVideoEvent =
  | { type: 'ENTER_NEAR_VIEWPORT' }
  | { type: 'LEAVE_VIEWPORT' }
  | { type: 'QUALIFY' }
  | { type: 'DISQUALIFY' }
  | { type: 'METADATA_LOADED' }
  | { type: 'AUTOPLAY_SUCCEEDED' }
  | { type: 'AUTOPLAY_BLOCKED' }
  | { type: 'USER_PLAY' }
  | { type: 'USER_PAUSE' }
  | { type: 'USER_UNMUTE' }
  | { type: 'LOSE_OWNERSHIP' }
  | { type: 'ERROR' }

/**
 * Pure playback state-machine reducer. Every transition the component can
 * ever need is enumerated here and is unit-testable without a real
 * <video> element or IntersectionObserver. `failed` is terminal (an ERROR
 * event never recovers on its own — a genuinely new attempt requires the
 * caller to remount/reset, matching how HTMLMediaElement errors actually
 * behave: a failed source rarely starts working again on its own).
 */
export function nextLivingVideoState(
  state: LivingVideoPlaybackState,
  event: LivingVideoEvent
): LivingVideoPlaybackState {
  if (state === 'failed') return 'failed'

  switch (event.type) {
    case 'ERROR':
      return 'failed'
    case 'LEAVE_VIEWPORT':
    case 'DISQUALIFY':
    case 'LOSE_OWNERSHIP':
      return state === 'poster' || state === 'loading' ? state : 'offscreen'
    case 'ENTER_NEAR_VIEWPORT':
      return state === 'poster' ? 'loading' : state
    case 'METADATA_LOADED':
      return state === 'loading' || state === 'offscreen' ? 'ready' : state
    case 'QUALIFY':
      return state === 'ready' || state === 'offscreen' || state === 'paused' ? 'ready' : state
    case 'AUTOPLAY_SUCCEEDED':
      return state === 'ready' ? 'autoplay-muted' : state
    case 'AUTOPLAY_BLOCKED':
      return state === 'ready' ? 'blocked' : state
    case 'USER_PLAY':
      return state === 'blocked' || state === 'paused' || state === 'offscreen' ? 'autoplay-muted' : state
    case 'USER_PAUSE':
      return state === 'autoplay-muted' || state === 'playing-with-sound' ? 'paused' : state
    case 'USER_UNMUTE':
      return state === 'autoplay-muted' ? 'playing-with-sound' : state
    default:
      return state
  }
}
