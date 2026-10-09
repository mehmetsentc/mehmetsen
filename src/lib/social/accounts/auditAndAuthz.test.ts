/** Denetim kaydı temizliği, token GET/POST yanıtları ve hesap yönetimi yetkisi. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from './testing/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as unknown, auth: null as unknown, users: {} as Record<string, { email?: string; disabled?: boolean }> }))
vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => h.db,
  getAdminAuth: () => ({
    getUser: async (uid: string) => {
      const u = h.users[uid]
      if (!u) throw new Error('auth/user-not-found')
      return { uid, email: u.email ?? '', disabled: !!u.disabled }
    },
  }),
}))
vi.mock('@/lib/cmsSecrets.server', () => ({
  isSuperAdminEmailServer: (e: string) => e === 'root@example.com',
  getBootstrapAdminUids: () => [],
}))
const verifyMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/cmsAuthServer', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return { ...real, verifyCmsToken: verifyMock }
})

import { redactSecrets, buildSocialAuditRecord, REDACTED } from './audit'
import { canManageSocialAccounts, recheckSocialAccountManager } from './authz'
import { UNSCOPED_STAFF } from '@/lib/cms/rbacScope'
import { ROLE_PERMISSIONS, type CmsRole } from '@/types/cms'
import type { CmsAuthContext } from '@/lib/cmsAuthServer'

let fs: FakeFirestore
beforeEach(() => {
  fs = new FakeFirestore()
  h.db = fs
  h.users = {}
  verifyMock.mockReset()
})

describe('denetim kaydı — sır sızmaz', () => {
  it('token/secret/code/state/URL parametreleri ve opak değerler temizlenir', () => {
    const out = JSON.stringify(
      redactSecrets({
        accessToken: 'EAAGabcdefghijklmnopqrstuv',
        appSecret: 'shh',
        code: 'AQB-oauth-code',
        state: 'xyz',
        oauthUrl: 'https://www.facebook.com/v21.0/dialog/oauth?client_id=1&state=abc',
        note: 'see https://graph.facebook.com/me?access_token=EAAGzzzzzzzzzzzzzzzzzzzzz&x=1',
        nested: [{ refresh_token: 'r' }, 'IGQWRPabcdefghijklmnopqrstuvwxyz0123'],
        hasFacebookPageToken: true,
        displayName: 'Antalya Haber',
      }),
    )
    for (const leak of ['EAAGabcdef', 'shh', 'AQB-oauth-code', 'xyz', 'client_id=1', 'EAAGzzzz', 'IGQWRP', '"r"']) {
      expect(out).not.toContain(leak)
    }
    expect(out).toContain('"hasFacebookPageToken":true')
    expect(out).toContain('Antalya Haber')
    expect(out).toContain(REDACTED)
  })

  it('kayıt mevcut cmsAuditLogs biçimini izler', () => {
    const r = buildSocialAuditRecord({ actorId: 'u1', action: 'social.account.status', entityType: 'socialAccount', entityId: 'facebook_1', after: { status: 'paused' } }, 5)
    expect(r).toMatchObject({ actorType: 'HUMAN', actorId: 'u1', action: 'social.account.status', entityId: 'facebook_1', after: { status: 'paused' }, createdAt: 5 })
  })
})

describe('/api/admin/social/token', () => {
  const req = (method: string, body?: unknown) =>
    new Request('http://localhost/api/admin/social/token', {
      method,
      headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })

  it('GET token veya parçasını döndürmez; yalnızca var/yok', async () => {
    verifyMock.mockResolvedValue({ uid: 'admin-1', role: 'managing_editor', email: 'm@x', scope: UNSCOPED_STAFF })
    await fs.collection('config').doc('socialMedia').set({ facebookPageToken: 'EAAG_STORED_PAGE_TOKEN_123', instagramToken: 'IGQ_STORED_TOKEN_456' })
    const { GET } = await import('@/app/api/admin/social/token/route')
    const res = await GET(req('GET'))
    const text = await res.text()
    expect(res.status).toBe(200)
    for (const leak of ['EAAG', 'IGQ', 'STORED', 'Preview']) expect(text).not.toContain(leak)
    expect(JSON.parse(text)).toMatchObject({ hasFbToken: true, hasIgToken: true })
  })

  it('POST denetim kaydı yazar; kayıt ve yanıt token içermez', async () => {
    verifyMock.mockResolvedValue({ uid: 'admin-1', role: 'managing_editor', email: 'm@x', scope: UNSCOPED_STAFF })
    const fetchMock = vi.fn(async (url: string) =>
      new Response(JSON.stringify(String(url).includes('/permissions') ? { data: [] } : { id: 'p1', name: 'Onyeditivi' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { POST } = await import('@/app/api/admin/social/token/route')
    const res = await POST(req('POST', { facebookPageToken: 'EAAG_NEW_SECRET_TOKEN_789', instagramToken: 'IGQ_NEW_SECRET' }))
    const text = await res.text()
    vi.unstubAllGlobals()
    expect(res.status).toBe(200)
    expect(text).not.toContain('EAAG_NEW_SECRET')
    const audits = fs.docs('cmsAuditLogs')
    expect(audits).toHaveLength(1)
    expect(audits[0].data).toMatchObject({ action: 'social.legacy_token.update', actorId: 'admin-1', after: { hasFacebookPageToken: true, hasInstagramToken: true } })
    expect(JSON.stringify(audits[0].data)).not.toMatch(/EAAG_NEW|IGQ_NEW/)
  })

  it('yetkisiz istek 401, yazma yok', async () => {
    verifyMock.mockResolvedValue(null)
    const { POST } = await import('@/app/api/admin/social/token/route')
    const res = await POST(req('POST', { facebookPageToken: 'EAAG_X' }))
    expect(res.status).toBe(401)
    expect(fs.writes).toBe(0)
  })
})

describe('hesap yönetimi yetkisi — merkez yönetici', () => {
  const ctx = (role: string, scoped = false): CmsAuthContext => ({
    uid: 'u',
    role: role as CmsRole,
    email: 'e',
    scope: scoped
      ? { kind: 'scoped', scope: { provinceSlugs: ['antalya'], districtSlugs: [], categoryIds: [] } }
      : UNSCOPED_STAFF,
  })

  it('erişim kümesi mevcut Onyeditivi token/app ekranlarıyla aynı (system:settings)', () => {
    const holders = Object.entries(ROLE_PERMISSIONS).filter(([, p]) => p.includes('system:settings')).map(([r]) => r).sort()
    expect(holders).toEqual(['managing_editor', 'super_admin'])
    expect(canManageSocialAccounts(ctx('super_admin'))).toBe(true)
    expect(canManageSocialAccounts(ctx('managing_editor'))).toBe(true)
    for (const r of ['editor', 'author', 'video_editor', 'user']) expect(canManageSocialAccounts(ctx(r))).toBe(false)
  })

  it('il/kategori kapsamlı personel bu aşamada yönetemez', () => {
    expect(canManageSocialAccounts(ctx('managing_editor', true))).toBe(false)
    expect(canManageSocialAccounts(null)).toBe(false)
  })

  it('callback yeniden denetimi: rolü düşen veya devre dışı kullanıcı reddedilir', async () => {
    const own = { citySlug: 'antalya', publisherId: null }
    h.users = { me: { email: 'me@x' }, ed: { email: 'ed@x' }, off: { email: 'off@x', disabled: true }, root: { email: 'root@example.com' } }
    await fs.collection('users').doc('me').set({ role: 'managing_editor' })
    await fs.collection('users').doc('ed').set({ role: 'editor' })
    await fs.collection('users').doc('off').set({ role: 'managing_editor' })
    expect(await recheckSocialAccountManager('me', own)).toMatchObject({ uid: 'me', role: 'managing_editor' })
    expect(await recheckSocialAccountManager('root', own)).toMatchObject({ role: 'super_admin' })
    expect(await recheckSocialAccountManager('ed', own)).toBeNull()
    expect(await recheckSocialAccountManager('off', own)).toBeNull()
    expect(await recheckSocialAccountManager('ghost', own)).toBeNull()
    await fs.collection('users').doc('me').set({ role: 'editor' })
    expect(await recheckSocialAccountManager('me', own)).toBeNull()
  })
})
