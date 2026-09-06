import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getCanonicalMemoryCoverage } from '@/services/editorial/editorialMemoryCoverage'
import { GET } from './route'

vi.mock('@/lib/cmsAuthServer', () => ({
  verifyCmsToken: vi.fn(),
}))

vi.mock('@/services/editorial/editorialMemoryCoverage', () => ({
  getCanonicalMemoryCoverage: vi.fn(),
}))

describe('Faz A3 Task 2/16/19 — GET /api/admin/editorial-memory/coverage', () => {
  afterEach(() => {
    vi.mocked(verifyCmsToken).mockReset()
    vi.mocked(getCanonicalMemoryCoverage).mockReset()
  })

  it('requires CMS auth (editors:manage or ai:configure) — no parallel auth mechanism', async () => {
    vi.mocked(verifyCmsToken).mockResolvedValue(null)
    const res = await GET(new Request('http://localhost/api/admin/editorial-memory/coverage'))
    expect(res.status).toBe(401)
    expect(vi.mocked(getCanonicalMemoryCoverage)).not.toHaveBeenCalled()
  })

  it('returns the read-only coverage stats for an authorized admin', async () => {
    vi.mocked(verifyCmsToken).mockImplementation(async (_req, perm) =>
      perm === 'editors:manage' ? ({ uid: 'admin_1', role: 'admin' } as never) : null
    )
    vi.mocked(getCanonicalMemoryCoverage).mockResolvedValue({
      hasDatabaseUrl: true,
      total: 10,
      oldestPublishedAt: null,
      newestPublishedAt: null,
      last7d: 0,
      last30d: 0,
      last90d: 0,
      last365d: 0,
      olderThan365d: 0,
      topCities: [],
      topCategories: [],
    })

    const res = await GET(new Request('http://localhost/api/admin/editorial-memory/coverage'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.coverage.total).toBe(10)
    expect(vi.mocked(getCanonicalMemoryCoverage)).toHaveBeenCalledTimes(1)
  })
})
