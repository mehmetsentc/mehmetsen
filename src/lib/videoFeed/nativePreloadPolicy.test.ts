import { describe, expect, it, vi } from 'vitest'
import {
  abortDetachedNativeVideo,
  isStaleGeneration,
  nativeMediaPolicyFor,
  nativePreloadRoleFor,
  NATIVE_NEXT_WARMUP_MAX_BYTES,
  warmupOwnedNativeMedia,
} from '@/lib/videoFeed/nativePreloadPolicy'
import { videoPreloadForTier } from '@/store/networkContext'
import type { NetworkTier } from '@/hooks/useNetworkStatus'

const TIERS: NetworkTier[] = ['high', 'medium', 'low']

describe('native preload matrix', () => {
  it('maps index offsets to current / next / next+1 / previous', () => {
    expect(nativePreloadRoleFor(4, 4)).toBe('current')
    expect(nativePreloadRoleFor(5, 4)).toBe('next')
    expect(nativePreloadRoleFor(6, 4)).toBe('nextPlus1')
    expect(nativePreloadRoleFor(3, 4)).toBe('previous')
    expect(nativePreloadRoleFor(7, 4)).toBe('other')
  })

  it('current is always auto + attached across existing tiers', () => {
    for (const tier of TIERS) {
      const policy = nativeMediaPolicyFor('current', tier)
      expect(policy.attachSrc).toBe(true)
      expect(policy.preload).toBe('auto')
      expect(policy.warmupBytes).toBe(0)
      expect(policy.posterFetchPriority).toBe('high')
    }
  })

  it('next prepares metadata, not preload=auto, and warms only off the low tier', () => {
    expect(nativeMediaPolicyFor('next', 'high')).toMatchObject({
      attachSrc: true,
      preload: 'metadata',
      warmupBytes: NATIVE_NEXT_WARMUP_MAX_BYTES,
    })
    expect(nativeMediaPolicyFor('next', 'medium')).toMatchObject({
      attachSrc: true,
      preload: 'metadata',
      warmupBytes: NATIVE_NEXT_WARMUP_MAX_BYTES,
    })
    expect(nativeMediaPolicyFor('next', 'low')).toMatchObject({
      attachSrc: true,
      preload: 'metadata',
      warmupBytes: 0,
    })
  })

  it('next+1 never attaches media; previous is live only on high', () => {
    for (const tier of TIERS) {
      expect(nativeMediaPolicyFor('nextPlus1', tier).attachSrc).toBe(false)
      expect(nativeMediaPolicyFor('nextPlus1', tier).preload).toBe('none')
      expect(nativeMediaPolicyFor('other', tier).attachSrc).toBe(false)
    }
    expect(nativeMediaPolicyFor('previous', 'high').attachSrc).toBe(true)
    expect(nativeMediaPolicyFor('previous', 'medium').attachSrc).toBe(false)
    expect(nativeMediaPolicyFor('previous', 'low').attachSrc).toBe(false)
  })

  it('inactive mounted slides do not inherit videoPreloadForTier auto', () => {
    expect(videoPreloadForTier('high', false)).toBe('metadata')
    expect(nativeMediaPolicyFor('other', 'high').preload).toBe('none')
    expect(nativeMediaPolicyFor('nextPlus1', 'high').preload).not.toBe('auto')
    expect(nativeMediaPolicyFor('next', 'high').preload).not.toBe('auto')
  })
})

describe('stale native preload', () => {
  it('treats a bumped generation as stale', () => {
    expect(isStaleGeneration(1, 1)).toBe(false)
    expect(isStaleGeneration(1, 2)).toBe(true)
  })

  it('aborts detached next video src and never needs a current-element abort helper', () => {
    const calls: string[] = []
    const el = {
      src: 'https://example.com/next.mp4',
      getAttribute: (name: string) => (name === 'src' ? 'https://example.com/next.mp4' : null),
      removeAttribute: (name: string) => {
        calls.push(`remove:${name}`)
      },
      load: () => {
        calls.push('load')
      },
    }
    expect(abortDetachedNativeVideo(el)).toBe(true)
    expect(calls).toEqual(['remove:src', 'load'])
  })

  it('aborts stale next warmup and ignores completion after generation change', async () => {
    let current = 1
    const ac = new AbortController()
    let started = false
    const fetchImpl: typeof fetch = async (_url, init) => {
      started = true
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 40)
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
        })
      })
      return new Response(new Uint8Array([1, 2, 3]))
    }

    const pending = warmupOwnedNativeMedia('https://pub.example.r2.dev/a.mp4', {
      signal: ac.signal,
      generation: 1,
      currentGeneration: () => current,
      fetchImpl,
    })

    await Promise.resolve()
    expect(started).toBe(true)
    current = 2
    ac.abort()
    expect(await pending).toBe('aborted')
  })

  it('drops warmup work that finishes after a newer generation', async () => {
    let current = 1
    const fetchImpl: typeof fetch = async () => {
      current = 2
      return new Response(new Uint8Array([9]))
    }
    const result = await warmupOwnedNativeMedia('https://pub.example.r2.dev/a.mp4', {
      signal: new AbortController().signal,
      generation: 1,
      currentGeneration: () => current,
      fetchImpl,
    })
    expect(result).toBe('stale')
  })
})
