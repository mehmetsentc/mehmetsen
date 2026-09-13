import { describe, expect, it } from 'vitest'
import {
  applyYoutubeMuteIntent,
  effectiveMutedFromPlayer,
  isExclusivePlaybackOwner,
  mediaCommand,
  nextPreferredMutedFromUiToggle,
  nextUserPaused,
  nextUserPausedFromTap,
  shouldAutoplay,
  shouldObserverRestartPlayback,
  userPausedAfterDeactivate,
  youtubeCommandPayload,
  youtubeMuteCommands,
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

  it('YouTube command payloads always send args as an array', () => {
    expect(youtubeCommandPayload('pauseVideo')).toEqual({
      event: 'command',
      func: 'pauseVideo',
      args: [],
    })
    expect(youtubeCommandPayload('playVideo', [])).toEqual({
      event: 'command',
      func: 'playVideo',
      args: [],
    })
    expect(youtubeCommandPayload('setVolume', [100]).args).toEqual([100])
    expect(Array.isArray(youtubeCommandPayload('unMute').args)).toBe(true)
  })

  it('unmute sends unMute then setVolume 100; mute sends mute only', () => {
    expect(youtubeMuteCommands(true)).toEqual([{ func: 'mute', args: [] }])
    expect(youtubeMuteCommands(false)).toEqual([
      { func: 'unMute', args: [] },
      { func: 'setVolume', args: [100] },
    ])
    const sent: Array<{ func: string; args?: unknown[] }> = []
    applyYoutubeMuteIntent((func, args) => sent.push({ func, args }), false)
    expect(sent).toEqual([
      { func: 'unMute', args: [] },
      { func: 'setVolume', args: [100] },
    ])
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

  it('observer flicker on the same paused item must not resume', () => {
    const userPaused = true
    expect(
      shouldObserverRestartPlayback({ userPaused, isActive: false, sameItem: true })
    ).toBe(false)
    expect(
      shouldObserverRestartPlayback({ userPaused, isActive: true, sameItem: true })
    ).toBe(false)
    expect(mediaCommand({ isActive: true, userPaused, visible: true })).toBe('pause')
  })

  it('paused overlay + still-playing player re-asserts pause instead of playing', () => {
    expect(
      nextUserPausedFromTap({ currentlyUserPaused: true, playerPlaying: true })
    ).toBe(true)
    expect(
      nextUserPausedFromTap({ currentlyUserPaused: true, playerPlaying: false })
    ).toBe(false)
    expect(
      nextUserPausedFromTap({ currentlyUserPaused: false, playerPlaying: true })
    ).toBe(true)
    expect(
      nextUserPausedFromTap({ currentlyUserPaused: false, playerPlaying: false })
    ).toBe(false)
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
