import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))

const st = vi.hoisted(() => ({
  enabled: true,
  mirrorFail: false,
  mirrorCalls: [] as unknown[][],
  fsCalls: 0,
}))

vi.mock('@/services/newsMirror/newsMirrorReads', () => ({
  isMirrorReadEnabled: (s: string) => s === 'sitemap' && st.enabled,
  loadMirrorMonthDocs: vi.fn(async (...args: unknown[]) => {
    st.mirrorCalls.push(args)
    if (st.mirrorFail) throw new Error('neon down')
    return [{ id: 'm1', data: { slug: 'm1', status: 'published', publishedAt: args[0] } }]
  }),
  discoverMirrorMonths: vi.fn(async () => {
    if (st.mirrorFail) throw new Error('neon down')
    return ['2026-11', '2026-10', '1970-01']
  }),
}))

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => {
    const q: any = {
      where: () => q,
      orderBy: () => q,
      select: () => q,
      limit: () => q,
      startAfter: () => q,
      get: async () => {
        st.fsCalls++
        return { empty: true, docs: [] }
      },
    }
    return { collection: () => q }
  },
}))

import { discoverFirestoreMonths, loadFirestoreMonthDocs } from '@/lib/sitemap/articleSitemap'

const NOW = Date.UTC(2026, 10, 15, 12)

describe('FinOps Neon phase 2.1: article sitemap reads the mirror', () => {
  beforeEach(() => {
    st.enabled = true
    st.mirrorFail = false
    st.mirrorCalls = []
    st.fsCalls = 0
  })
  afterEach(() => vi.clearAllMocks())

  it('flag on: month docs come from the mirror with the same bounds and fields, no Firestore read', async () => {
    const docs = await loadFirestoreMonthDocs('2026-10', NOW)
    expect(docs).toEqual([{ id: 'm1', data: expect.objectContaining({ slug: 'm1' }) }])
    expect(st.fsCalls).toBe(0)
    const [start, upper, fields] = st.mirrorCalls[0] as [number, number, string[]]
    expect(start).toBe(Date.UTC(2026, 9, 1))
    expect(upper).toBe(Date.UTC(2026, 10, 1))
    expect(fields).toEqual(expect.arrayContaining(['slug', 'publishedAt', 'updatedAt', 'status', 'seoNoindex']))
  })

  it('current month is capped at now + 1', async () => {
    await loadFirestoreMonthDocs('2026-11', NOW)
    expect((st.mirrorCalls[0] as number[])[1]).toBe(NOW + 1)
  })

  it('mirror failure falls back to Firestore', async () => {
    st.mirrorFail = true
    await loadFirestoreMonthDocs('2026-10', NOW)
    expect(st.fsCalls).toBe(1)
  })

  it('flag off: Firestore only', async () => {
    st.enabled = false
    await loadFirestoreMonthDocs('2026-10', NOW)
    expect(st.mirrorCalls).toHaveLength(0)
    expect(st.fsCalls).toBe(1)
  })

  it('month discovery comes from the mirror and drops pre-2000 months', async () => {
    expect(await discoverFirestoreMonths(NOW)).toEqual(['2026-11', '2026-10'])
    expect(st.fsCalls).toBe(0)
  })
})
