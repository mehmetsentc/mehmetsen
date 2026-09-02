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

import { hasDatabaseUrl } from '@/db'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { feedCandidateService } from './FeedCandidateService'
import type { FeedCandidateRow } from '@/types/smartFeed'

function makePgRow(id: string, overrides: Partial<FeedCandidateRow> = {}): FeedCandidateRow {
  const publishedAt = new Date('2026-09-01T12:00:00.000Z')
  return {
    articleId: id,
    clusterId: null,
    publisherId: null,
    publisherSlug: null,
    publisherName: 'NaHaber',
    publisherLogoUrl: null,
    publisherVerified: false,
    headline: `PG ${id}`,
    summary: null,
    category: 'gundem',
    image: null,
    video: null,
    publishedAt,
    updatedAt: publishedAt,
    breaking: false,
    materialUpdate: false,
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
    slug: `slug-${id}`,
    source: 'RECENT',
    sortScore: publishedAt.getTime(),
    ...overrides,
  }
}

function fsDoc(
  id: string,
  data: Record<string, unknown>
): { id: string; data: () => Record<string, unknown> } {
  return { id, data: () => data }
}

describe('P18.3A Smart Feed underfill supplement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
  })

  it('supplements when PG returns only 3 and FS has LEGACY_ALLOWED', async () => {
    const pgRows = [makePgRow('pg1'), makePgRow('pg2'), makePgRow('pg3')]

    // Spy private merge path via public fetchRecent by mocking DB + FS
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(
        pgRows.map((r) => ({
          articleId: r.articleId,
          clusterId: null,
          publisherId: null,
          publisherSlug: null,
          publisherName: 'NaHaber',
          publisherLogoUrl: null,
          publisherVerified: false,
          headline: r.headline,
          summary: null,
          category: 'gundem',
          image: null,
          video: null,
          publishedAt: r.publishedAt,
          updatedAt: r.updatedAt,
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
          slug: r.slug,
        }))
      ),
    }

    const { getDb } = await import('@/db')
    vi.mocked(getDb as unknown as () => unknown).mockReturnValue({
      select: vi.fn(() => selectChain),
    })

    const docs = Array.from({ length: 20 }, (_, i) =>
      fsDoc(`fs${i}`, {
        title: `Legacy ${i}`,
        status: 'published',
        slug: `legacy-${i}`,
        publishedAt: Date.now() - i * 1000,
      })
    )

    vi.mocked(getAdminFirestore).mockReturnValue({
      collection: vi.fn(() => ({
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        startAfter: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: false, docs }),
      })),
      getAll: vi.fn(),
    } as never)

    const rows = await feedCandidateService.fetchRecent({
      limit: 15,
      cursor: null,
    })

    expect(rows.length).toBe(15)
    expect(rows.slice(0, 3).map((r) => r.articleId)).toEqual(['pg1', 'pg2', 'pg3'])
    expect(rows.slice(3).every((r) => r.articleId.startsWith('fs'))).toBe(true)
  })

  it('never returns LEGACY_QUARANTINED from FS supplement', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    }
    const { getDb } = await import('@/db')
    vi.mocked(getDb as unknown as () => unknown).mockReturnValue({
      select: vi.fn(() => selectChain),
    })

    const docs = [
      fsDoc('bad1', {
        title: 'Auto',
        status: 'published',
        slug: 'auto-1',
        publishedAt: Date.now(),
        aiAutoPublished: true,
      }),
      fsDoc('good1', {
        title: 'Normal',
        status: 'published',
        slug: 'normal-1',
        publishedAt: Date.now() - 1000,
      }),
    ]

    vi.mocked(getAdminFirestore).mockReturnValue({
      collection: vi.fn(() => ({
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        startAfter: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: false, docs }),
      })),
      getAll: vi.fn(),
    } as never)

    const rows = await feedCandidateService.fetchRecent({ limit: 10, cursor: null })
    expect(rows.map((r) => r.articleId)).toEqual(['good1'])
    expect(rows.every((r) => r.articleId !== 'bad1')).toBe(true)
  })

  it('fetchByIds hydrates missing FS ids after PG miss', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    }
    // inArray path: select().from...where — no orderBy/limit
    const whereOnly = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    }
    const { getDb } = await import('@/db')
    vi.mocked(getDb as unknown as () => unknown).mockReturnValue({
      select: vi.fn(() => whereOnly),
    })

    const snap = {
      exists: true,
      id: 'fs_legacy_1',
      data: () => ({
        title: 'Hydrated',
        status: 'published',
        slug: 'hydrated',
        publishedAt: Date.now(),
      }),
    }

    vi.mocked(getAdminFirestore).mockReturnValue({
      collection: vi.fn(() => ({
        doc: vi.fn((id: string) => ({ id, path: `news/${id}` })),
      })),
      getAll: vi.fn().mockResolvedValue([snap]),
    } as never)

    const rows = await feedCandidateService.fetchByIds(['fs_legacy_1'])
    expect(rows).toHaveLength(1)
    expect(rows[0].articleId).toBe('fs_legacy_1')
    expect(rows[0].headline).toBe('Hydrated')
    void selectChain
  })
})

describe('P18.3A mode nav safe-area', () => {
  it('FeedModeNav source uses mobile-sat / safe-area inset (not undefined pt-safe-top)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const src = await fs.readFile(
      path.join(process.cwd(), 'src/components/feed/smart/FeedModeNav.tsx'),
      'utf8'
    )
    expect(src).toContain('safe-area-inset-top')
    expect(src).toContain('data-testid="smart-feed-mode-nav"')
    expect(src).not.toContain('pt-safe-top')
  })
})
