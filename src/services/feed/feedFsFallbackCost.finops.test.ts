import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/db', () => ({
  hasDatabaseUrl: vi.fn(() => true),
  getDb: vi.fn(),
}))

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: vi.fn(),
}))

vi.mock('@/lib/firebase/collections', () => ({
  Collections: { NEWS: 'news' },
}))

import { getDb } from '@/db'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { feedCandidateService, feedFsAttemptLimits } from './FeedCandidateService'
import { runWithFeedFsCache } from './feedFsReadCache'

function pgChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  }
}

function pgRow(id: string) {
  const publishedAt = new Date('2026-09-01T12:00:00.000Z')
  return {
    articleId: id,
    clusterId: null,
    publisherId: null,
    publisherSlug: null,
    publisherName: 'NaHaber',
    publisherLogoUrl: null,
    publisherVerified: false,
    headline: id,
    summary: null,
    category: 'gundem',
    image: null,
    video: null,
    publishedAt,
    updatedAt: publishedAt,
    breaking: false,
    materialUpdate: null,
    clusterSourceCount: 1,
    clusterImportance: 50,
    sourceQualityTier: 'STANDARD',
    sourceHealthScore: 75,
    citySlug: null,
    districtSlug: null,
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    slug: id,
  }
}

describe('FINOPS Firestore fallback read reduction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.FEED_FS_CATEGORY_MAX_ATTEMPTS
    delete process.env.FEED_FS_OLDER_MAX_ATTEMPTS
  })

  it('defaults category and older caps to 4 and restores 12/8 via env', () => {
    expect(feedFsAttemptLimits().category).toBe(4)
    expect(feedFsAttemptLimits().older).toBe(4)
    process.env.FEED_FS_CATEGORY_MAX_ATTEMPTS = '12'
    process.env.FEED_FS_OLDER_MAX_ATTEMPTS = '8'
    expect(feedFsAttemptLimits().category).toBe(12)
    expect(feedFsAttemptLimits().older).toBe(8)
  })

  it('does not read Firestore when PG already fills the pool', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => pgRow(`pg${i}`))
    vi.mocked(getDb as unknown as () => unknown).mockReturnValue({
      select: vi.fn(() => pgChain(rows)),
    })
    const get = vi.fn()
    vi.mocked(getAdminFirestore).mockReturnValue({
      collection: vi.fn(() => ({
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        startAfter: vi.fn().mockReturnThis(),
        get,
      })),
    } as never)

    const out = await feedCandidateService.fetchRecent({ limit: 10, cursor: null })
    expect(out.length).toBeGreaterThan(0)
    expect(get).not.toHaveBeenCalled()
  })

  it('reads Firestore when PG is underfilled, and dedupes the same window in one request', async () => {
    vi.mocked(getDb as unknown as () => unknown).mockReturnValue({
      select: vi.fn(() => pgChain([])),
    })
    const docs = [
      {
        id: 'fs1',
        data: () => ({
          title: 'Legacy',
          status: 'published',
          slug: 'legacy',
          publishedAt: new Date().toISOString(),
        }),
      },
    ]
    const get = vi.fn().mockResolvedValue({ empty: false, docs })
    vi.mocked(getAdminFirestore).mockReturnValue({
      collection: vi.fn(() => ({
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        startAfter: vi.fn().mockReturnThis(),
        get,
      })),
    } as never)

    await runWithFeedFsCache(async () => {
      await feedCandidateService.fetchRecent({ limit: 10, cursor: null, surface: 'feed-v2' })
      await feedCandidateService.fetchRecent({ limit: 10, cursor: null, surface: 'feed-v2' })
    })
    expect(get.mock.calls.length).toBe(1)
  })
})
