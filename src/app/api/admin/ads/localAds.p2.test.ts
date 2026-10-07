/**
 * Phase 2C — local (il/ilçe) ads: scoped creation, approval, public geo selection.
 * In-memory Firestore fake; local fixtures only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldValue } from 'firebase-admin/firestore'

type Doc = Record<string, unknown>
const db = new Map<string, Map<string, Doc>>()
const tokens = new Map<string, { uid: string; email?: string }>()
const colMap = (n: string) => { if (!db.has(n)) db.set(n, new Map()); return db.get(n)! }
const clean = (d: Doc) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v instanceof FieldValue ? '2026-10-07T00:00:00.000Z' : v]))
let autoId = 0
const ref = (n: string, id: string) => ({
  id,
  async get() { const d = colMap(n).get(id); return { id, exists: Boolean(d), data: () => (d ? structuredClone(d) : undefined) } },
  async update(p: Doc) { colMap(n).set(id, { ...colMap(n).get(id)!, ...clean(p) }) },
  async delete() { colMap(n).delete(id) },
})
function query(n: string, f: Array<[string, unknown]>) {
  return {
    where: (k: string, _op: string, v: unknown) => query(n, [...f, [k, v]]),
    limit: () => query(n, f),
    async get() {
      const docs = [...colMap(n).entries()].filter(([, d]) => f.every(([k, v]) => d[k] === v)).map(([id, d]) => ({ id, data: () => structuredClone(d) }))
      return { docs }
    },
  }
}
const fake = {
  collection: (n: string) => ({
    ...query(n, []),
    doc: (id: string) => ref(n, id),
    add: async (d: Doc) => { const id = `ad_${++autoId}`; colMap(n).set(id, clean(d)); return ref(n, id) },
  }),
}
vi.mock('@/lib/firebase/admin', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAdminFirestore: () => fake,
  getAdminAuth: () => ({ verifyIdToken: async (t: string) => { const h = tokens.get(t); if (!h) throw new Error('bad'); return h } }),
}))

import { NextRequest } from 'next/server'
import { GET as listAds, POST as createAd } from './route'
import { PATCH as patchAd, DELETE as deleteAd } from './[id]/route'
import { GET as publicAds } from '../../ads/route'

const img = { name: 'Kampanya', format: 'image', imageUrl: 'https://cdn.example.test/a.png', clickUrl: 'https://shop.example.test' }
function seed() {
  db.clear(); tokens.clear(); autoId = 0
  const user = (tok: string, uid: string, data: Doc) => { tokens.set(tok, { uid, email: `${uid}@example.test` }); colMap('users').set(uid, data) }
  user('t-prov', 'u-prov', { role: 'managing_editor', cmsScope: { provinceSlugs: ['canakkale'] } })
  user('t-ezine', 'u-ezine', { role: 'editor', cmsScope: { provinceSlugs: ['canakkale'], districtSlugs: ['ezine'] } })
  user('t-ant', 'u-ant', { role: 'managing_editor', cmsScope: { provinceSlugs: ['antalya'] } })
  user('t-global', 'u-global', { role: 'editor' })
  colMap('adBanners').set('nat', { name: 'Ulusal', slotId: 'category-yerel-haber-top', format: 'image', imageUrl: 'https://x/n.png', active: true, priority: 5 })
}
const req = (url: string, tok: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const pub = async (qs: string) => (await (await publicAds(new NextRequest(`http://localhost/api/ads?${qs}`))).json()).ads as Record<string, { id: string } | null>

beforeEach(() => { seed(); vi.stubEnv('SUPER_ADMIN_EMAIL', 'root@example.test'); vi.stubEnv('ADMIN_BOOTSTRAP_UIDS', ''); vi.stubEnv('NEXT_PUBLIC_ADMIN_UIDS', '') })
afterEach(() => vi.unstubAllEnvs())

describe('ilçe editörü creates a local ad', () => {
  it('is forced to its il/ilçe, starts pending, is invisible publicly until approved', async () => {
    const res = await createAd(req('/api/admin/ads', 't-ezine', 'POST', { ...img, slotId: 'category-yerel-haber-top', districtSlug: 'biga' }))
    expect(res.status).toBe(201)
    const ad = colMap('adBanners').get('ad_1')!
    expect(ad).toMatchObject({ provinceSlug: 'canakkale', districtSlug: 'ezine', status: 'pending', submittedByUid: 'u-ezine' })
    expect((await pub('page=category&categoryId=yerel-haber&citySlug=canakkale&districtSlug=ezine'))['category-yerel-haber-top']?.id).toBe('nat')
  })
  it('cannot use national slots or HTML', async () => {
    expect((await createAd(req('/api/admin/ads', 't-ezine', 'POST', { ...img, slotId: 'leaderboard-top' }))).status).toBe(400)
    expect((await createAd(req('/api/admin/ads', 't-ezine', 'POST', { name: 'x', format: 'html', htmlContent: '<script>1</script>', slotId: 'category-yerel-haber-top' }))).status).toBe(400)
  })
})

describe('approval by the il genel editörü', () => {
  it('approves its province ad; ad then wins on matching il/ilçe pages only', async () => {
    await createAd(req('/api/admin/ads', 't-ezine', 'POST', { ...img, slotId: 'category-yerel-haber-top', priority: 1 }))
    expect((await patchAd(req('/x', 't-ezine', 'PATCH', { status: 'approved' }), ctx('ad_1'))).status).toBe(403)
    expect((await patchAd(req('/x', 't-ant', 'PATCH', { status: 'approved' }), ctx('ad_1'))).status).toBe(403)
    expect((await patchAd(req('/x', 't-prov', 'PATCH', { status: 'approved' }), ctx('ad_1'))).status).toBe(200)
    // more specific (ilçe) beats national even with lower priority
    expect((await pub('page=category&categoryId=yerel-haber&citySlug=canakkale&districtSlug=ezine'))['category-yerel-haber-top']?.id).toBe('ad_1')
    expect((await pub('page=category&categoryId=yerel-haber&citySlug=canakkale'))['category-yerel-haber-top']?.id).toBe('nat')
    expect((await pub('page=category&categoryId=yerel-haber&citySlug=antalya&districtSlug=ezine'))['category-yerel-haber-top']?.id).toBe('nat')
    expect((await pub('page=category&categoryId=yerel-haber'))['category-yerel-haber-top']?.id).toBe('nat')
  })
  it('an edit by the ilçe editörü sends an approved ad back to pending', async () => {
    await createAd(req('/api/admin/ads', 't-ezine', 'POST', { ...img, slotId: 'category-yerel-haber-top' }))
    await patchAd(req('/x', 't-prov', 'PATCH', { status: 'approved' }), ctx('ad_1'))
    await patchAd(req('/x', 't-ezine', 'PATCH', { clickUrl: 'https://other.example.test' }), ctx('ad_1'))
    expect(colMap('adBanners').get('ad_1')?.status).toBe('pending')
  })
  it('il genel editörü ads are approved immediately and can target one ilçe', async () => {
    await createAd(req('/api/admin/ads', 't-prov', 'POST', { ...img, slotId: 'category-yerel-haber-mid', districtSlug: 'biga' }))
    expect(colMap('adBanners').get('ad_1')).toMatchObject({ provinceSlug: 'canakkale', districtSlug: 'biga', status: 'approved' })
    expect((await createAd(req('/api/admin/ads', 't-prov', 'POST', { ...img, slotId: 'category-yerel-haber-mid', districtSlug: 'alanya' }))).status).toBe(403)
  })
})

describe('visibility and deletion are scoped', () => {
  it('scoped editors never see or delete national / other-district ads; global staff unchanged', async () => {
    await createAd(req('/api/admin/ads', 't-prov', 'POST', { ...img, slotId: 'category-yerel-haber-top', districtSlug: 'biga' }))
    const ezineList = (await (await listAds(req('/api/admin/ads', 't-ezine'))).json()).banners as Array<{ id: string }>
    expect(ezineList.map((b) => b.id)).toEqual([])
    const provList = (await (await listAds(req('/api/admin/ads', 't-prov'))).json()).banners as Array<{ id: string; canApprove: boolean }>
    expect(provList.map((b) => b.id)).toEqual(['ad_1'])
    expect(provList[0]!.canApprove).toBe(true)
    expect((await deleteAd(req('/x', 't-ezine', 'DELETE'), ctx('ad_1'))).status).toBe(403)
    expect((await deleteAd(req('/x', 't-prov', 'DELETE'), ctx('nat'))).status).toBe(403)
    const globalList = (await (await listAds(req('/api/admin/ads', 't-global'))).json()).banners as Array<{ id: string }>
    expect(globalList.map((b) => b.id).sort()).toEqual(['ad_1', 'nat'])
  })
})
