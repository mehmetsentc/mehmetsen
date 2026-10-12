import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/finops/publicReadBudget', () => ({
  notePublicFirestoreReads: vi.fn(),
  publicReadCircuitOpen: () => false,
}))

import {
  emptyFeedFsStats,
  readFeedQuery,
  resetPublicFeedPoolForTests,
} from './feedFsReadCache'

function snapOf(n: number) {
  return {
    empty: n === 0,
    docs: Array.from({ length: n }, (_, i) => ({ id: `d${i}`, data: () => ({}) })),
  }
}

describe('readFeedQuery (FinOps 12 Oct)', () => {
  beforeEach(() => resetPublicFeedPoolForTests())

  it('coalesces concurrent identical windows into one Firestore read', async () => {
    let resolve!: (v: ReturnType<typeof snapOf>) => void
    const get = vi.fn(() => new Promise<ReturnType<typeof snapOf>>((r) => (resolve = r)))
    const a = emptyFeedFsStats()
    const b = emptyFeedFsStats()
    const p1 = readFeedQuery({ get }, 'cat:gundem:::49', a)
    const p2 = readFeedQuery({ get }, 'cat:gundem:::49', b)
    resolve(snapOf(49))
    const [s1, s2] = await Promise.all([p1, p2])
    expect(get).toHaveBeenCalledTimes(1)
    expect(s1).toBe(s2)
    expect(a.documentsRead + b.documentsRead).toBe(49)
    expect(a.cacheHits + b.cacheHits).toBe(1)
  })

  it('keeps first-page windows while many cursor keys are written', async () => {
    const first = vi.fn(async () => snapOf(49))
    await readFeedQuery({ get: first }, 'cat:spor:::49', emptyFeedFsStats())
    for (let i = 0; i < 100; i++) {
      await readFeedQuery({ get: async () => snapOf(10) }, `cat:x:${i}:::49`, emptyFeedFsStats())
    }
    const stats = emptyFeedFsStats()
    await readFeedQuery({ get: first }, 'cat:spor:::49', stats)
    expect(first).toHaveBeenCalledTimes(1)
    expect(stats.cacheHits).toBe(1)
  })

  it('does not cache a failed read', async () => {
    const bad = vi.fn(async () => {
      throw new Error('boom')
    })
    await expect(readFeedQuery({ get: bad }, 'k', emptyFeedFsStats())).rejects.toThrow('boom')
    const good = vi.fn(async () => snapOf(3))
    const snap = await readFeedQuery({ get: good }, 'k', emptyFeedFsStats())
    expect(snap.docs).toHaveLength(3)
  })
})
