import { describe, expect, it } from 'vitest'
import {
  effectiveMutedFromPlayer,
  isExclusivePlaybackOwner,
  mediaCommand,
  nextPreferredMutedFromUiToggle,
  nextUserPaused,
  shouldAutoplay,
  shouldObserverRestartPlayback,
  userPausedAfterDeactivate,
  youtubeMuteFunc,
  youtubePlayerFunc,
} from '@/lib/videoFeed/playbackIntent'

describe('playbackIntent autoplay gate', () => {
  it('autoplays only the active visible item that is not user-paused', () => {
    expect(shouldAutoplay({ isActive: true, userPaused: false, visible: true })).toBe(true)
    expect(shouldAutoplay({ isActive: true, userPaused: true, visible: true })).toBe(false)
    expect(shouldAutoplay({ isActive: false, userPaused: false, visible: true })).toBe(false)
    expect(shouldAutoplay({ isActive: true, userPaused: false, visible: false })).toBe(false)
  })

  it('maps gate to play/pause and YouTube funcs', () => {
    expect(mediaCommand({ isActive: true, userPaused: false })).toBe('play')
    expect(mediaCommand({ isActive: true, userPaused: true })).toBe('pause')
    expect(youtubePlayerFunc('play')).toBe('playVideo')
    expect(youtubePlayerFunc('pause')).toBe('pauseVideo')
    expect(youtubeMuteFunc(true)).toBe('mute')
    expect(youtubeMuteFunc(false)).toBe('unMute')
  })
})

describe('playbackIntent user pause vs observer/rerender', () => {
  it('user pause stays paused through observer and rerender of the same item', () => {
    const userPaused = nextUserPaused(false)
    expect(userPaused).toBe(true)
    expect(
      shouldObserverRestartPlayback({ userPaused, isActive: true, sameItem: true })
    ).toBe(false)
    expect(shouldAutoplay({ isActive: true, userPaused, visible: true })).toBe(false)
  })

  it('swipe to next item may autoplay after deactivate reset', () => {
    expect(userPausedAfterDeactivate()).toBe(false)
    expect(
      shouldObserverRestartPlayback({
        userPaused: userPausedAfterDeactivate(),
        isActive: true,
        sameItem: false,
      })
    ).toBe(true)
    expect(shouldAutoplay({ isActive: true, userPaused: false, visible: true })).toBe(true)
  })

  it('returning to a previous item autoplays (deactivate cleared userPaused)', () => {
    expect(
      shouldObserverRestartPlayback({
        userPaused: userPausedAfterDeactivate(),
        isActive: true,
        sameItem: true,
      })
    ).toBe(true)
  })
})

describe('playbackIntent sound truth', () => {
  it('first autoplay preference is muted', () => {
    expect(effectiveMutedFromPlayer({ preferredMuted: true, playerMuted: null })).toBe(true)
  })

  it('UI follows actual player mute when known', () => {
    expect(
      effectiveMutedFromPlayer({ preferredMuted: false, playerMuted: true })
    ).toBe(true)
    expect(
      effectiveMutedFromPlayer({ preferredMuted: false, playerMuted: false })
    ).toBe(false)
  })

  it('Sesli tap requests unmuted preference; Sessiz tap requests mute', () => {
    expect(nextPreferredMutedFromUiToggle(true)).toBe(false)
    expect(nextPreferredMutedFromUiToggle(false)).toBe(true)
  })

  it('only one playback owner is audible', () => {
    expect(isExclusivePlaybackOwner('a', 'a')).toBe(true)
    expect(isExclusivePlaybackOwner('a', 'b')).toBe(false)
    expect(isExclusivePlaybackOwner(null, 'a')).toBe(false)
  })
})
