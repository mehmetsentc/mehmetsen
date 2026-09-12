import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetActiveVideoOwnerForTests,
  claimActiveVideo,
  isActiveVideo,
  pauseAllLivingVideo,
  registerLivingVideo,
  releaseActiveVideo,
} from '@/lib/livingVideo/activeVideoOwner'

afterEach(() => {
  __resetActiveVideoOwnerForTests()
})

describe('single active video owner', () => {
  it('a video is not active until it claims the slot', () => {
    registerLivingVideo('a', vi.fn())
    expect(isActiveVideo('a')).toBe(false)
    claimActiveVideo('a')
    expect(isActiveVideo('a')).toBe(true)
  })

  it('claiming pauses whoever held the slot before - only one active at a time', () => {
    const pauseA = vi.fn()
    const pauseB = vi.fn()
    registerLivingVideo('a', pauseA)
    registerLivingVideo('b', pauseB)

    claimActiveVideo('a')
    expect(isActiveVideo('a')).toBe(true)
    expect(pauseA).not.toHaveBeenCalled()

    claimActiveVideo('b')
    expect(pauseA).toHaveBeenCalledTimes(1)
    expect(pauseB).not.toHaveBeenCalled()
    expect(isActiveVideo('a')).toBe(false)
    expect(isActiveVideo('b')).toBe(true)
  })

  it('claiming the slot you already hold is a no-op (no spurious pause)', () => {
    const pauseA = vi.fn()
    registerLivingVideo('a', pauseA)
    claimActiveVideo('a')
    claimActiveVideo('a')
    expect(pauseA).not.toHaveBeenCalled()
    expect(isActiveVideo('a')).toBe(true)
  })

  it('releasing clears ownership so nothing is active', () => {
    registerLivingVideo('a', vi.fn())
    claimActiveVideo('a')
    releaseActiveVideo('a')
    expect(isActiveVideo('a')).toBe(false)
  })

  it('releasing an id that does not hold the slot does not clear the real owner', () => {
    registerLivingVideo('a', vi.fn())
    registerLivingVideo('b', vi.fn())
    claimActiveVideo('a')
    releaseActiveVideo('b')
    expect(isActiveVideo('a')).toBe(true)
  })

  it('unregistering clears ownership if that instance was active', () => {
    const unregister = registerLivingVideo('a', vi.fn())
    claimActiveVideo('a')
    unregister()
    expect(isActiveVideo('a')).toBe(false)
  })

  it('pauseAllLivingVideo (Article Lift opening) pauses the active video with no id needed', () => {
    const pauseA = vi.fn()
    registerLivingVideo('a', pauseA)
    claimActiveVideo('a')
    pauseAllLivingVideo()
    expect(pauseA).toHaveBeenCalledTimes(1)
    expect(isActiveVideo('a')).toBe(false)
  })

  it('pauseAllLivingVideo is a safe no-op when nothing is playing', () => {
    const pauseA = vi.fn()
    registerLivingVideo('a', pauseA)
    expect(() => pauseAllLivingVideo()).not.toThrow()
    expect(pauseA).not.toHaveBeenCalled()
  })

  it('after Article Lift pauses the newspaper video, a fresh claim (article return re-qualifying) works normally', () => {
    const pauseA = vi.fn()
    registerLivingVideo('a', pauseA)
    claimActiveVideo('a')
    pauseAllLivingVideo()
    expect(isActiveVideo('a')).toBe(false)
    claimActiveVideo('a')
    expect(isActiveVideo('a')).toBe(true)
  })
})
