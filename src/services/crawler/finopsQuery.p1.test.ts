import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { discoveredUrlPatchChanges, DrizzleCrawlerStore } from './store/drizzle'
import type { DiscoveredUrlRecord } from './types'

vi.mock('@/db', () => ({
  hasDatabaseUrl: vi.fn(() => true),
  getDb: vi.fn(),
}))

function url(overrides: Partial<DiscoveredUrlRecord> = {}): DiscoveredUrlRecord {
  return {
    id: 'url1',
    sourceId: 'src',
    url: 'https://news.test/a',
    normalizedUrl: 'https://news.test/a',
    canonicalUrl: null,
    urlHash: 'hash',
    discoveredAt: new Date('2026-09-01T00:00:00.000Z'),
    publishedAtHint: null,
    status: 'FETCHED',
    fetchAttempts: 1,
    lastFetchAttempt: null,
    failureReason: null,
    etag: null,
    lastModified: null,
    logicalQueue: 'EXTRACTION_QUEUE',
    discoveryLane: 'CRAWLER',
    discoveryLanes: ['CRAWLER'],
    titleHint: 'A',
    guid: null,
    discoveryPrimaryImageCandidate: null,
    rssDescription: null,
    feedMetadata: { titleHash: 't1' },
    ...overrides,
  }
}

describe('FINOPS crawler query reduction', () => {
  it('listPendingClusterArticles filters memberships in SQL, not by loading every article_id', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/services/crawler/store/drizzle.ts'), 'utf8')
    const start = src.indexOf('async listPendingClusterArticles')
    const end = src.indexOf('async getMembershipByArticle')
    const fn = src.slice(start, end)
    expect(fn).toContain('not exists')
    expect(fn).toContain('cluster_memberships')
    expect(fn).not.toContain('.from(clusterMemberships)')
    expect(fn).toContain('limit ${fetchLimit}')
  })

  it('skips discovered URL updates when status and identity fields are unchanged', () => {
    const current = url()
    expect(discoveredUrlPatchChanges(current, { status: 'FETCHED', feedMetadata: { titleHash: 't1' } })).toBe(false)
    expect(discoveredUrlPatchChanges(current, { status: 'PENDING_FETCH' })).toBe(true)
    expect(discoveredUrlPatchChanges(current, { urlHash: 'other' })).toBe(true)
  })

  it('batches 100 metric increments into one upsert', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    const insert = vi.fn(() => ({ values }))
    const { getDb } = await import('@/db')
    vi.mocked(getDb).mockReturnValue({ insert } as never)

    const store = new DrizzleCrawlerStore()
    store.beginMetricBatch()
    for (let i = 0; i < 100; i++) {
      await store.incrementMetric('http_requests', 1, new Date('2026-09-25T00:00:00.000Z'))
    }
    expect(insert).not.toHaveBeenCalled()
    const trips = await store.flushMetricBatch()
    expect(trips).toBe(1)
    expect(insert).toHaveBeenCalledTimes(1)
    const written = (values.mock.calls[0] as unknown as [Array<{ value: number }>])[0]
    expect(written).toHaveLength(1)
    expect(written[0]?.value).toBe(100)
  })

  it('getRawArticleText selects columns without article_body_html', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/services/crawler/store/drizzle.ts'), 'utf8')
    const start = src.indexOf('async getRawArticleText')
    const end = src.indexOf('async listRecentArticles')
    const fn = src.slice(start, end)
    expect(fn).toContain('articleBodyHtml')
    expect(fn).toContain('getTableColumns')
    expect(fn).not.toContain('.select()')
  })
})
