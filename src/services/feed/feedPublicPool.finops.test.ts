import { describe, expect, it, vi } from 'vitest'
import {
  emptyFeedFsStats,
  FEED_PUBLIC_POOL_TTL_MS,
  readFeedQuery,
  resetPublicFeedPoolForTests,
  runWithFeedFsCache,
} from './feedFsReadCache'
import { resetPublicReadBudgetForTests } from '@/lib/finops/publicReadBudget'

describe('feed public candidate pool', () => {
  it('reuses one Firestore window across requests for 45 seconds', async () => {
    resetPublicReadBudgetForTests()
    resetPublicFeedPoolForTests()
    const get = vi.fn(async () => ({
      empty: false,
      docs: [{ id: 'a', data: () => ({ title: 'public' }) }],
    }))
    const key = 'cat:gundem::::80'

    const first = emptyFeedFsStats()
    await runWithFeedFsCache(() => readFeedQuery({ get }, key, first))
    const second = emptyFeedFsStats()
    await runWithFeedFsCache(() => readFeedQuery({ get }, key, second))

    expect(FEED_PUBLIC_POOL_TTL_MS).toBeGreaterThanOrEqual(30_000)
    expect(FEED_PUBLIC_POOL_TTL_MS).toBeLessThanOrEqual(120_000)
    expect(get).toHaveBeenCalledTimes(1)
    expect(first.documentsRead).toBe(1)
    expect(second.documentsRead).toBe(0)
    expect(second.cacheHits).toBe(1)
  })
})
