/** LIBRARY-2 — kaydedilen videolar: kategori, konum ve video etkileşimi tek toplu okumayla eklenir. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from '@/lib/social/accounts/testing/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => h.db }))
vi.mock('@/lib/social/accounts/connect/routeHelpers', () => ({
  requireAccountManager: async () => ({ ctx: { uid: 'u1' } }),
  json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
}))
vi.mock('@/lib/reels/reelLibrary', () => ({
  listReels: async () => [
    { newsId: 'n1', slug: 's1', headline: 'Antalya sağanak', url: 'https://s/1.mp4', coverUrl: null, seconds: 40, persona: null, style: null, media: null, by: null, createdAt: null, updatedAt: null, renders: 1 },
    { newsId: 'n2', slug: 's2', headline: 'Ulusal', url: 'https://s/2.mp4', coverUrl: null, seconds: 30, persona: null, style: null, media: null, by: null, createdAt: null, updatedAt: null, renders: 1 },
  ],
}))

import { GET } from './route'

describe('GET /api/admin/social/reels/library', () => {
  beforeEach(async () => {
    const fs = new FakeFirestore()
    h.db = fs
    await fs.collection('news').doc('n1').set({ categoryId: 'yerel-asayis', citySlug: 'antalya', cityName: 'Antalya', status: 'published' })
    await fs.collection('news').doc('n2').set({ categoryId: 'gundem', status: 'published' })
    await fs.collection('socialEngagement').doc('n1').set({
      newsId: 'n1', slug: 's1', updatedAt: 5, totals: { likes: 30, views: 900, saves: 4 }, approvedComments: [],
      targets: {
        a: { platform: 'instagram', accountId: 'i1', accountName: '@antalya', format: 'reel', externalPostId: 'm', permalink: 'https://instagram.com/r/x', metrics: { views: 900, likes: 20, saves: 4 }, state: 'ok', missing: [], fetchedAt: 5, commentIds: [] },
        b: { platform: 'facebook', accountId: 'f1', accountName: 'Sayfa', format: 'post', externalPostId: 'p', permalink: null, metrics: { likes: 10 }, state: 'ok', missing: [], fetchedAt: 5, commentIds: [] },
      },
    })
  })

  it('kategori / konum ve video etkileşimini (yalnız video biçimleri) ekler; token veya hesap kimliği yok', async () => {
    const res = await GET(new Request('https://x/api/admin/social/reels/library?limit=10'))
    const body = (await res.json()) as { items: Array<Record<string, any>> }
    const [a, b] = body.items
    expect(a).toMatchObject({ newsId: 'n1', categoryId: 'yerel-asayis', citySlug: 'antalya', cityName: 'Antalya' })
    expect(a.engagement.video).toEqual({ views: 900, likes: 20, saves: 4 })
    expect(a.engagement.totals).toEqual({ likes: 30, views: 900, saves: 4 })
    expect(a.engagement.platforms).toHaveLength(2)
    expect(JSON.stringify(a.engagement)).not.toContain('accountId')
    expect(b).toMatchObject({ newsId: 'n2', categoryId: 'gundem', citySlug: null, engagement: null })
  })
})
