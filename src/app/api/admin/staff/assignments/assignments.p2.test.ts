/**
 * Phase 2 — staff hierarchy assignment API over an in-memory Firestore fake.
 * Local fixtures only; no network, no production data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldValue } from 'firebase-admin/firestore'

type Doc = Record<string, unknown>
const db = new Map<string, Map<string, Doc>>()
const tokens = new Map<string, { uid: string; email?: string }>()
const authEmails = new Map<string, string>()
const colMap = (n: string) => { if (!db.has(n)) db.set(n, new Map()); return db.get(n)! }
function applyPatch(prev: Doc, patch: Doc): Doc {
  const next: Doc = { ...prev }
  for (const [k, v] of Object.entries(patch)) {
    if (v instanceof FieldValue && FieldValue.delete().isEqual(v)) delete next[k]
    else next[k] = v
  }
  return next
}
let autoId = 0
const ref = (n: string, id: string) => ({
  id, _c: n,
  async get() { const d = colMap(n).get(id); return { id, exists: Boolean(d), data: () => (d ? structuredClone(d) : undefined) } },
})
const getPath = (d: Doc, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Doc)[k] : undefined), d)
function query(n: string, filters: Array<[string, string, unknown]>) {
  return {
    where: (f: string, op: string, v: unknown) => query(n, [...filters, [f, op, v]]),
    limit: () => query(n, filters),
    async get() {
      const docs = [...colMap(n).entries()]
        .filter(([, d]) => filters.every(([f, op, v]) => {
          const val = getPath(d, f)
          return op === 'array-contains' ? Array.isArray(val) && val.includes(v) : val === v
        }))
        .map(([id, d]) => ({ id, data: () => structuredClone(d) }))
      return { docs, size: docs.length }
    },
  }
}
const fake = {
  collection: (n: string) => ({ ...query(n, []), doc: (id?: string) => ref(n, id ?? `auto_${++autoId}`) }),
  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const writes: Array<() => void> = []
    const tx = {
      get: (r: ReturnType<typeof ref>) => r.get(),
      update: (r: ReturnType<typeof ref>, p: Doc) => writes.push(() => colMap(r._c).set(r.id, applyPatch(colMap(r._c).get(r.id)!, p))),
      set: (r: ReturnType<typeof ref>, d: Doc) => writes.push(() => colMap(r._c).set(r.id, d)),
    }
    const out = await fn(tx)
    writes.forEach((w) => w())
    return out
  },
}

vi.mock('@/lib/firebase/admin', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAdminFirestore: () => fake,
  getAdminAuth: () => ({
    verifyIdToken: async (t: string) => { const h = tokens.get(t); if (!h) throw new Error('bad'); return h },
    getUser: async (uid: string) => ({ uid, email: authEmails.get(uid) }),
  }),
}))

import { NextRequest } from 'next/server'
import { GET, POST } from './route'

const SUPER = 'root@example.test'
function seed() {
  db.clear(); tokens.clear(); authEmails.clear()
  const add = (tok: string, uid: string, email: string, data: Doc) => {
    tokens.set(tok, { uid, email }); authEmails.set(uid, email); colMap('users').set(uid, data)
  }
  add('t-super', 'u-super', SUPER, { role: 'super_admin' })
  add('t-cnk', 'u-cnk', 'cnk@example.test', { role: 'managing_editor', cmsScope: { provinceSlugs: ['canakkale'] } })
  add('t-ant', 'u-ant', 'ant@example.test', { role: 'managing_editor', cmsScope: { provinceSlugs: ['antalya'] } })
  add('t-ezine', 'u-ezine', 'ez@example.test', { role: 'editor', cmsScope: { provinceSlugs: ['canakkale'], districtSlugs: ['ezine'] } })
  add('t-global', 'u-global', 'g@example.test', { role: 'editor' })
  add('t-reader', 'u-reader', 'r@example.test', { role: 'user', username: 'okur' })
  add('t-reader2', 'u-reader2', 'r2@example.test', { role: 'user' })
}
const post = (tok: string, body: unknown) =>
  POST(new NextRequest('http://localhost/api/admin/staff/assignments', {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }))
const get = (tok: string, province: string) =>
  GET(new NextRequest(`http://localhost/api/admin/staff/assignments?province=${province}`, { headers: { Authorization: `Bearer ${tok}` } }))
const user = (uid: string) => colMap('users').get(uid)!
const audit = () => [...colMap('staffScopeAudit').values()]

beforeEach(() => {
  seed()
  vi.stubEnv('SUPER_ADMIN_EMAIL', SUPER)
  vi.stubEnv('ADMIN_BOOTSTRAP_UIDS', '')
  vi.stubEnv('NEXT_PUBLIC_ADMIN_UIDS', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('POST assign', () => {
  it('super admin appoints the Çanakkale il genel editörü (role + scope together, audited)', async () => {
    const res = await post('t-super', { action: 'assign', targetUid: 'u-reader', tier: 'province_general', provinceSlug: 'canakkale' })
    expect(res.status).toBe(200)
    expect(user('u-reader')).toMatchObject({ role: 'managing_editor', cmsScope: { provinceSlugs: ['canakkale'] }, cmsScopeUpdatedBy: 'u-super' })
    expect(audit()).toHaveLength(1)
    expect(audit()[0]).toMatchObject({ action: 'assign', actorUid: 'u-super', targetUid: 'u-reader', before: { role: 'user', cmsScope: null } })
  })

  it('il genel editörü appoints a Merkez spor editor in its own province', async () => {
    const res = await post('t-cnk', { action: 'assign', targetUid: 'u-reader', tier: 'district_category', provinceSlug: 'canakkale', districtSlug: 'merkez', categoryId: 'spor' })
    expect(res.status).toBe(200)
    expect(user('u-reader')).toMatchObject({ role: 'editor', cmsScope: { provinceSlugs: ['canakkale'], districtSlugs: ['merkez'], categoryIds: ['spor'] } })
  })

  it('il genel editörü cannot appoint province editors, other provinces, global staff or itself', async () => {
    expect((await post('t-cnk', { action: 'assign', targetUid: 'u-reader', tier: 'province_general', provinceSlug: 'canakkale' })).status).toBe(403)
    expect((await post('t-ant', { action: 'assign', targetUid: 'u-reader', tier: 'district_general', provinceSlug: 'canakkale', districtSlug: 'ezine' })).status).toBe(403)
    expect((await post('t-cnk', { action: 'assign', targetUid: 'u-global', tier: 'district_general', provinceSlug: 'canakkale', districtSlug: 'ezine' })).status).toBe(403)
    expect((await post('t-cnk', { action: 'assign', targetUid: 'u-super', tier: 'district_general', provinceSlug: 'canakkale', districtSlug: 'ezine' })).status).toBe(403)
    expect((await post('t-cnk', { action: 'assign', targetUid: 'u-cnk', tier: 'district_general', provinceSlug: 'canakkale', districtSlug: 'ezine' })).status).toBe(403)
    expect(user('u-global')).toEqual({ role: 'editor' })
    expect(audit()).toHaveLength(0)
  })

  it('inactive provinces and wrong districts are rejected even for super admin', async () => {
    expect((await post('t-super', { action: 'assign', targetUid: 'u-reader', tier: 'province_general', provinceSlug: 'antalya' })).status).toBe(400)
    expect((await post('t-super', { action: 'assign', targetUid: 'u-reader', tier: 'district_general', provinceSlug: 'canakkale', districtSlug: 'alanya' })).status).toBe(400)
    expect(user('u-reader')).toEqual({ role: 'user', username: 'okur' })
  })

  it('district editors, global editors and normal users cannot assign', async () => {
    const body = { action: 'assign', targetUid: 'u-reader2', tier: 'district_general', provinceSlug: 'canakkale', districtSlug: 'biga' }
    expect((await post('t-ezine', body)).status).toBe(403)
    expect((await post('t-global', body)).status).toBe(403)
    expect((await post('t-reader', body)).status).toBe(401)
    expect(user('u-reader2')).toEqual({ role: 'user' })
  })

  it('exact UID: a case-variant uid does not resolve to the user', async () => {
    const res = await post('t-super', { action: 'assign', targetUid: 'U-READER', tier: 'province_general', provinceSlug: 'canakkale' })
    expect(res.status).toBe(404)
  })
})

describe('POST revoke', () => {
  it('il genel editörü removes its district editor (back to plain user, scope deleted)', async () => {
    const res = await post('t-cnk', { action: 'revoke', targetUid: 'u-ezine' })
    expect(res.status).toBe(200)
    expect(user('u-ezine')).toMatchObject({ role: 'user' })
    expect(user('u-ezine').cmsScope).toBeUndefined()
  })
  it('il genel editörü cannot remove another province editor; super admin can', async () => {
    expect((await post('t-cnk', { action: 'revoke', targetUid: 'u-ant' })).status).toBe(403)
    expect((await post('t-super', { action: 'revoke', targetUid: 'u-ant' })).status).toBe(200)
  })
})

describe('GET staff list', () => {
  it('lists the province staff for super admin and the il genel editörü only', async () => {
    const res = await get('t-cnk', 'canakkale')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.staff.map((s: { uid: string }) => s.uid).sort()).toEqual(['u-cnk', 'u-ezine'])
    expect(body.staff.find((s: { uid: string }) => s.uid === 'u-ezine')).toMatchObject({ tier: 'district_general', districtSlug: 'ezine' })
    expect((await get('t-super', 'canakkale')).status).toBe(200)
    expect((await get('t-ant', 'canakkale')).status).toBe(403)
    expect((await get('t-ezine', 'canakkale')).status).toBe(403)
  })
})

describe('POST set_sections (Phase 2D)', () => {
  it('il genel editörü gives a reader several areas with rights one by one', async () => {
    const res = await post('t-cnk', {
      action: 'set_sections', targetUid: 'u-reader', provinceSlug: 'canakkale',
      sections: [
        { districtSlug: 'ezine', categoryId: null, rights: ['edit'] },
        { districtSlug: 'biga', categoryId: 'spor', rights: [] },
      ],
    })
    expect(res.status).toBe(200)
    expect(user('u-reader')).toMatchObject({
      role: 'editor',
      cmsScope: { provinceSlugs: ['canakkale'], sections: [
        { districtSlug: 'ezine', categoryId: null, rights: ['edit'] },
        { districtSlug: 'biga', categoryId: 'spor', rights: [] },
      ] },
    })
    const list = await (await get('t-cnk', 'canakkale')).json()
    expect(list.staff.find((s: { uid: string }) => s.uid === 'u-reader')).toMatchObject({ tier: 'section_editor' })
  })
  it('district editors / other provinces cannot set sections; bad rights rejected', async () => {
    const body = { action: 'set_sections', targetUid: 'u-reader2', provinceSlug: 'canakkale', sections: [{ districtSlug: 'biga', rights: ['edit'] }] }
    expect((await post('t-ezine', body)).status).toBe(403)
    expect((await post('t-ant', body)).status).toBe(403)
    expect((await post('t-cnk', { ...body, sections: [{ districtSlug: 'biga', rights: ['root'] }] })).status).toBe(400)
    expect(user('u-reader2')).toEqual({ role: 'user' })
  })
})

