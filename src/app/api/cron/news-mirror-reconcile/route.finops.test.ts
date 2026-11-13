import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ cursor: null as string | null, upserts: [] as string[][], pages: [] as { id: string; publishedAt: number }[][] }))

vi.mock('@/lib/eventSyncAuth', () => ({ isSyncSecretAuthorized: () => true }))
vi.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: () => '__name__' } }))
vi.mock('@/services/newsMirror/newsReadMirror', () => ({
  isNewsPgMirrorEnabled: () => true,
  readBackfillCursor: async () => state.cursor,
  writeBackfillCursor: async (v: string) => {
    state.cursor = v
  },
  toNewsMirrorRow: (id: string) => ({ id }),
  upsertNewsMirrorRows: async (rows: { id: string }[]) => {
    state.upserts.push(rows.map((r) => r.id))
  },
}))
vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => {
    const q: any = {
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      startAfter: () => q,
      get: async () => {
        const page = state.pages.shift() ?? []
        const docs = page.map((d) => ({ id: d.id, data: () => d, get: (k: string) => (d as any)[k] }))
        return { empty: docs.length === 0, size: docs.length, docs }
      },
    }
    return { collection: () => q }
  },
}))

import { GET } from './route'

const page = (n: number, start: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `n${start + i}`, publishedAt: 2_000_000 - (start + i) }))

describe('FinOps Neon phase 1: automatic backfill in the hourly cron', () => {
  beforeEach(() => {
    state.cursor = null
    state.upserts = []
    state.pages = []
  })

  it('mirrors pages and stores a resumable cursor, then marks done on a short page', async () => {
    state.pages = [page(500, 0), page(120, 500)]
    const res = await (await GET(new Request('https://x/api/cron/news-mirror-reconcile'))).json()
    expect(res.backfill).toEqual({ done: true, mirrored: 620 })
    expect(state.upserts.map((u) => u.length)).toEqual([500, 120])
    expect(state.cursor).toBe('done')
  })

  it('does nothing once the backfill is done', async () => {
    state.cursor = 'done'
    const res = await (await GET(new Request('https://x/api/cron/news-mirror-reconcile'))).json()
    expect(res.backfill).toEqual({ done: true, mirrored: 0 })
    expect(state.upserts).toEqual([])
  })

  it('stops at the per-run limit and leaves the cursor at the last doc', async () => {
    state.pages = Array.from({ length: 9 }, (_, i) => page(500, i * 500))
    const res = await (await GET(new Request('https://x/api/cron/news-mirror-reconcile'))).json()
    expect(res.backfill).toEqual({ done: false, mirrored: 4000 })
    expect(state.cursor).toBe(`${2_000_000 - 3999}|n3999`)
  })
})
