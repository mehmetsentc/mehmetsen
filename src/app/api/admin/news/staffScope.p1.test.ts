/**
 * Phase 1 — Çanakkale pilot: server-side staff scope enforcement.
 * Real verifyCmsToken + real routes over an in-memory Firestore fake.
 * No network, no production data, no analytics writes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldValue } from 'firebase-admin/firestore'

type Doc = Record<string, unknown>
const db = new Map<string, Map<string, Doc>>()
const tokens = new Map<string, { uid: string; email?: string }>()

function colMap(name: string) {
  if (!db.has(name)) db.set(name, new Map())
  return db.get(name)!
}
function applyPatch(prev: Doc, patch: Doc): Doc {
  const next: Doc = { ...prev }
  for (const [k, v] of Object.entries(patch)) {
    if (v instanceof FieldValue && FieldValue.delete().isEqual(v)) delete next[k]
    else if (v instanceof FieldValue) next[k] = Date.now()
    else next[k] = v
  }
  return next
}
let autoId = 0
function docRef(name: string, id: string) {
  return {
    id,
    async get() {
      const d = colMap(name).get(id)
      return { id, exists: Boolean(d), data: () => (d ? structuredClone(d) : undefined) }
    },
    async set(data: Doc) { colMap(name).set(id, applyPatch({}, data)) },
    async update(patch: Doc) {
      const prev = colMap(name).get(id)
      if (!prev) throw new Error(`NOT_FOUND ${name}/${id}`)
      colMap(name).set(id, applyPatch(prev, patch))
    },
    async delete() { colMap(name).delete(id) },
    collection: (sub: string) => collection(`${name}/${id}/${sub}`),
  }
}
function query(name: string, filters: Array<[string, unknown]>, lim = 1000) {
  return {
    where: (f: string, _op: string, v: unknown) => query(name, [...filters, [f, v]], lim),
    orderBy: () => query(name, filters, lim),
    limit: (n: number) => query(name, filters, n),
    async get() {
      const docs = [...colMap(name).entries()]
        .filter(([, d]) => filters.every(([f, v]) => d[f] === v))
        .slice(0, lim)
        .map(([id, d]) => ({ id, exists: true, data: () => structuredClone(d) }))
      return { empty: docs.length === 0, size: docs.length, docs }
    },
  }
}
function collection(name: string) {
  return {
    ...query(name, []),
    doc: (id?: string) => docRef(name, id ?? `auto_${++autoId}`),
    add: async (data: Doc) => { const r = docRef(name, `auto_${++autoId}`); await r.set(data); return r },
  }
}
const fakeFirestore = { collection, batch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }) }

vi.mock('@/lib/firebase/admin', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAdminFirestore: () => fakeFirestore,
  getAdminAuth: () => ({
    verifyIdToken: async (t: string) => {
      const hit = tokens.get(t)
      if (!hit) throw new Error('bad token')
      return { uid: hit.uid, email: hit.email }
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('@/lib/revalidateHome', () => ({ revalidateHomeFeedCaches: vi.fn(), revalidatePublishedNews: vi.fn() }))
vi.mock('@/lib/indexNow', () => ({ notifyPublishedArticle: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/featuredPins', () => ({ demoteExcessFeaturedPins: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/social/publishOneSocial', () => ({
  isCanakkaleArticle: () => false,
  isStoryEligible: () => false,
  publishOneSocial: vi.fn(),
}))
vi.mock('@/services/newsDraftService', () => ({
  newsDraftService: { approveDraft: vi.fn().mockResolvedValue({ newsId: 'approved_1' }) },
  allocateUniqueSlug: vi.fn().mockResolvedValue('slug-x'),
}))
vi.mock('@/lib/ai/editorial/aiEditorService', () => ({ getAiEditorById: vi.fn().mockResolvedValue(null) }))
vi.mock('@/services/crawler/editorial/newsLink', () => ({ syncCrawlerEditorial: vi.fn().mockResolvedValue(undefined) }))

import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { POST as createNews } from './route'
import { PUT as updateNews, DELETE as deleteNews } from './[id]/route'
import { GET as getCityOps, PUT as putCityOps } from '../city-ops/route'
import { NextRequest } from 'next/server'

const SUPER_EMAIL = 'root-admin@example.test'

function seed() {
  db.clear()
  tokens.clear()
  tokens.set('t-super', { uid: 'u-super', email: SUPER_EMAIL })
  tokens.set('t-legacy', { uid: 'u-legacy', email: 'legacy@example.test' })
  tokens.set('t-city', { uid: 'u-City-1', email: 'city@example.test' })
  tokens.set('t-city-case', { uid: 'u-city-1', email: 'city-case@example.test' })
  tokens.set('t-sports', { uid: 'u-sports', email: 'sports@example.test' })
  tokens.set('t-empty', { uid: 'u-empty', email: 'empty@example.test' })
  tokens.set('t-bad', { uid: 'u-bad', email: 'bad@example.test' })
  tokens.set('t-boot', { uid: 'u-boot', email: 'boot@example.test' })
  const users = colMap('users')
  users.set('u-super', { role: 'super_admin', cmsScope: { provinceSlugs: ['canakkale'] } })
  users.set('u-legacy', { role: 'managing_editor' })
  users.set('u-City-1', { role: 'managing_editor', cmsScope: { provinceSlugs: ['canakkale'], categoryIds: [] } })
  users.set('u-sports', { role: 'editor', cmsScope: { provinceSlugs: ['canakkale'], categoryIds: ['spor'] } })
  users.set('u-empty', { role: 'editor', cmsScope: {} })
  users.set('u-bad', { role: 'editor', cmsScope: { provinceSlugs: ['not-a-province'] } })
  users.set('u-boot', { role: 'user', cmsScope: { provinceSlugs: ['canakkale'] } })
  const news = colMap('news')
  news.set('n-cnk-spor', { title: 'Çanakkale spor', citySlug: 'canakkale', categoryId: 'spor', status: 'draft', slug: 'cnk-spor' })
  news.set('n-cnk-eko', { title: 'Çanakkale ekonomi', citySlug: 'canakkale', categoryId: 'ekonomi', status: 'draft', slug: 'cnk-eko' })
  news.set('n-ant-spor', { title: 'Antalya spor', citySlug: 'antalya', categoryId: 'spor', status: 'draft', slug: 'ant-spor' })
  news.set('n-national', { title: 'Ulusal', citySlug: '', categoryId: 'gundem', status: 'draft', slug: 'ulusal' })
  colMap('newsDrafts').set('d-ant-spor', { title: 'Antalya taslak', citySlug: 'antalya', categoryId: 'spor' })
  colMap('newsDrafts').set('d-cnk-spor', { title: 'Çanakkale taslak', citySlug: 'canakkale', categoryId: 'spor' })
  colMap('posts').set('p-legacy', { title: 'legacy post' })
}

const snapshot = () => JSON.stringify([...db.entries()].map(([k, m]) => [k, [...m.entries()]]))
const req = (url: string, token: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const put = (id: string, token: string, body: unknown) => updateNews(req(`/api/admin/news/${id}`, token, 'PUT', body), ctx(id))
const del = (id: string, token: string, q = '') => deleteNews(req(`/api/admin/news/${id}${q}`, token, 'DELETE'), ctx(id))
const create = (token: string, body: unknown) => createNews(req('/api/admin/news', token, 'POST', body))

describe('Phase 1 — verifyCmsToken scope resolution', () => {
  beforeEach(() => {
    seed()
    vi.stubEnv('SUPER_ADMIN_EMAIL', SUPER_EMAIL)
    vi.stubEnv('ADMIN_BOOTSTRAP_UIDS', 'u-boot')
    vi.stubEnv('NEXT_PUBLIC_ADMIN_UIDS', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('super admin is never scoped (even if a stray cmsScope exists)', async () => {
    const a = await verifyCmsToken(req('/x', 't-super'), 'news:edit')
    expect(a).toMatchObject({ uid: 'u-super', role: 'super_admin', scope: { kind: 'unscoped' } })
  })

  it('bootstrap admin UIDs stay global managing_editor', async () => {
    const a = await verifyCmsToken(req('/x', 't-boot'), 'news:edit')
    expect(a).toMatchObject({ uid: 'u-boot', role: 'managing_editor', scope: { kind: 'unscoped' } })
  })

  it('legacy unscoped staff keep current behavior on every route', async () => {
    const a = await verifyCmsToken(req('/x', 't-legacy'), 'news:edit')
    expect(a).toMatchObject({ role: 'managing_editor', scope: { kind: 'unscoped' } })
    expect(await verifyCmsToken(req('/x', 't-legacy'), 'cron:trigger')).not.toBeNull()
  })

  it('scoped staff are DENIED on routes that did not opt into scope enforcement (fail-closed)', async () => {
    expect(await verifyCmsToken(req('/x', 't-city'), 'news:edit')).toBeNull()
    expect(await verifyCmsToken(req('/x', 't-city'), 'cron:trigger')).toBeNull()
    expect(await verifyCmsToken(req('/x', 't-sports'), 'news:edit')).toBeNull()
  })

  it('scope-aware routes receive the parsed scope', async () => {
    const a = await verifyCmsToken(req('/x', 't-sports'), 'news:edit', { scopeAware: true })
    expect(a?.scope).toEqual({ kind: 'scoped', scope: { provinceSlugs: ['canakkale'], categoryIds: ['spor'] } })
  })

  it('role permission is still enforced before scope', async () => {
    expect(await verifyCmsToken(req('/x', 't-sports'), 'locations:manage', { scopeAware: true })).toBeNull()
  })

  it('Firebase UID is matched exactly (case-variant uid gets no staff identity)', async () => {
    expect(await verifyCmsToken(req('/x', 't-city-case'), 'news:edit', { scopeAware: true })).toBeNull()
    expect(await verifyCmsToken(req('/x', 't-city'), 'news:edit', { scopeAware: true })).toMatchObject({ uid: 'u-City-1' })
  })

  it('Bearer is still required (no token / non-Bearer → null)', async () => {
    const noAuth = new Request('http://localhost/x')
    expect(await verifyCmsToken(noAuth, 'news:edit', { scopeAware: true })).toBeNull()
    const basic = new Request('http://localhost/x', { headers: { Authorization: 'Basic t-legacy' } })
    expect(await verifyCmsToken(basic, 'news:edit')).toBeNull()
  })
})

describe('Phase 1 — admin news routes enforce scope server-side', () => {
  beforeEach(() => {
    seed()
    vi.stubEnv('SUPER_ADMIN_EMAIL', SUPER_EMAIL)
    vi.stubEnv('ADMIN_BOOTSTRAP_UIDS', 'u-boot')
    vi.stubEnv('NEXT_PUBLIC_ADMIN_UIDS', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('SUPER ADMIN: Çanakkale + Antalya, no category limit', async () => {
    expect((await put('n-cnk-spor', 't-super', { title: 'a' })).status).toBe(200)
    expect((await put('n-ant-spor', 't-super', { title: 'b' })).status).toBe(200)
    expect((await put('n-national', 't-super', { title: 'c' })).status).toBe(200)
    expect(colMap('news').get('n-ant-spor')?.title).toBe('b')
  })

  it('LEGACY UNSCOPED staff: current behavior preserved', async () => {
    expect((await put('n-ant-spor', 't-legacy', { title: 'x' })).status).toBe(200)
    expect((await put('n-cnk-eko', 't-legacy', { title: 'y' })).status).toBe(200)
    expect((await del('n-national', 't-legacy')).status).toBe(200)
  })

  it('ÇANAKKALE CITY MANAGER: Çanakkale PASS, Antalya DENY', async () => {
    expect((await put('n-cnk-eko', 't-city', { title: 'ok' })).status).toBe(200)
    expect((await put('n-cnk-spor', 't-city', { title: 'ok2' })).status).toBe(200)
    const before = snapshot()
    expect((await put('n-ant-spor', 't-city', { title: 'hack' })).status).toBe(403)
    expect((await put('n-national', 't-city', { title: 'hack' })).status).toBe(403)
    expect((await del('n-ant-spor', 't-city')).status).toBe(403)
    expect((await del('d-ant-spor', 't-city')).status).toBe(403)
    expect(snapshot()).toBe(before)
  })

  it('ÇANAKKALE SPORTS MANAGER: Çanakkale+spor PASS, Çanakkale+ekonomi DENY, Antalya+spor DENY', async () => {
    expect((await put('n-cnk-spor', 't-sports', { title: 'gol' })).status).toBe(200)
    const before = snapshot()
    expect((await put('n-cnk-eko', 't-sports', { title: 'x' })).status).toBe(403)
    expect((await put('n-ant-spor', 't-sports', { title: 'x' })).status).toBe(403)
    expect((await del('n-cnk-eko', 't-sports')).status).toBe(403)
    expect(snapshot()).toBe(before)
  })

  it('create: canonical target must be in scope', async () => {
    const ok = await create('t-sports', { title: 'Çanakkale maçı', citySlug: 'canakkale', categoryId: 'spor', status: 'pending' })
    expect(ok.status).toBe(200)
    const before = snapshot()
    expect((await create('t-sports', { title: 'x', citySlug: 'canakkale', categoryId: 'ekonomi', status: 'pending' })).status).toBe(403)
    expect((await create('t-sports', { title: 'x', citySlug: 'antalya', categoryId: 'spor', status: 'pending' })).status).toBe(403)
    expect((await create('t-city', { title: 'x', categoryId: 'gundem', status: 'pending' })).status).toBe(403)
    expect(snapshot()).toBe(before)
  })

  describe('MALICIOUS requests', () => {
    it('body cannot relabel an out-of-scope article into scope (before-state check)', async () => {
      const before = snapshot()
      const r = await put('n-ant-spor', 't-sports', { title: 'x', citySlug: 'canakkale', city: 'Çanakkale', categoryId: 'spor' })
      expect(r.status).toBe(403)
      expect(snapshot()).toBe(before)
    })

    it('body cannot move an in-scope article out of scope (after-state check)', async () => {
      const before = snapshot()
      expect((await put('n-cnk-spor', 't-sports', { categoryId: 'ekonomi' })).status).toBe(403)
      expect((await put('n-cnk-spor', 't-city', { citySlug: 'antalya', city: 'Antalya' })).status).toBe(403)
      expect(snapshot()).toBe(before)
    })

    it('draftId cannot overwrite an out-of-scope existing article', async () => {
      const before = snapshot()
      const r = await create('t-sports', { title: 'x', draftId: 'n-ant-spor', citySlug: 'canakkale', categoryId: 'spor', status: 'pending' })
      expect(r.status).toBe(403)
      expect(snapshot()).toBe(before)
    })

    it('draft collection is scope-checked before and after', async () => {
      const before = snapshot()
      expect((await put('d-ant-spor', 't-sports', { title: 'x' })).status).toBe(403)
      expect((await put('d-cnk-spor', 't-sports', { categoryId: 'ekonomi' })).status).toBe(403)
      expect(snapshot()).toBe(before)
      expect((await put('d-cnk-spor', 't-sports', { title: 'ok' })).status).toBe(200)
    })

    it('query string cannot unlock hard delete; legacy posts are off-limits; national pin is off-limits', async () => {
      const before = snapshot()
      expect((await del('n-cnk-spor', 't-sports', '?permanent=true')).status).toBe(403)
      expect((await put('p-legacy', 't-city', { title: 'x' })).status).toBe(403)
      expect((await put('n-cnk-spor', 't-sports', { featured: true })).status).toBe(403)
      expect((await create('t-city', { title: 'x', citySlug: 'canakkale', featured: true })).status).toBe(403)
      expect(snapshot()).toBe(before)
    })

    it('in-scope soft delete (archive) is allowed', async () => {
      expect((await del('n-cnk-spor', 't-sports')).status).toBe(200)
      expect(colMap('news').get('n-cnk-spor')?.status).toBe('archived')
    })
  })

  describe('EMPTY / MALFORMED scope → deny all scope-checked operations', () => {
    it('explicit empty scope {} is not global', async () => {
      const before = snapshot()
      expect((await put('n-cnk-spor', 't-empty', { title: 'x' })).status).toBe(403)
      expect((await put('n-ant-spor', 't-empty', { title: 'x' })).status).toBe(403)
      expect(snapshot()).toBe(before)
    })

    it('unknown province slug → deny', async () => {
      expect((await put('n-cnk-spor', 't-bad', { title: 'x' })).status).toBe(403)
      expect(await verifyCmsToken(req('/x', 't-bad'), 'news:edit')).toBeNull()
    })
  })
})

describe('Phase 1 — city settings (cityOpsSettings) province scope', () => {
  beforeEach(() => {
    seed()
    vi.stubEnv('SUPER_ADMIN_EMAIL', SUPER_EMAIL)
    vi.stubEnv('ADMIN_BOOTSTRAP_UIDS', '')
    vi.stubEnv('NEXT_PUBLIC_ADMIN_UIDS', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  const cityPut = (token: string, body: unknown) => putCityOps(req('/api/admin/city-ops', token, 'PUT', body))
  const cityGet = (token: string, q = '') => getCityOps(req(`/api/admin/city-ops${q}`, token))

  it('city manager can manage Çanakkale only', async () => {
    expect((await cityPut('t-city', { citySlug: 'canakkale', patch: { feedEnabled: true } })).status).toBe(200)
    expect((await cityGet('t-city', '?city=canakkale')).status).toBe(200)
    const before = snapshot()
    expect((await cityPut('t-city', { citySlug: 'antalya', patch: { feedEnabled: false } })).status).toBe(403)
    expect((await cityGet('t-city', '?city=antalya')).status).toBe(403)
    expect((await cityPut('t-city', { citySlug: 'Canakkale', patch: {} })).status).toBe(400)
    expect(snapshot()).toBe(before)
  })

  it('list is filtered to the manager province', async () => {
    await cityPut('t-legacy', { citySlug: 'antalya', patch: {} })
    await cityPut('t-legacy', { citySlug: 'canakkale', patch: {} })
    const res = await cityGet('t-city')
    const body = (await res.json()) as { settings: Array<{ citySlug: string }> }
    expect(body.settings.map((s) => s.citySlug)).toEqual(['canakkale'])
    const all = (await (await cityGet('t-legacy')).json()) as { settings: Array<{ citySlug: string }> }
    expect(all.settings.map((s) => s.citySlug).sort()).toEqual(['antalya', 'canakkale'])
  })

  it('category managers cannot manage city settings (role lacks locations:manage anyway)', async () => {
    expect((await cityPut('t-sports', { citySlug: 'canakkale', patch: {} })).status).toBe(401)
  })

  it('super admin manages any city', async () => {
    expect((await cityPut('t-super', { citySlug: 'antalya', patch: {} })).status).toBe(200)
  })
})
