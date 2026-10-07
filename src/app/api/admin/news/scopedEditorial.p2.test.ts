/**
 * Phase 2B — scoped editorial endpoints (list / load / approve / reject) over an
 * in-memory Firestore fake. Local fixtures only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Doc = Record<string, unknown>
const db = new Map<string, Map<string, Doc>>()
const tokens = new Map<string, { uid: string; email?: string }>()
const colMap = (n: string) => { if (!db.has(n)) db.set(n, new Map()); return db.get(n)! }
const ref = (n: string, id: string) => ({
  id,
  async get() { const d = colMap(n).get(id); return { id, exists: Boolean(d), data: () => (d ? structuredClone(d) : undefined) } },
  async update(p: Doc) { colMap(n).set(id, { ...colMap(n).get(id)!, ...p }) },
  async set(p: Doc) { colMap(n).set(id, p) },
})
function query(n: string, f: Array<[string, string, unknown]>, lim = 1e9) {
  return {
    where: (k: string, op: string, v: unknown) => query(n, [...f, [k, op, v]], lim),
    orderBy: () => query(n, f, lim),
    startAfter: () => query(n, f, lim),
    limit: (x: number) => query(n, f, x),
    async get() {
      const docs = [...colMap(n).entries()]
        .filter(([, d]) => f.every(([k, op, v]) => (op === 'in' ? (v as unknown[]).includes(d[k]) : d[k] === v)))
        .slice(0, lim)
        .map(([id, d]) => ({ id, data: () => structuredClone(d) }))
      return { docs, size: docs.length, empty: docs.length === 0 }
    },
  }
}
const fake = { collection: (n: string) => ({ ...query(n, []), doc: (id: string) => ref(n, id) }) }

const { approveDraft, rejectDraft, approveLegacyPending } = vi.hoisted(() => ({
  approveDraft: vi.fn().mockResolvedValue({ newsId: 'pub_1', slug: 's' }),
  rejectDraft: vi.fn().mockResolvedValue(undefined),
  approveLegacyPending: vi.fn().mockResolvedValue({ newsId: 'n', slug: 's' }),
}))
vi.mock('@/lib/firebase/admin', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAdminFirestore: () => fake,
  getAdminAuth: () => ({
    verifyIdToken: async (t: string) => { const h = tokens.get(t); if (!h) throw new Error('bad'); return h },
  }),
}))
vi.mock('@/services/newsDraftService', () => ({
  newsDraftService: { approveDraft, rejectDraft, approveLegacyPending },
  allocateUniqueSlug: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('@/lib/revalidateHome', () => ({ revalidateHomeFeedCaches: vi.fn(), revalidatePublishedNews: vi.fn() }))
vi.mock('@/lib/indexNow', () => ({ notifyPublishedArticle: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/featuredPins', () => ({ demoteExcessFeaturedPins: vi.fn() }))
vi.mock('@/lib/social/publishOneSocial', () => ({ isCanakkaleArticle: () => false, isStoryEligible: () => false, publishOneSocial: vi.fn() }))
vi.mock('@/lib/ai/editorial/aiEditorService', () => ({ getAiEditorById: vi.fn().mockResolvedValue(null) }))

import { NextRequest } from 'next/server'
import { GET as listScoped } from './scoped/route'
import { GET as getOne, PUT as putOne } from './[id]/route'
import { POST as approveDraftRoute } from '../news-drafts/[id]/approve/route'
import { POST as rejectDraftRoute } from '../news-drafts/[id]/reject/route'
import { POST as approveNewsRoute } from './[id]/approve/route'
import { GET as meScope } from '../me/scope/route'

const now = 1_800_000_000_000
function seed() {
  db.clear(); tokens.clear(); approveDraft.mockClear(); rejectDraft.mockClear(); approveLegacyPending.mockClear()
  const user = (tok: string, uid: string, data: Doc) => { tokens.set(tok, { uid, email: `${uid}@example.test` }); colMap('users').set(uid, data) }
  user('t-prov', 'u-prov', { role: 'managing_editor', cmsScope: { provinceSlugs: ['canakkale'] } })
  user('t-ezine', 'u-ezine', { role: 'editor', cmsScope: { provinceSlugs: ['canakkale'], districtSlugs: ['ezine'] } })
  user('t-merkez-spor', 'u-ms', { role: 'editor', cmsScope: { provinceSlugs: ['canakkale'], districtSlugs: ['merkez'], categoryIds: ['spor'] } })
  user('t-global', 'u-global', { role: 'editor' })
  const news = colMap('news')
  news.set('n-ezine', { title: 'Ezine', citySlug: 'canakkale', districtSlug: 'ezine', categoryId: 'gundem', status: 'published', createdAt: now - 1 })
  news.set('n-biga', { title: 'Biga', citySlug: 'canakkale', districtSlug: 'biga', categoryId: 'gundem', status: 'published', createdAt: now - 2 })
  news.set('n-il', { title: 'İl geneli', citySlug: 'canakkale', districtSlug: '', categoryId: 'gundem', status: 'published', createdAt: now - 3 })
  news.set('n-merkez-spor', { title: 'Merkez spor', citySlug: 'canakkale', districtSlug: 'merkez', categoryId: 'spor', status: 'published', createdAt: now - 4 })
  news.set('n-merkez-eko', { title: 'Merkez eko', citySlug: 'canakkale', districtSlug: 'merkez', categoryId: 'ekonomi', status: 'published', createdAt: now - 5 })
  news.set('n-aksaray-merkez', { title: 'Aksaray merkez', citySlug: 'aksaray', districtSlug: 'merkez', categoryId: 'spor', status: 'published', createdAt: now - 6 })
  const drafts = colMap('newsDrafts')
  drafts.set('d-ezine', { title: 'Ezine taslak', citySlug: 'canakkale', districtSlug: 'ezine', categoryId: 'gundem', draftStatus: 'pending_review', createdAt: now })
  drafts.set('d-biga', { title: 'Biga taslak', citySlug: 'canakkale', districtSlug: 'biga', categoryId: 'gundem', draftStatus: 'pending_review', createdAt: now })
  drafts.set('d-ant', { title: 'Antalya taslak', citySlug: 'antalya', districtSlug: 'alanya', categoryId: 'gundem', draftStatus: 'pending_review', createdAt: now })
}
const req = (url: string, tok: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const ids = async (res: Response) => ((await res.json()).items as Array<{ id: string }>).map((i) => i.id).sort()

beforeEach(() => { seed(); vi.stubEnv('SUPER_ADMIN_EMAIL', 'root@example.test'); vi.stubEnv('ADMIN_BOOTSTRAP_UIDS', ''); vi.stubEnv('NEXT_PUBLIC_ADMIN_UIDS', '') })
afterEach(() => vi.unstubAllEnvs())

describe('GET /api/admin/news/scoped', () => {
  it('ilçe editörü sees only its district (no district-less, no other district, no other province)', async () => {
    expect(await ids(await listScoped(req('/api/admin/news/scoped?view=published', 't-ezine')))).toEqual(['n-ezine'])
    expect(await ids(await listScoped(req('/api/admin/news/scoped?view=pending', 't-ezine')))).toEqual(['d-ezine'])
  })
  it('ilçe kategori editörü: province AND district AND category', async () => {
    expect(await ids(await listScoped(req('/api/admin/news/scoped?view=all', 't-merkez-spor')))).toEqual(['n-merkez-spor'])
  })
  it('il genel editörü sees the whole province incl. district-less news, never other provinces', async () => {
    expect(await ids(await listScoped(req('/api/admin/news/scoped?view=published', 't-prov')))).toEqual(
      ['n-biga', 'n-ezine', 'n-il', 'n-merkez-eko', 'n-merkez-spor']
    )
    expect(await ids(await listScoped(req('/api/admin/news/scoped?view=pending', 't-prov')))).toEqual(['d-biga', 'd-ezine'])
  })
  it('unscoped staff keep the client list (400 here)', async () => {
    expect((await listScoped(req('/api/admin/news/scoped', 't-global'))).status).toBe(400)
  })
})

describe('GET /api/admin/news/[id]', () => {
  it('loads in-scope news and drafts, 403 outside', async () => {
    expect((await getOne(req('/x', 't-ezine'), ctx('d-ezine'))).status).toBe(200)
    expect((await getOne(req('/x', 't-ezine'), ctx('n-ezine'))).status).toBe(200)
    expect((await getOne(req('/x', 't-ezine'), ctx('d-biga'))).status).toBe(403)
    expect((await getOne(req('/x', 't-ezine'), ctx('n-il'))).status).toBe(403)
    expect((await getOne(req('/x', 't-merkez-spor'), ctx('n-aksaray-merkez'))).status).toBe(403)
  })
})

describe('approve / reject are scope-checked', () => {
  it('ilçe editörü approves its own district draft only', async () => {
    expect((await approveDraftRoute(req('/x', 't-ezine', 'POST'), ctx('d-ezine'))).status).toBe(200)
    expect(approveDraft).toHaveBeenCalledWith('d-ezine', { uid: 'u-ezine' })
    expect((await approveDraftRoute(req('/x', 't-ezine', 'POST'), ctx('d-biga'))).status).toBe(403)
    expect((await approveDraftRoute(req('/x', 't-ezine', 'POST'), ctx('d-ant'))).status).toBe(403)
    expect(approveDraft).toHaveBeenCalledTimes(1)
  })
  it('reject + legacy approve follow the same boundary', async () => {
    expect((await rejectDraftRoute(req('/x', 't-ezine', 'POST', {}), ctx('d-biga'))).status).toBe(403)
    expect((await rejectDraftRoute(req('/x', 't-ezine', 'POST', {}), ctx('d-ezine'))).status).toBe(200)
    expect((await approveNewsRoute(req('/x', 't-ezine', 'POST'), ctx('n-biga'))).status).toBe(403)
    expect(rejectDraft).toHaveBeenCalledTimes(1)
    expect(approveLegacyPending).not.toHaveBeenCalled()
  })
  it('global editors keep approving anywhere (unchanged)', async () => {
    expect((await approveDraftRoute(req('/x', 't-global', 'POST'), ctx('d-ant'))).status).toBe(200)
  })
})

describe('PUT guards for scoped editors', () => {
  it('cannot move a story out of the district or post under an AI persona', async () => {
    expect((await putOne(req('/x', 't-ezine', 'PUT', { districtSlug: 'biga' }), ctx('n-ezine'))).status).toBe(403)
    expect((await putOne(req('/x', 't-ezine', 'PUT', { aiEditorId: 'ai-1' }), ctx('n-ezine'))).status).toBe(403)
  })
})

describe('GET /api/admin/me/scope', () => {
  it('reports tier and staff-management right', async () => {
    expect(await (await meScope(req('/x', 't-prov'))).json()).toMatchObject({ scoped: true, tier: 'province_general', provinceSlug: 'canakkale', canManageStaff: true })
    expect(await (await meScope(req('/x', 't-ezine'))).json()).toMatchObject({ tier: 'district_general', districtSlug: 'ezine', canManageStaff: false })
    expect(await (await meScope(req('/x', 't-global'))).json()).toMatchObject({ scoped: false, canManageStaff: false })
  })
})
