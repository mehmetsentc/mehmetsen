import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDb, hasDatabaseUrl } from '@/db'

vi.mock('@/db', () => ({
  hasDatabaseUrl: vi.fn(),
  getDb: vi.fn(),
}))

import { getCanonicalMemoryCoverage } from './editorialMemoryCoverage'

// Every drizzle chain method (.from/.where/.groupBy/.orderBy/.limit) just
// narrows the query — it never changes the eventually-awaited value. This
// thenable stub lets the SAME queued row-set resolve whether the real code
// awaits after .where() (total/buckets queries) or after .limit() (top
// cities/categories queries).
function chainableResolvingTo(value: unknown) {
  const obj: Record<string, unknown> = {}
  const thenable = Promise.resolve(value)
  for (const m of ['from', 'where', 'groupBy', 'orderBy', 'limit']) {
    obj[m] = () => obj
  }
  obj.then = thenable.then.bind(thenable)
  obj.catch = thenable.catch.bind(thenable)
  return obj
}

function mockCoverageDb(queue: unknown[]) {
  let i = 0
  return {
    select: () => chainableResolvingTo(queue[i++]),
  } as unknown as ReturnType<typeof getDb>
}

describe('Faz A3 Task 2/16 — getCanonicalMemoryCoverage (read-only diagnostic)', () => {
  afterEach(() => {
    vi.mocked(getDb).mockReset()
    vi.mocked(hasDatabaseUrl).mockReset()
  })

  it('returns hasDatabaseUrl:false without ever calling getDb when there is no DATABASE_URL', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(false)
    const stats = await getCanonicalMemoryCoverage()
    expect(stats.hasDatabaseUrl).toBe(false)
    expect(stats.total).toBe(0)
    expect(vi.mocked(getDb)).not.toHaveBeenCalled()
  })

  it('aggregates total/date-range/bucket counts and filters out null city/category rows', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    const oldest = new Date('2020-01-01T00:00:00.000Z')
    const newest = new Date('2026-09-01T00:00:00.000Z')
    vi.mocked(getDb).mockReturnValue(
      mockCoverageDb([
        [{ total: 4321, oldest, newest }],
        [{ last7d: 10, last30d: 40, last90d: 90, last365d: 400, olderThan365d: 3921 }],
        [
          { citySlug: 'izmir', count: 120 },
          { citySlug: null, count: 5 },
        ],
        [
          { categoryId: 'gundem', count: 200 },
          { categoryId: null, count: 3 },
        ],
      ])
    )

    const stats = await getCanonicalMemoryCoverage()

    expect(stats.hasDatabaseUrl).toBe(true)
    expect(stats.total).toBe(4321)
    expect(stats.oldestPublishedAt).toBe(oldest.toISOString())
    expect(stats.newestPublishedAt).toBe(newest.toISOString())
    expect(stats.last7d).toBe(10)
    expect(stats.last30d).toBe(40)
    expect(stats.last90d).toBe(90)
    expect(stats.last365d).toBe(400)
    expect(stats.olderThan365d).toBe(3921)
    expect(stats.topCities).toEqual([{ citySlug: 'izmir', count: 120 }])
    expect(stats.topCategories).toEqual([{ categoryId: 'gundem', count: 200 }])
    expect(stats.queryError).toBeUndefined()
  })

  it('reports a real query failure as queryError rather than fabricating zero coverage silently', async () => {
    vi.mocked(hasDatabaseUrl).mockReturnValue(true)
    vi.mocked(getDb).mockReturnValue({
      select: () => {
        throw new Error('simulated DB outage')
      },
    } as unknown as ReturnType<typeof getDb>)

    const stats = await getCanonicalMemoryCoverage()
    expect(stats.hasDatabaseUrl).toBe(true)
    expect(stats.total).toBe(0)
    expect(stats.queryError).toContain('simulated DB outage')
  })
})
