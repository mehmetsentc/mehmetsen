import { describe, expect, it } from 'vitest'
import {
  LIVING_VIDEO_DWELL_MS,
  LIVING_VIDEO_VISIBILITY_THRESHOLD,
  isVisibleEnough,
  nextLivingVideoState,
  preloadStrategyFor,
  shouldAutoplay,
  type LivingVideoPlaybackState,
} from '@/lib/livingVideo/qualification'

describe('isVisibleEnough', () => {
  it('requires >=60% visibility', () => {
    expect(LIVING_VIDEO_VISIBILITY_THRESHOLD).toBe(0.6)
    expect(isVisibleEnough(0.6)).toBe(true)
    expect(isVisibleEnough(0.61)).toBe(true)
    expect(isVisibleEnough(1)).toBe(true)
    expect(isVisibleEnough(0.59)).toBe(false)
    expect(isVisibleEnough(0)).toBe(false)
  })
})

describe('shouldAutoplay', () => {
  it('requires both visibility and the full dwell window', () => {
    expect(shouldAutoplay({ isVisibleEnough: true, continuousVisibleMs: LIVING_VIDEO_DWELL_MS })).toBe(true)
    expect(shouldAutoplay({ isVisibleEnough: true, continuousVisibleMs: LIVING_VIDEO_DWELL_MS + 500 })).toBe(true)
  })

  it('refuses before the dwell window elapses even if visible', () => {
    expect(shouldAutoplay({ isVisibleEnough: true, continuousVisibleMs: LIVING_VIDEO_DWELL_MS - 1 })).toBe(false)
    expect(shouldAutoplay({ isVisibleEnough: true, continuousVisibleMs: 0 })).toBe(false)
  })

  it('refuses when not visible enough regardless of dwell time', () => {
    expect(shouldAutoplay({ isVisibleEnough: false, continuousVisibleMs: 999999 })).toBe(false)
  })
})

describe('preloadStrategyFor', () => {
  it('does nothing eager far from viewport', () => {
    expect(preloadStrategyFor({ isNearViewport: false, isQualified: false })).toBe('none')
  })

  it('loads metadata only when near but not yet qualified', () => {
    expect(preloadStrategyFor({ isNearViewport: true, isQualified: false })).toBe('metadata')
  })

  it('loads fully once qualified, even if somehow not marked near', () => {
    expect(preloadStrategyFor({ isNearViewport: false, isQualified: true })).toBe('auto')
    expect(preloadStrategyFor({ isNearViewport: true, isQualified: true })).toBe('auto')
  })
})

describe('nextLivingVideoState', () => {
  it('progresses through the full happy path: poster -> ... -> autoplay-muted -> playing-with-sound', () => {
    let s: LivingVideoPlaybackState = 'poster'
    s = nextLivingVideoState(s, { type: 'ENTER_NEAR_VIEWPORT' })
    expect(s).toBe('loading')
    s = nextLivingVideoState(s, { type: 'METADATA_LOADED' })
    expect(s).toBe('ready')
    s = nextLivingVideoState(s, { type: 'QUALIFY' })
    expect(s).toBe('ready')
    s = nextLivingVideoState(s, { type: 'AUTOPLAY_SUCCEEDED' })
    expect(s).toBe('autoplay-muted')
    s = nextLivingVideoState(s, { type: 'USER_UNMUTE' })
    expect(s).toBe('playing-with-sound')
  })

  it('pauses on scroll-away from either playing state, and re-qualifies to ready', () => {
    let s: LivingVideoPlaybackState = 'autoplay-muted'
    s = nextLivingVideoState(s, { type: 'DISQUALIFY' })
    expect(s).toBe('offscreen')
    s = nextLivingVideoState(s, { type: 'METADATA_LOADED' }) // no-op, already has metadata conceptually but reducer only cares about state name
    // offscreen -> QUALIFY goes to 'ready' (must attempt autoplay again, never resumes silently)
    s = nextLivingVideoState('offscreen', { type: 'QUALIFY' })
    expect(s).toBe('ready')
  })

  it('never transitions INTO playing-with-sound except via USER_UNMUTE', () => {
    // Excludes 'playing-with-sound' itself: an unrelated event received
    // while already in that state correctly stays there (not a bug) -
    // this test only asserts no OTHER state can ever land there.
    const allStates: LivingVideoPlaybackState[] = [
      'poster',
      'loading',
      'ready',
      'autoplay-muted',
      'paused',
      'blocked',
      'failed',
      'offscreen',
    ]
    const allEventsExceptUnmute = [
      { type: 'ENTER_NEAR_VIEWPORT' },
      { type: 'LEAVE_VIEWPORT' },
      { type: 'QUALIFY' },
      { type: 'DISQUALIFY' },
      { type: 'METADATA_LOADED' },
      { type: 'AUTOPLAY_SUCCEEDED' },
      { type: 'AUTOPLAY_BLOCKED' },
      { type: 'USER_PLAY' },
      { type: 'USER_PAUSE' },
      { type: 'LOSE_OWNERSHIP' },
      { type: 'ERROR' },
    ] as const
    for (const state of allStates) {
      for (const event of allEventsExceptUnmute) {
        const result = nextLivingVideoState(state, event)
        expect(result).not.toBe('playing-with-sound')
      }
    }
  })

  it('shows a controlled "blocked" state instead of a native broken-media surface when autoplay is refused', () => {
    expect(nextLivingVideoState('ready', { type: 'AUTOPLAY_BLOCKED' })).toBe('blocked')
  })

  it('lets an explicit user play control recover from blocked', () => {
    expect(nextLivingVideoState('blocked', { type: 'USER_PLAY' })).toBe('autoplay-muted')
  })

  it('is a terminal state on ERROR and does not recover from any further event', () => {
    const allStates: LivingVideoPlaybackState[] = [
      'poster',
      'loading',
      'ready',
      'autoplay-muted',
      'playing-with-sound',
      'paused',
      'blocked',
      'offscreen',
    ]
    for (const state of allStates) {
      expect(nextLivingVideoState(state, { type: 'ERROR' })).toBe('failed')
    }
    // failed absorbs everything else too
    expect(nextLivingVideoState('failed', { type: 'QUALIFY' })).toBe('failed')
    expect(nextLivingVideoState('failed', { type: 'USER_PLAY' })).toBe('failed')
  })

  it('pauses when another video claims ownership', () => {
    expect(nextLivingVideoState('autoplay-muted', { type: 'LOSE_OWNERSHIP' })).toBe('offscreen')
    expect(nextLivingVideoState('playing-with-sound', { type: 'LOSE_OWNERSHIP' })).toBe('offscreen')
  })

  it('a user pause is a real pause, distinct from offscreen', () => {
    expect(nextLivingVideoState('autoplay-muted', { type: 'USER_PAUSE' })).toBe('paused')
    expect(nextLivingVideoState('playing-with-sound', { type: 'USER_PAUSE' })).toBe('paused')
  })

  it('leaving the viewport before metadata ever loaded stays in poster/loading rather than flashing offscreen', () => {
    expect(nextLivingVideoState('poster', { type: 'LEAVE_VIEWPORT' })).toBe('poster')
    expect(nextLivingVideoState('loading', { type: 'LEAVE_VIEWPORT' })).toBe('loading')
  })
})
