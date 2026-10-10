/**
 * Hesap bağlama akışları — uçtan uca (rotalar + gerçek yetki/state/şifreleme),
 * in-memory Firestore ve taklit Meta uçları. Gerçek Meta/Firebase yok.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from '../testing/fakeFirestore'

const h = vi.hoisted(() => ({
  db: null as unknown,
  users: {} as Record<string, { email: string; disabled?: boolean }>,
}))
vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => h.db,
  getAdminAuth: () => ({
    verifyIdToken: async (t: string) => {
      const uid = t.replace(/^tok-/, '')
      if (!h.users[uid]) throw new Error('bad token')
      return { uid, email: h.users[uid].email }
    },
    getUser: async (uid: string) => {
      const u = h.users[uid]
      if (!u) throw new Error('auth/user-not-found')
      return { uid, email: u.email, disabled: !!u.disabled }
    },
  }),
}))
vi.mock('@/lib/cmsSecrets.server', () => ({
  isSuperAdminEmailServer: (e: string) => e === 'root@example.com',
  getBootstrapAdminUids: () => [],
}))

import { signCmsSessionToken } from '@/lib/cmsSession'
import { handleOAuthCallback, startConnection, selectFacebookPage, listSelectablePages, changeAccountStatus } from './flows'
import { saveConnectedAccount } from './connectionStore'
import { resolvePublishTarget } from '../resolvePublishTarget'
import { resolveCmsAuthForUid } from '@/lib/cmsAuthServer'
import { INSTAGRAM_LOGIN_GRAPH_BASE } from '../../graphConfig'

// ── Meta mock ────────────────────────────────────────────────────────────────
type Call = { url: string; method: string; body: string }
let calls: Call[] = []
let logs: string[] = []
const meta = {
  fbDeclined: [] as string[],
  fbGranted: [] as string[],
  igPermissions: null as string | null,
  igUserId: '',
  igAccountType: '',
  threadsDebugOk: true,
  threadsScopes: [] as string[],
  threadsUserId: '',
  /** Meta'nın gerçek biçimi: token yanıtında user_id tırnaksız JSON sayısı. */
  threadsUserIdAsNumber: false,
  fbNoPages: false,
  fbAccountsError: false,
}
const META_DEFAULTS = () => ({
  threadsUserIdAsNumber: false,
  fbNoPages: false,
  fbAccountsError: false,
  fbDeclined: [] as string[],
  fbGranted: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'public_profile'],
  igPermissions: 'instagram_business_basic,instagram_business_content_publish' as string | null,
  igUserId: '17840000000000001',
  igAccountType: 'BUSINESS',
  threadsDebugOk: true,
  threadsScopes: ['threads_basic', 'threads_content_publish'],
  threadsUserId: '4440001',
})
const SECRETS = [
  'FB_APP_SECRET_VALUE',
  'IG_APP_SECRET_VALUE',
  'TH_APP_SECRET_VALUE',
  'AUTHCODE123',
  'EAAG_LONG_USER',
  'EAAG_SHORT',
  'EAAG_PAGE_',
  'EAAG_LEAK',
  'IGAA_SHORT',
  'IGAA_LONG',
  'THQ_SHORT',
  'THQ_LONG',
]

function jsonRes(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } })
}

async function metaFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  calls.push({ url, method, body: init?.body ? String(init.body) : '' })
  const u = new URL(url)
  const q = u.searchParams
  const p = u.pathname
  if (u.host === 'graph.facebook.com') {
    if (p.endsWith('/oauth/access_token')) {
      if (q.get('grant_type') === 'fb_exchange_token') return jsonRes({ access_token: 'EAAG_LONG_USER', expires_in: 5184000 })
      return q.get('code') === 'AUTHCODE123'
        ? jsonRes({ access_token: 'EAAG_SHORT' })
        : jsonRes({ error: { message: 'Invalid code EAAG_LEAK', code: 100 } }, 400)
    }
    if (p.endsWith('/me/permissions')) {
      return jsonRes({
        data: [
          ...meta.fbGranted.map((x) => ({ permission: x, status: 'granted' })),
          ...meta.fbDeclined.map((x) => ({ permission: x, status: 'declined' })),
        ],
      })
    }
    if (p.endsWith('/me/accounts')) {
      if (meta.fbAccountsError) return jsonRes({ error: { message: 'boom EAAG_LEAK', code: 190 } }, 400)
      if (meta.fbNoPages) return jsonRes({ data: [] })
      // Meta: access_token yalnızca fields içinde istenirse döner.
      const withToken = (q.get('fields') ?? '').split(',').includes('access_token')
      const pg = (id: string, name: string, tasks: string[]) => ({ id, name, tasks, ...(withToken ? { access_token: `EAAG_PAGE_${id}` } : {}) })
      if (!q.get('after')) {
        return jsonRes({
          data: [pg('5001', 'Antalya Haber', ['CREATE_CONTENT', 'MANAGE']), pg('5002', 'Salt Okunur Sayfa', ['ANALYZE'])],
          paging: {
            cursors: { after: 'CUR1' },
            next: 'https://graph.facebook.com/v21.0/me/accounts?access_token=EAAG_LONG_USER&after=CUR1',
          },
        })
      }
      return jsonRes({ data: [pg('5003', 'Ankara Haber', ['CREATE_CONTENT'])], paging: { cursors: { after: 'CUR2' } } })
    }
    if (p.endsWith('/debug_token')) {
      const pid = (q.get('input_token') ?? '').replace('EAAG_PAGE_', '')
      return jsonRes({ data: { is_valid: true, type: 'PAGE', profile_id: pid, expires_at: 0, app_id: '1111111' } })
    }
    const m = p.match(/\/(\d+)$/)
    if (m) {
      // Meta: Page düğümünde `tasks` alanı yok → (#100) var olmayan alan (production 00:55 hatası).
      if ((q.get('fields') ?? '').split(',').includes('tasks')) {
        return jsonRes({ error: { message: '(#100) Tried accessing nonexisting field (tasks) EAAG_LEAK', type: 'OAuthException', code: 100 } }, 400)
      }
      return jsonRes({ id: m[1], name: `Sayfa ${m[1]}`, access_token: `EAAG_PAGE_${m[1]}` })
    }
  }
  if (u.host === 'api.instagram.com' && p === '/oauth/access_token') {
    return jsonRes({
      data: [
        { access_token: 'IGAA_SHORT', user_id: '999', ...(meta.igPermissions === null ? {} : { permissions: meta.igPermissions }) },
      ],
    })
  }
  if (u.host === 'graph.instagram.com') {
    if (p === '/access_token') return jsonRes({ access_token: 'IGAA_LONG', token_type: 'bearer', expires_in: 5183944 })
    if (p.endsWith('/me')) {
      return jsonRes({ user_id: meta.igUserId, username: 'antalyahaber', name: 'Antalya Haber IG', account_type: meta.igAccountType })
    }
  }
  if (u.host === 'graph.threads.com' && p === '/oauth/access_token') {
    if (meta.threadsUserIdAsNumber) {
      // Ham metin: JSON.stringify sayıyı yuvarlayacağı için yanıt elle yazılır.
      return new Response(`{"access_token":"THQ_SHORT","token_type":"bearer","user_id":${meta.threadsUserId}}`, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return jsonRes({ access_token: 'THQ_SHORT', user_id: meta.threadsUserId })
  }
  if (u.host === 'graph.threads.net') {
    if (p === '/access_token') return jsonRes({ access_token: 'THQ_LONG', token_type: 'bearer', expires_in: 5183944 })
    if (p.endsWith('/debug_token')) {
      return meta.threadsDebugOk
        ? jsonRes({ data: { is_valid: true, scopes: meta.threadsScopes, user_id: meta.threadsUserId } })
        : jsonRes({ error: { message: 'nope THQ_LONG', code: 190 } }, 400)
    }
    if (p.endsWith(`/${meta.threadsUserId}`)) return jsonRes({ id: meta.threadsUserId, username: 'antalya.th', name: 'Antalya Threads' })
  }
  return jsonRes({ error: { message: `unexpected ${u.host}${p}` } }, 404)
}

// ── Fixtures ────────────────────────────────────────────────────────────────
let fs: FakeFirestore
const NOW = 1_800_000_000_000
const ENV = {
  SECRET_ENCRYPTION_KEY: 'd'.repeat(64),
  CMS_SESSION_SECRET: 'test-cms-session-secret',
  SOCIAL_OAUTH_BASE_URL: 'https://www.nahaber.com',
  SOCIAL_FB_APP_ID: '1111111',
  SOCIAL_FB_APP_SECRET: 'FB_APP_SECRET_VALUE',
  SOCIAL_IG_APP_ID: '2222222',
  SOCIAL_IG_APP_SECRET: 'IG_APP_SECRET_VALUE',
  SOCIAL_THREADS_APP_ID: '3333333',
  SOCIAL_THREADS_APP_SECRET: 'TH_APP_SECRET_VALUE',
}
const ORIGIN = 'https://www.nahaber.com'

async function ctxFor(uid: string) {
  const c = await resolveCmsAuthForUid(uid)
  if (!c) throw new Error(`no ctx for ${uid}`)
  return c
}

async function cmsSession(uid: string) {
  return signCmsSessionToken({ uid, role: 'managing_editor', exp: Math.floor(Date.now() / 1000) + 3600 })
}

async function begin(
  platform: 'facebook' | 'instagram' | 'threads',
  uid = 'admin1',
  citySlug = 'antalya',
  reconnectAccountId?: string,
) {
  const r = await startConnection({
    ctx: await ctxFor(uid),
    platform,
    ownership: { citySlug },
    reconnectAccountId: reconnectAccountId ?? null,
    now: NOW,
  })
  if (!r.ok) throw new Error(r.code)
  const state = new URL(r.authorizeUrl).searchParams.get('state')!
  return { ...r, state, cookieHeader: `${r.cookie.name}=${r.cookie.value}; cms_session=${await cmsSession(uid)}` }
}

function callback(platform: string, params: Record<string, string>, cookieHeader: string | null, now = NOW + 1000) {
  return handleOAuthCallback({ platform, params: new URLSearchParams(params), cookieHeader, now })
}

const result = (o: { redirect: string }) => new URL(o.redirect).searchParams.get('social')

function req(path: string, init: { method?: string; uid?: string; origin?: string; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = {}
  if (init.uid) headers.authorization = `Bearer tok-${init.uid}`
  if (init.origin) headers.origin = init.origin
  if (init.cookie) headers.cookie = init.cookie
  return new Request(`${ORIGIN}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

beforeEach(async () => {
  fs = new FakeFirestore()
  h.db = fs
  h.users = {
    admin1: { email: 'me@nahaber.com' },
    admin2: { email: 'me2@nahaber.com' },
    editor1: { email: 'ed@nahaber.com' },
    scoped1: { email: 'sc@nahaber.com' },
  }
  await fs.collection('users').doc('admin1').set({ role: 'managing_editor' })
  await fs.collection('users').doc('admin2').set({ role: 'managing_editor' })
  await fs.collection('users').doc('editor1').set({ role: 'editor' })
  await fs.collection('users').doc('scoped1').set({ role: 'managing_editor', cmsScope: { provinceSlugs: ['antalya'] } })
  Object.assign(process.env, ENV)
  calls = []
  logs = []
  Object.assign(meta, META_DEFAULTS())
  vi.stubGlobal('fetch', metaFetch)
  for (const lvl of ['log', 'warn', 'error', 'info'] as const) {
    vi.spyOn(console, lvl).mockImplementation((...a: unknown[]) => {
      logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '))
    })
  }
})

afterEach(() => {
  // Global invariant: secrets never reach logs, and Firestore never holds them in plain text.
  const blob = logs.join('\n')
  for (const s of SECRETS) expect(blob, `log leak ${s}`).not.toContain(s)
  for (const [path, doc] of fs.store) {
    if (path.startsWith('users/')) continue
    const raw = JSON.stringify(doc)
    for (const s of SECRETS) expect(raw, `firestore leak ${s} in ${path}`).not.toContain(s)
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const k of Object.keys(ENV)) delete process.env[k]
})

// ── Start ───────────────────────────────────────────────────────────────────
describe('bağlantı başlatma', () => {
  it('yetkisiz, editör ve il kapsamlı kullanıcı başlatamaz', async () => {
    const { POST } = await import('@/app/api/admin/social/accounts/connect/route')
    const body = { platform: 'instagram', ownership: { citySlug: 'antalya' } }
    expect((await POST(req('/api/admin/social/accounts/connect', { method: 'POST', origin: ORIGIN, body }))).status).toBe(401)
    expect((await POST(req('/api/admin/social/accounts/connect', { method: 'POST', origin: ORIGIN, uid: 'editor1', body }))).status).toBe(401)
    expect((await POST(req('/api/admin/social/accounts/connect', { method: 'POST', origin: ORIGIN, uid: 'scoped1', body }))).status).toBe(401)
    expect(calls).toEqual([])
    expect(fs.docs('socialOAuthStates')).toHaveLength(0)
  })

  it('başka origin’den gelen istek reddedilir (CSRF)', async () => {
    const { POST } = await import('@/app/api/admin/social/accounts/connect/route')
    const res = await POST(
      req('/api/admin/social/accounts/connect', {
        method: 'POST',
        origin: 'https://evil.example',
        uid: 'admin1',
        body: { platform: 'instagram', ownership: { citySlug: 'antalya' } },
      }),
    )
    expect(res.status).toBe(403)
    expect(fs.docs('socialOAuthStates')).toHaveLength(0)
  })

  it('authorize URL + HttpOnly cookie; Instagram App ID; sır yok; sahiplik doğrulanır', async () => {
    const { POST } = await import('@/app/api/admin/social/accounts/connect/route')
    const mk = (body: unknown) => POST(req('/api/admin/social/accounts/connect', { method: 'POST', origin: ORIGIN, uid: 'admin1', body }))
    const ok = await mk({ platform: 'instagram', ownership: { citySlug: 'antalya' } })
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as { authorizeUrl: string }
    const u = new URL(body.authorizeUrl)
    expect(u.origin + u.pathname).toBe('https://www.instagram.com/oauth/authorize')
    expect(u.searchParams.get('client_id')).toBe('2222222')
    expect(u.searchParams.get('redirect_uri')).toBe('https://www.nahaber.com/api/admin/social/oauth/instagram/callback')
    expect(u.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_content_publish')
    for (const s of SECRETS) expect(body.authorizeUrl).not.toContain(s)
    const setCookie = (ok.headers.get('set-cookie') ?? '').toLowerCase()
    expect(setCookie).toMatch(/nh_social_oauth=/)
    expect(setCookie).toContain('httponly')
    expect(setCookie).toContain('samesite=lax')
    expect((await mk({ platform: 'instagram', ownership: { citySlug: 'atlantis' } })).status).toBe(400)
    expect((await mk({ platform: 'instagram', ownership: { citySlug: 'antalya', publisherId: 'p1' } })).status).toBe(400)
    expect((await mk({ platform: 'tiktok', ownership: { citySlug: 'antalya' } })).status).toBe(400)
  })

  it('Facebook Login for Business: config_id tanımlıysa scope yerine config_id + code akışı', async () => {
    process.env.SOCIAL_FB_LOGIN_CONFIG_ID = '987654321'
    try {
      const fb = await begin('facebook')
      const q = new URL(fb.authorizeUrl).searchParams
      expect(q.get('config_id')).toBe('987654321')
      expect(q.get('scope')).toBeNull()
      expect(q.get('response_type')).toBe('code')
      expect(q.get('override_default_response_type')).toBe('true')
      process.env.SOCIAL_FB_LOGIN_CONFIG_ID = 'not-a-number'
      const bad = await startConnection({ ctx: await ctxFor('admin1'), platform: 'facebook', ownership: { citySlug: 'antalya' }, now: NOW })
      expect(bad).toMatchObject({ ok: false, code: 'not_configured', missing: ['SOCIAL_FB_LOGIN_CONFIG_ID'] })
    } finally {
      delete process.env.SOCIAL_FB_LOGIN_CONFIG_ID
    }
  })

  it('Facebook ve Threads kendi uygulama kimlikleriyle başlar', async () => {
    const fb = await begin('facebook')
    expect(new URL(fb.authorizeUrl).searchParams.get('client_id')).toBe('1111111')
    expect(new URL(fb.authorizeUrl).host).toBe('www.facebook.com')
    // business_management: işletme portföyü (Business Suite) üzerinden yönetilen
    // sayfalar onsuz /me/accounts'ta dönmez (200 + boş liste → "sayfa yok").
    expect(new URL(fb.authorizeUrl).searchParams.get('scope')).toBe('pages_show_list,pages_read_engagement,pages_manage_posts,business_management')
    const th = await begin('threads')
    expect(new URL(th.authorizeUrl).searchParams.get('client_id')).toBe('3333333')
  })

  it('eksik yapılandırma: değer değil yalnızca değişken adı döner', async () => {
    delete process.env.SOCIAL_THREADS_APP_SECRET
    const r = await startConnection({ ctx: await ctxFor('admin1'), platform: 'threads', ownership: { citySlug: 'antalya' }, now: NOW })
    expect(r).toMatchObject({ ok: false, status: 409, code: 'not_configured', missing: ['SOCIAL_THREADS_APP_SECRET'] })
  })
})

// ── Callback security ───────────────────────────────────────────────────────
describe('callback güvenliği', () => {
  it('cookie / oturum / kullanıcı / platform uyuşmazlığı → reddedilir, Meta çağrılmaz', async () => {
    const a = await begin('instagram')
    expect(result(await callback('instagram', { state: a.state, code: 'AUTHCODE123' }, `nh_social_oauth=yanlis; cms_session=${await cmsSession('admin1')}`))).toBe('state_invalid')

    const b = await begin('instagram')
    expect(result(await callback('instagram', { state: b.state, code: 'AUTHCODE123' }, `${b.cookie.name}=${b.cookie.value}`))).toBe('session_required')

    const c = await begin('instagram')
    expect(result(await callback('instagram', { state: c.state, code: 'AUTHCODE123' }, `${c.cookie.name}=${c.cookie.value}; cms_session=${await cmsSession('admin2')}`))).toBe('session_mismatch')

    const d = await begin('facebook')
    expect(result(await callback('instagram', { state: d.state, code: 'AUTHCODE123' }, d.cookieHeader))).toBe('state_invalid')

    const e = await begin('instagram')
    expect(result(await callback('instagram', { state: e.state, code: 'AUTHCODE123' }, `${e.cookie.name}=${e.cookie.value}; cms_session=forged.sig`))).toBe('session_required')
    expect(calls).toEqual([])
  })

  it('süresi geçmiş ve tekrar kullanılan state', async () => {
    const a = await begin('instagram')
    expect(result(await callback('instagram', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader, NOW + 11 * 60 * 1000))).toBe('state_expired')
    const b = await begin('instagram')
    expect(result(await callback('instagram', { state: b.state, code: 'AUTHCODE123' }, b.cookieHeader))).toBe('connected')
    const callsAfterFirst = calls.length
    expect(result(await callback('instagram', { state: b.state, code: 'AUTHCODE123' }, b.cookieHeader))).toBe('state_invalid')
    expect(calls.length).toBe(callsAfterFirst)
  })

  it('kullanıcı iptali → cancelled, cookie temizlenir, state yanar', async () => {
    const a = await begin('threads')
    const out = await callback('threads', { state: a.state, error: 'access_denied', error_reason: 'user_denied', error_description: 'The user denied' }, a.cookieHeader)
    expect(result(out)).toBe('cancelled')
    expect(out.cookies.filter((c) => c.options.maxAge === 0).map((c) => c.name)).toEqual(
      expect.arrayContaining(['nh_social_oauth', '__Host-nh_social_oauth']),
    )
    expect(calls).toEqual([])
    expect(result(await callback('threads', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader))).toBe('state_invalid')
  })

  it('callback anında yetkisi düşmüş kullanıcı reddedilir', async () => {
    const a = await begin('instagram')
    await fs.collection('users').doc('admin1').set({ role: 'editor' })
    expect(result(await callback('instagram', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader))).toBe('forbidden')
    expect(calls).toEqual([])
  })

  it('callback rotası: sabit panel adresine 303; Host/Meta metni/kod yansıtılmaz', async () => {
    const { GET } = await import('@/app/api/admin/social/oauth/[platform]/callback/route')
    const a = await begin('instagram')
    meta.igPermissions = 'instagram_business_basic'
    const res = await GET(
      new Request(`https://evil.example/api/admin/social/oauth/instagram/callback?state=${a.state}&code=AUTHCODE123`, {
        headers: { cookie: a.cookieHeader },
      }),
      { params: Promise.resolve({ platform: 'instagram' }) },
    )
    expect(res.status).toBe(303)
    const loc = res.headers.get('location')!
    expect(loc.startsWith('https://www.nahaber.com/admin/social?')).toBe(true)
    expect(new URL(loc).searchParams.get('social')).toBe('permission_missing')
    expect(loc).not.toContain('AUTHCODE')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect((res.headers.get('set-cookie') ?? '').toLowerCase()).toMatch(/nh_social_oauth=;.*max-age=0/)
  })

  it('platform hatası ham Meta mesajı içermez', async () => {
    const a = await begin('facebook')
    const out = await callback('facebook', { state: a.state, code: 'WRONGCODE' }, a.cookieHeader)
    expect(result(out)).toBe('platform_error')
    expect(out.redirect).not.toContain('Invalid')
    expect(logs.join('\n')).not.toContain('Invalid code')
  })
})

// ── Instagram ───────────────────────────────────────────────────────────────
describe('Instagram Login', () => {
  it('doğru host ve uygulama kimliği; gerçek süre ve izinler kaydedilir', async () => {
    const a = await begin('instagram')
    expect(result(await callback('instagram', { state: a.state, code: 'AUTHCODE123#_' }, a.cookieHeader))).toBe('connected')
    expect(calls.map((c) => new URL(c.url).host)).not.toContain('graph.facebook.com')
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'https://api.instagram.com/oauth/access_token' })
    const form = new URLSearchParams(calls[0].body)
    expect(form.get('client_id')).toBe('2222222')
    expect(form.get('code')).toBe('AUTHCODE123')
    expect(calls.some((c) => c.url.startsWith(`${INSTAGRAM_LOGIN_GRAPH_BASE}/me?`))).toBe(true)
    expect(fs.store.get('socialAccounts/instagram_17840000000000001')).toMatchObject({
      connectionMethod: 'instagram_login',
      status: 'active',
      ownership: { citySlug: 'antalya', publisherId: null },
      tokenExpiresAt: NOW + 1000 + 5183944 * 1000,
      tokenExpiryVerified: true,
      grantedPermissions: ['instagram_business_basic', 'instagram_business_content_publish'],
      platformAccountType: 'BUSINESS',
    })
    // Expected: the token IS stored — encrypted (AES-GCM iv:tag:data), never in plain text.
    const secret = fs.store.get('socialAccountSecrets/instagram_17840000000000001') as Record<string, unknown>
    expect(secret).toMatchObject({ kind: 'encrypted', tokenType: 'instagram_user' })
    expect(String(secret.accessTokenEncrypted).split(':')).toHaveLength(3)
    const t = await resolvePublishTarget('instagram_17840000000000001', { now: NOW + 2000 })
    expect(t.ok && t.target.apiBase).toBe(INSTAGRAM_LOGIN_GRAPH_BASE)
    expect(t.ok && t.target.accessToken).toBe('IGAA_LONG')
  })

  it('yayın izni eksik / kişisel hesap → kayıt yok', async () => {
    meta.igPermissions = 'instagram_business_basic'
    const a = await begin('instagram')
    expect(result(await callback('instagram', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader))).toBe('permission_missing')
    meta.igPermissions = 'instagram_business_basic,instagram_business_content_publish'
    meta.igAccountType = 'PERSONAL'
    const b = await begin('instagram')
    expect(result(await callback('instagram', { state: b.state, code: 'AUTHCODE123' }, b.cookieHeader))).toBe('not_professional')
    expect(fs.docs('socialAccounts')).toHaveLength(0)
  })

  it('izin bilgisi yanıtta yoksa "verilmiş" sayılmaz: yeni hesap yayına hazır görünmez', async () => {
    meta.igPermissions = null
    const a = await begin('instagram')
    expect(result(await callback('instagram', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader))).toBe('connected_needs_attention')
    expect(fs.store.get('socialAccounts/instagram_17840000000000001')).toMatchObject({ status: 'needs_reauth', grantedPermissions: null })
    expect(await resolvePublishTarget('instagram_17840000000000001', { now: NOW + 2000 })).toMatchObject({ ok: false })
  })
})

// ── Threads ─────────────────────────────────────────────────────────────────
describe('Threads', () => {
  it('Threads uygulama kimliği, doğru uçlar, doğrulanmış izinler', async () => {
    const a = await begin('threads')
    expect(result(await callback('threads', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader))).toBe('connected')
    expect(calls.map((c) => `${c.method} ${new URL(c.url).host}${new URL(c.url).pathname}`)).toEqual([
      'POST graph.threads.com/oauth/access_token',
      'GET graph.threads.net/access_token',
      'GET graph.threads.net/v1.0/4440001',
      'GET graph.threads.net/v1.0/debug_token',
    ])
    expect(new URLSearchParams(calls[0].body).get('client_id')).toBe('3333333')
    expect(fs.store.get('socialAccounts/threads_4440001')).toMatchObject({
      status: 'active',
      grantedPermissions: ['threads_basic', 'threads_content_publish'],
      tokenExpiryVerified: true,
    })
  })

  it('izin doğrulanamazsa unverified işaretlenir; eksik izin reddedilir', async () => {
    meta.threadsDebugOk = false
    const a = await begin('threads')
    expect(result(await callback('threads', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader))).toBe('connected_needs_attention')
    expect(fs.store.get('socialAccounts/threads_4440001')).toMatchObject({
      status: 'needs_reauth',
      statusReason: 'Yayın izni doğrulanamadı',
      permissionsVerifiedAt: null,
    })
    meta.threadsDebugOk = true
    meta.threadsScopes = ['threads_basic']
    meta.threadsUserId = '4440002'
    const b = await begin('threads')
    expect(result(await callback('threads', { state: b.state, code: 'AUTHCODE123' }, b.cookieHeader))).toBe('permission_missing')
    expect(fs.store.has('socialAccounts/threads_4440002')).toBe(false)
  })

  it('büyük sayısal user_id (MAX_SAFE_INTEGER üstü) yuvarlanmadan profil isteğine ve kayda gider', async () => {
    // Production hatası: 17 haneli kimlik JSON.parse ile yuvarlanınca profil isteği
    // var olmayan bir kimliğe gidip 400/100/33 döndü.
    const realId = '39373226298991729'
    expect(String(Number(realId))).not.toBe(realId) // ön koşul: Number dönüşümü bu kimliği bozar
    meta.threadsUserId = realId
    meta.threadsUserIdAsNumber = true
    const a = await begin('threads')
    expect(result(await callback('threads', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader))).toBe('connected')
    const profileCall = calls.find((c) => new URL(c.url).pathname.startsWith('/v1.0/') && !c.url.includes('debug_token'))
    expect(new URL(profileCall!.url).pathname).toBe(`/v1.0/${realId}`)
    expect(fs.store.get(`socialAccounts/threads_${realId}`)).toMatchObject({
      externalId: realId,
      status: 'active',
      grantedPermissions: ['threads_basic', 'threads_content_publish'],
    })
  })
})

// ── Facebook page selection ─────────────────────────────────────────────────
describe('Facebook sayfa seçimi', () => {
  it('reddedilmiş / eksik izin → seçim oturumu açılmaz', async () => {
    meta.fbGranted = ['pages_show_list', 'pages_read_engagement']
    meta.fbDeclined = ['pages_manage_posts']
    const a = await begin('facebook')
    expect(result(await callback('facebook', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader))).toBe('permission_declined')
    meta.fbDeclined = []
    const b = await begin('facebook')
    expect(result(await callback('facebook', { state: b.state, code: 'AUTHCODE123' }, b.cookieHeader))).toBe('permission_missing')
    expect(fs.docs('socialConnectSessions')).toHaveLength(0)
  })

  it('business_management isteğe bağlıdır: reddedilse de yayın izinleri tamsa sayfa seçimine geçilir', async () => {
    meta.fbGranted = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
    meta.fbDeclined = ['business_management']
    const a = await begin('facebook')
    expect(result(await callback('facebook', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader))).toBe('facebook_select')
  })

  it('izinler tam ama Meta boş sayfa listesi döndürürse no_pages (hata boş listeye çevrilmez)', async () => {
    meta.fbNoPages = true
    const a = await begin('facebook')
    expect(result(await callback('facebook', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader))).toBe('no_pages')
    meta.fbNoPages = false
    meta.fbAccountsError = true
    const b = await begin('facebook')
    expect(result(await callback('facebook', { state: b.state, code: 'AUTHCODE123' }, b.cookieHeader))).toBe('platform_error')
    expect(fs.docs('socialConnectSessions')).toHaveLength(0)
  })

  it('sayfalama, otomatik seçim yok, token tarayıcıya gitmez; oturum kullanıcıya/tarayıcıya bağlı ve tek kullanımlık', async () => {
    const a = await begin('facebook')
    const out = await callback('facebook', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader)
    expect(result(out)).toBe('facebook_select')
    const accountsCalls = calls.filter((c) => c.url.includes('/me/accounts'))
    expect(accountsCalls).toHaveLength(2)
    expect(new URL(accountsCalls[1].url).searchParams.get('after')).toBe('CUR1')
    expect(fs.docs('socialAccounts')).toHaveLength(0)

    const sessionId = new URL(out.redirect).searchParams.get('fbSelect')!
    const sel = out.cookies.find((c) => c.name.endsWith('nh_social_select'))!
    const cookieHeader = `${sel.name}=${sel.value}`
    const admin = await ctxFor('admin1')

    const list = await listSelectablePages({ ctx: admin, sessionId, cookieHeader, offset: 0, now: NOW + 2000 })
    expect(list).toMatchObject({
      ok: true,
      total: 3,
      pages: [
        { id: '5001', eligible: true },
        { id: '5002', eligible: false },
        { id: '5003', eligible: true },
      ],
    })
    expect(JSON.stringify(list)).not.toMatch(/EAAG|access_token|tasks/)

    expect(await selectFacebookPage({ ctx: await ctxFor('admin2'), sessionId, pageId: '5001', cookieHeader, now: NOW + 2000 })).toMatchObject({ ok: false, code: 'user_mismatch' })
    expect(await selectFacebookPage({ ctx: admin, sessionId, pageId: '5001', cookieHeader: 'nh_social_select=baska', now: NOW + 2000 })).toMatchObject({ ok: false, code: 'binding_mismatch' })
    expect(await selectFacebookPage({ ctx: admin, sessionId, pageId: '9999', cookieHeader, now: NOW + 2000 })).toMatchObject({ ok: false, code: 'page_not_in_session' })
    expect(await selectFacebookPage({ ctx: admin, sessionId, pageId: '5002', cookieHeader, now: NOW + 2000 })).toMatchObject({ ok: false, code: 'page_not_eligible' })
    expect(fs.docs('socialAccounts')).toHaveLength(0)

    const before = calls.length
    const r = await selectFacebookPage({ ctx: admin, sessionId, pageId: '5003', cookieHeader, now: NOW + 2000 })
    expect(r).toMatchObject({ ok: true, accountId: 'facebook_5003', status: 'active' })
    // Sayfa token'ı /me/accounts kenarından (2. sayfadaki 5003 için sayfalama ile) alınır;
    // Page düğümüne `tasks` alanıyla istek gitmez (Meta: code 100).
    const selCalls = calls.slice(before).map((c) => new URL(c.url))
    expect(selCalls.filter((u) => u.pathname.endsWith('/me/accounts')).map((u) => u.searchParams.get('fields'))).toEqual([
      'id,name,access_token,tasks',
      'id,name,access_token,tasks',
    ])
    expect(selCalls.some((u) => /\/5003$/.test(u.pathname))).toBe(false)
    expect(fs.store.get('socialAccounts/facebook_5003')).toMatchObject({
      connectionMethod: 'facebook_login',
      tokenExpiresAt: null,
      tokenExpiryVerified: true,
      ownership: { citySlug: 'antalya' },
    })
    expect(await selectFacebookPage({ ctx: admin, sessionId, pageId: '5001', cookieHeader, now: NOW + 3000 })).toMatchObject({ ok: false, code: 'already_used' })
    expect(fs.docs('socialConnectSessions')[0].data.userTokenEncrypted).toBeNull()
    expect(fs.store.get('socialAccountSecrets/facebook_5003')).toMatchObject({ kind: 'encrypted', tokenType: 'facebook_page' })
    const t = await resolvePublishTarget('facebook_5003', { now: NOW + 4000 })
    expect(t.ok && t.target.accessToken).toBe('EAAG_PAGE_5003')
  })

  it('başka bir oturumun kimliğiyle seçim yapılamaz; süresi geçen oturum reddedilir', async () => {
    const a = await begin('facebook')
    const outA = await callback('facebook', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader)
    const b = await begin('facebook', 'admin2')
    const outB = await callback('facebook', { state: b.state, code: 'AUTHCODE123' }, b.cookieHeader)
    const sidB = new URL(outB.redirect).searchParams.get('fbSelect')!
    const selA = outA.cookies.find((c) => c.name.endsWith('nh_social_select'))!
    // admin1 with its own cookie cannot use admin2's session id
    const cross = await selectFacebookPage({ ctx: await ctxFor('admin1'), sessionId: sidB, pageId: '5001', cookieHeader: `${selA.name}=${selA.value}`, now: NOW + 2000 })
    expect(cross.ok).toBe(false)
    const sidA = new URL(outA.redirect).searchParams.get('fbSelect')!
    expect(await selectFacebookPage({ ctx: await ctxFor('admin1'), sessionId: sidA, pageId: '5001', cookieHeader: `${selA.name}=${selA.value}`, now: NOW + 11 * 60 * 1000 })).toMatchObject({ ok: false, code: 'expired' })
  })

  it('rota: seçim yanıtı ve sayfa listesi token içermez', async () => {
    const a = await begin('facebook')
    const out = await callback('facebook', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader)
    const sid = new URL(out.redirect).searchParams.get('fbSelect')!
    const sel = out.cookies.find((c) => c.name.endsWith('nh_social_select'))!
    const route = await import('@/app/api/admin/social/accounts/facebook-pages/route')
    const listRes = await route.GET(req(`/api/admin/social/accounts/facebook-pages?session=${sid}&offset=0`, { uid: 'admin1', cookie: `${sel.name}=${sel.value}` }))
    const listText = await listRes.text()
    expect(listRes.status).toBe(200)
    for (const s of SECRETS) expect(listText).not.toContain(s)
    const pick = await route.POST(req('/api/admin/social/accounts/facebook-pages', { method: 'POST', uid: 'admin1', origin: ORIGIN, cookie: `${sel.name}=${sel.value}`, body: { session: sid, pageId: '5001' } }))
    const pickText = await pick.text()
    expect(pick.status).toBe(200)
    for (const s of SECRETS) expect(pickText).not.toContain(s)
    expect((pick.headers.get('set-cookie') ?? '').toLowerCase()).toMatch(/nh_social_select=;.*max-age=0/)
  })
})

// ── Reconnect / ownership / atomic save ─────────────────────────────────────
describe('yeniden bağlantı, sahiplik ve atomik kayıt', () => {
  async function connectInstagram(citySlug = 'antalya') {
    const a = await begin('instagram', 'admin1', citySlug)
    return callback('instagram', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader)
  }

  it('farklı hesapla yeniden bağlama → account_mismatch, mevcut token korunur', async () => {
    await connectInstagram()
    const before = structuredClone(fs.store.get('socialAccountSecrets/instagram_17840000000000001'))
    const a = await begin('instagram', 'admin1', 'antalya', 'instagram_17840000000000001')
    meta.igUserId = '17840000000000999'
    expect(result(await callback('instagram', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader))).toBe('account_mismatch')
    expect(fs.store.get('socialAccountSecrets/instagram_17840000000000001')).toEqual(before)
    expect(fs.store.has('socialAccounts/instagram_17840000000000999')).toBe(false)
  })

  it('yeniden bağlama platformu ve sahipliği kayıttan alır; başka ilden yeni bağlantı sessizce atanmaz', async () => {
    await connectInstagram('antalya')
    const re = await startConnection({
      ctx: await ctxFor('admin1'),
      platform: 'threads',
      ownership: { citySlug: 'ankara' },
      reconnectAccountId: 'instagram_17840000000000001',
      now: NOW,
    })
    if (!re.ok) throw new Error(re.code)
    expect(new URL(re.authorizeUrl).host).toBe('www.instagram.com')
    const state = new URL(re.authorizeUrl).searchParams.get('state')!
    const ch = `${re.cookie.name}=${re.cookie.value}; cms_session=${await cmsSession('admin1')}`
    expect(result(await callback('instagram', { state, code: 'AUTHCODE123' }, ch))).toBe('connected')
    expect(fs.store.get('socialAccounts/instagram_17840000000000001')).toMatchObject({ ownership: { citySlug: 'antalya' } })

    expect(result(await connectInstagram('ankara'))).toBe('owned_elsewhere')
    expect(fs.store.get('socialAccounts/instagram_17840000000000001')).toMatchObject({ ownership: { citySlug: 'antalya' } })
    expect(fs.docs('socialAccounts')).toHaveLength(1)
  })

  it('şifreleme veya işlem başarısızsa mevcut bağlantı bozulmaz', async () => {
    await connectInstagram()
    const acc = structuredClone(fs.store.get('socialAccounts/instagram_17840000000000001'))
    const sec = structuredClone(fs.store.get('socialAccountSecrets/instagram_17840000000000001'))
    const base = {
      platform: 'instagram' as const,
      connectionMethod: 'instagram_login' as const,
      externalId: '17840000000000001',
      displayName: 'x',
      username: null,
      platformAccountType: 'BUSINESS',
      accessToken: 'IGAA_LONG',
      tokenType: 'instagram_user' as const,
      tokenExpiresAt: null,
      tokenExpiryVerified: false,
      grantedPermissions: null,
      permissionsVerifiedAt: null,
      ownership: { citySlug: 'antalya', publisherId: null },
      reconnectAccountId: 'instagram_17840000000000001',
      actorUid: 'admin1',
      now: NOW,
    }
    delete process.env.SECRET_ENCRYPTION_KEY
    expect(await saveConnectedAccount(base)).toEqual({ ok: false, code: 'encryption_unavailable' })
    process.env.SECRET_ENCRYPTION_KEY = ENV.SECRET_ENCRYPTION_KEY
    vi.spyOn(fs, 'runTransaction').mockRejectedValueOnce(new Error('aborted'))
    expect(await saveConnectedAccount(base)).toEqual({ ok: false, code: 'write_failed' })
    expect(fs.store.get('socialAccounts/instagram_17840000000000001')).toEqual(acc)
    expect(fs.store.get('socialAccountSecrets/instagram_17840000000000001')).toEqual(sec)
  })

  it('legacy (Onyeditivi) kaydı OAuth ile ezilmez', async () => {
    await fs.collection('socialAccounts').doc('instagram_17840000000000001').set({
      id: 'instagram_17840000000000001',
      platform: 'instagram',
      externalId: '17840000000000001',
      connectionMethod: 'legacy',
      status: 'active',
      ownership: { citySlug: 'antalya', publisherId: null },
      instagram: { igUserId: '17840000000000001', linkedFacebookPageId: null },
      displayName: 'Onyeditivi',
    })
    expect(result(await connectInstagram())).toBe('legacy_account_exists')
    expect(fs.store.get('socialAccounts/instagram_17840000000000001')).toMatchObject({ connectionMethod: 'legacy' })
  })

  describe('legacy (Onyeditivi) → OAuth geçişi yalnızca açık yeniden bağlama ile', () => {
    const LEGACY_ID = 'instagram_17840000000000001'
    async function seedLegacy() {
      await fs.collection('socialAccounts').doc(LEGACY_ID).set({
        id: LEGACY_ID,
        platform: 'instagram',
        externalId: '17840000000000001',
        connectionMethod: 'legacy',
        status: 'active',
        ownership: { citySlug: 'canakkale', publisherId: null },
        instagram: { igUserId: '17840000000000001', linkedFacebookPageId: null },
        displayName: 'Onyeditivi',
        createdAt: 1111,
      })
      await fs.collection('socialAccountSecrets').doc(LEGACY_ID).set({ kind: 'legacy', legacySource: 'env', updatedAt: 1111 })
    }

    it('aynı dış hesapla yeniden bağlama legacy kaydı OAuth hesabına çevirir; kimlik, sahiplik ve kilit anahtarı korunur', async () => {
      await seedLegacy()
      const a = await begin('instagram', 'admin1', 'antalya', LEGACY_ID)
      expect(result(await callback('instagram', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader))).toBe('connected')
      const acc = fs.store.get(`socialAccounts/${LEGACY_ID}`) as Record<string, unknown>
      expect(acc).toMatchObject({
        id: LEGACY_ID,
        connectionMethod: 'instagram_login',
        externalId: '17840000000000001',
        ownership: { citySlug: 'canakkale', publisherId: null }, // istekteki 'antalya' değil, kayıttaki sahiplik
        createdAt: 1111,
      })
      expect(typeof acc.migratedFromLegacyAt).toBe('number')
      const sec = fs.store.get(`socialAccountSecrets/${LEGACY_ID}`) as Record<string, unknown>
      expect(sec.kind).not.toBe('legacy')
      expect(JSON.stringify(sec)).not.toContain('IGAA')
      expect(fs.docs('socialAccounts')).toHaveLength(1) // mükerrer hesap yok; ledger anahtarı (hesap kimliği) aynı
      const audit = fs.docs('cmsAuditLogs').map((d) => d.data).find((x) => x.action === 'social.account.connect')
      expect(audit).toMatchObject({ entityId: LEGACY_ID, after: { migratedFromLegacy: true, created: false } })
    })

    it('farklı hesapla giriş yapılırsa geçiş olmaz; legacy kayıt ve legacy sır aynen kalır', async () => {
      await seedLegacy()
      const before = structuredClone(fs.store.get(`socialAccounts/${LEGACY_ID}`))
      const beforeSec = structuredClone(fs.store.get(`socialAccountSecrets/${LEGACY_ID}`))
      const a = await begin('instagram', 'admin1', 'antalya', LEGACY_ID)
      meta.igUserId = '17840000000000999'
      expect(result(await callback('instagram', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader))).toBe('account_mismatch')
      expect(fs.store.get(`socialAccounts/${LEGACY_ID}`)).toEqual(before)
      expect(fs.store.get(`socialAccountSecrets/${LEGACY_ID}`)).toEqual(beforeSec)
      expect(fs.store.has('socialAccounts/instagram_17840000000000999')).toBe(false)
    })

    it('kayıt yazımı başarısızsa legacy bağlantı bozulmaz', async () => {
      await seedLegacy()
      const before = structuredClone(fs.store.get(`socialAccounts/${LEGACY_ID}`))
      const beforeSec = structuredClone(fs.store.get(`socialAccountSecrets/${LEGACY_ID}`))
      vi.spyOn(fs, 'runTransaction').mockRejectedValueOnce(new Error('aborted'))
      expect(await saveConnectedAccount({
        platform: 'instagram', connectionMethod: 'instagram_login', externalId: '17840000000000001', displayName: 'x', username: null,
        platformAccountType: 'BUSINESS', accessToken: 'IGAA_LONG', tokenType: 'instagram_user', tokenExpiresAt: null, tokenExpiryVerified: false,
        grantedPermissions: null, permissionsVerifiedAt: null, ownership: { citySlug: 'canakkale', publisherId: null },
        reconnectAccountId: LEGACY_ID, actorUid: 'admin1', now: NOW,
      })).toEqual({ ok: false, code: 'write_failed' })
      expect(fs.store.get(`socialAccounts/${LEGACY_ID}`)).toEqual(before)
      expect(fs.store.get(`socialAccountSecrets/${LEGACY_ID}`)).toEqual(beforeSec)
    })
  })
})

// ── Status + management API ─────────────────────────────────────────────────
describe('durum geçişleri ve yönetim API’si', () => {
  it('duraklat / etkinleştir; süresi dolmuş veya yeniden bağlantı gereken hesap etkinleştirilemez', async () => {
    const a = await begin('instagram')
    await callback('instagram', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader)
    const id = 'instagram_17840000000000001'
    const admin = await ctxFor('admin1')
    expect(await changeAccountStatus({ ctx: admin, accountId: id, action: 'pause', now: NOW + 5 })).toEqual({ ok: true, status: 'paused' })
    expect(await changeAccountStatus({ ctx: admin, accountId: id, action: 'activate', now: NOW + 6 })).toEqual({ ok: true, status: 'active' })
    await changeAccountStatus({ ctx: admin, accountId: id, action: 'pause', now: NOW + 7 })
    expect(await changeAccountStatus({ ctx: admin, accountId: id, action: 'activate', now: NOW + 1000 + 5183944 * 1000 + 1 })).toMatchObject({ ok: false, code: 'token_expired' })
    await fs.collection('socialAccounts').doc(id).update({ status: 'needs_reauth' })
    expect(await changeAccountStatus({ ctx: admin, accountId: id, action: 'activate', now: NOW + 8 })).toMatchObject({ ok: false, code: 'reconnect_required' })
    expect(await changeAccountStatus({ ctx: admin, accountId: id, action: 'delete', now: NOW + 8 })).toMatchObject({ ok: false, code: 'invalid_action' })
    const audits = fs.docs('cmsAuditLogs').map((d) => d.data.action)
    expect(audits).toEqual(expect.arrayContaining(['social.oauth.start', 'social.oauth.callback', 'social.account.create', 'social.account.status']))
  })

  it('izni eksik hesap durum değişikliğiyle etkinleştirilemez', async () => {
    meta.threadsDebugOk = false
    const a = await begin('threads')
    await callback('threads', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader)
    await fs.collection('socialAccounts').doc('threads_4440001').update({ status: 'paused' })
    expect(await changeAccountStatus({ ctx: await ctxFor('admin1'), accountId: 'threads_4440001', action: 'activate', now: NOW + 5 })).toMatchObject({ ok: false, code: 'publish_permission_unverified' })
  })

  it('liste/ayrıntı yalnızca public model döner; sır içermez; editör ve yabancı origin reddedilir', async () => {
    const a = await begin('instagram')
    await callback('instagram', { state: a.state, code: 'AUTHCODE123' }, a.cookieHeader)
    const list = await import('@/app/api/admin/social/accounts/route')
    const detail = await import('@/app/api/admin/social/accounts/[id]/route')
    const res = await list.GET(req('/api/admin/social/accounts', { uid: 'admin1' }))
    const text = await res.text()
    expect(res.status).toBe(200)
    for (const s of [...SECRETS, 'accessTokenEncrypted']) expect(text).not.toContain(s)
    const body = JSON.parse(text)
    expect(body.accounts[0]).toMatchObject({ id: 'instagram_17840000000000001', publishPermission: 'verified', status: 'active' })
    expect(body.config.instagram).toMatchObject({ ready: true, missing: [] })
    const d = await detail.GET(req('/api/admin/social/accounts/instagram_17840000000000001', { uid: 'admin1' }), {
      params: Promise.resolve({ id: 'instagram_17840000000000001' }),
    })
    expect(Object.keys(((await d.json()) as { account: object }).account)).not.toContain('accessToken')
    expect((await list.GET(req('/api/admin/social/accounts', { uid: 'editor1' }))).status).toBe(401)
    const patch = await detail.PATCH(
      req('/api/admin/social/accounts/instagram_17840000000000001', { method: 'PATCH', uid: 'admin1', origin: 'https://evil.example', body: { action: 'pause' } }),
      { params: Promise.resolve({ id: 'instagram_17840000000000001' }) },
    )
    expect(patch.status).toBe(403)
  })
})
