/**
 * Shared playback gates for /video, /reels, and feed-v2 card video.
 * Autoplay may run only when the item is active, visible, and not user-paused.
 */

export type PlaybackGateInput = {
  isActive: boolean
  userPaused: boolean
  visible?: boolean
}

export function shouldAutoplay(input: PlaybackGateInput): boolean {
  return input.isActive && input.visible !== false && !input.userPaused
}

export function mediaCommand(input: PlaybackGateInput): 'play' | 'pause' {
  return shouldAutoplay(input) ? 'play' : 'pause'
}

export function youtubePlayerFunc(command: 'play' | 'pause'): 'playVideo' | 'pauseVideo' {
  return command === 'play' ? 'playVideo' : 'pauseVideo'
}

export function youtubeMuteFunc(muted: boolean): 'mute' | 'unMute' {
  return muted ? 'mute' : 'unMute'
}

/**
 * YouTube IFrame API postMessage requires `args` to be an array.
 * `args: ''` is silently ignored — pause/unMute never reach the player.
 */
export function youtubeCommandPayload(func: string, args: unknown[] = []) {
  return { event: 'command' as const, func, args }
}

/** Unmute must also set volume; mute is a single command. */
export function youtubeMuteCommands(muted: boolean): Array<{ func: string; args: unknown[] }> {
  if (muted) return [{ func: 'mute', args: [] }]
  return [
    { func: 'unMute', args: [] },
    { func: 'setVolume', args: [100] },
  ]
}

export function applyYoutubeMuteIntent(
  send: (func: string, args?: unknown[]) => void,
  muted: boolean
) {
  for (const command of youtubeMuteCommands(muted)) {
    send(command.func, command.args)
  }
}

/** User tap on the current item toggles explicit pause. */
export function nextUserPaused(currentlyUserPaused: boolean): boolean {
  return !currentlyUserPaused
}

/**
 * If the overlay already shows paused but the player is still playing,
 * the next tap re-asserts pause instead of toggling back to play.
 */
export function nextUserPausedFromTap(input: {
  currentlyUserPaused: boolean
  playerPlaying: boolean
}): boolean {
  if (input.currentlyUserPaused && input.playerPlaying) return true
  // Buffering / failed autoplay is not an explicit pause. Tapping Play
  // must request play, not lock the item into userPaused.
  if (!input.currentlyUserPaused && !input.playerPlaying) return false
  return !input.currentlyUserPaused
}

/** Leaving the item (swipe / deactivate) restores autoplay on the next visit. */
export function userPausedAfterDeactivate(): false {
  return false
}

/**
 * IntersectionObserver / rerender / player-ready must not resume an item the
 * user just paused. A newly active item (swipe) may autoplay.
 */
export function shouldObserverRestartPlayback(input: {
  userPaused: boolean
  isActive: boolean
  sameItem: boolean
}): boolean {
  if (!input.isActive) return false
  if (input.sameItem && input.userPaused) return false
  return !input.userPaused
}

export function effectiveMutedFromPlayer(input: {
  preferredMuted: boolean
  playerMuted: boolean | null
}): boolean {
  if (typeof input.playerMuted === 'boolean') return input.playerMuted
  return input.preferredMuted
}

/** UI shows actual mute. Tap inverts what the user currently hears/sees. */
export function nextPreferredMutedFromUiToggle(effectiveMuted: boolean): boolean {
  return !effectiveMuted
}

export function isExclusivePlaybackOwner(
  activeId: string | null | undefined,
  candidateId: string
): boolean {
  return Boolean(activeId) && activeId === candidateId
}
