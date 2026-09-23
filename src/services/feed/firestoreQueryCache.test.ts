import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearFirestoreQueryCache,
  getOrSetCache,
  peekFirestoreQueryCache,
} from './firestoreQueryCache'

describe('firestoreQueryCache', () => {
  afterEach(() => {
    vi.useRealTimers()
    clearFirestoreQueryCache()
  })

  it('calls the loader once within TTL and returns the cached value', async () => {
    let loads = 0
    const load = async () => {
      loads += 1
      return ['a', 'b']
    }

    const first = await getOrSetCache('k1', 30_000, load)
    const second = await getOrSetCache('k1', 30_000, load)

    expect(first).toEqual(['a', 'b'])
    expect(second).toBe(first)
    expect(loads).toBe(1)
  })

  it('reloads after TTL expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-23T09:00:00.000Z'))

    let loads = 0
    const load = async () => {
      loads += 1
      return { n: loads }
    }

    const first = await getOrSetCache('ttl', 20_000, load)
    vi.setSystemTime(new Date('2026-09-23T09:00:19.000Z'))
    const stillCached = await getOrSetCache('ttl', 20_000, load)
    vi.setSystemTime(new Date('2026-09-23T09:00:21.000Z'))
    const afterTtl = await getOrSetCache('ttl', 20_000, load)

    expect(first).toEqual({ n: 1 })
    expect(stillCached).toEqual({ n: 1 })
    expect(afterTtl).toEqual({ n: 2 })
    expect(loads).toBe(2)
  })

  it('coalesces concurrent misses for the same key', async () => {
    let loads = 0
    const load = async () => {
      loads += 1
      await new Promise((resolve) => setTimeout(resolve, 20))
      return 'shared'
    }

    const [a, b, c] = await Promise.all([
      getOrSetCache('race', 30_000, load),
      getOrSetCache('race', 30_000, load),
      getOrSetCache('race', 30_000, load),
    ])

    expect(a).toBe('shared')
    expect(b).toBe('shared')
    expect(c).toBe('shared')
    expect(loads).toBe(1)
  })

  it('peek misses after expiry and clearFirestoreQueryCache drops entries', async () => {
    await getOrSetCache('peek', 30_000, async () => ({ ok: true }))
    expect(peekFirestoreQueryCache('peek')).toEqual({ ok: true })

    clearFirestoreQueryCache()
    expect(peekFirestoreQueryCache('peek')).toBeUndefined()
  })
})
