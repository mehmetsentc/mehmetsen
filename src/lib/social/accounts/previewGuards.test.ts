/**
 * Görev 7 — SMM test (preview) ortamı korumaları.
 * In-memory Firestore + taklit Meta uçları. Gerçek Meta / Firebase / Storage yok.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from './testing/fakeFirestore'
import { cannedMetaResponse, type RecordedCall } from './testing/fetchRecorder'

const h = vi.hoisted(() => ({
  db: null as unknown,
  users: {} as Record<string, { email: string }>,
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
      if (!h.users[uid]) throw new Error('nope')
      return { uid, email: h.users[uid].email, disabled: false }
    },
  }),
}))
vi.mock('@/lib/cmsSecrets.server', () => ({ isSuperAdminEmailServer: () => false, getBootstrapAdminUids: () => [] }))
vi.mock('@/services/metaAiRewriteService', () => ({
  rewriteForPlatform: vi.fn(async () => ({ enabled: false })),
  rewriteForSocial: vi.fn(async () => ({ enabled: false })),
  logAiRewrite: vi.fn(async () => {}),
}))
vi.mock('@/lib/social/carouselImages', () => ({
  buildSocialImagePayload: vi.fn(async () => ({ imageUrl: 'https://img.example/og.jpg', mode: 'single' })),
  materializeBrandedOgForPublish: vi.fn(async () => 'https://img.example/single.jpg'),
  resolveCarouselUrls: () => null,
}))
vi.mock('@/lib/social/tokenStore', () => ({
  getSocialTokens: vi.fn(async () => ({ fbToken: 'LEGACY_FB_TOKEN', igToken: 'LEGACY_IG_TOKEN' })),
  invalidateTokenCache: vi.fn(),
}))
vi.mock('@/lib/social/facebookCredentials', () => ({
  resolveFacebookCredentials: vi.fn(async () => ({
    mode: 'global', siteId: 'onyeditivi', pageId: '1001', accessToken: 'LEGACY_FB_TOKEN', appId: null, appName: 'Publisher', source: 'global',
  })),
}))
vi.mock('@/lib/social/facebookRateLimit', () => ({
  checkFacebookRateLimit: vi.fn(async () => ({ allowed: true })),
  recordFacebookPublish: vi.fn(async () => {}),
}))
vi.mock('@/services/newsDraftService', () => ({ ensurePublicNewsSlug: vi.fn(async () => 'antalya-tramvay') }))
vi.mock('sharp', () => ({ default: () => ({ metadata: async () => ({ width: 1200 }) }) }))

import { publishOneSocial } from '../publishOneSocial'
import { publishToFacebook } from '../facebook'
import { publishToTwitter } from '../twitter'
import { generateSocialContent } from '../aiSocialEditor'
import { getSocialTokens } from '@/lib/social/tokenStore'
import { resolveFacebookCredentials } from '@/lib/social/facebookCredentials'
import { buildEncryptedSecretRecord } from './secretStore'
import { accountIdFor, requiredPermissionsFor, type SocialAccount } from './types'
import { legacyAccountId } from './legacyLock'
import { resolveLegacyCredentials } from './resolvePublishTarget'
import { saveConnectedAccount } from './connect/connectionStore'
import { getPlatformConfigStatus, oauthBaseUrl, panelReturnUrl } from './connect/oauthConfig'
import { isSocialTestMode, socialTestEnvStatus, testModeAccountProblem } from '../testEnvironment'

// ── env sandbox ─────────────────────────────────────────────────────────────
const ENV_KEYS = [
  'VERCEL_ENV', 'SOCIAL_TEST_MODE', 'SOCIAL_TEST_FIREBASE_PROJECT_ID', 'SOCIAL_TEST_ALLOWED_ACCOUNT_IDS',
  'FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_ADMIN_PROJECT_ID', 'GCLOUD_PROJECT', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'SOCIAL_OAUTH_BASE_URL', 'NEXT_PUBLIC_APP_URL',
  'SOCIAL_FB_APP_ID', 'SOCIAL_FB_APP_SECRET', 'SECRET_ENCRYPTION_KEY', 'CMS_SESSION_SECRET', 'CRON_SECRET',
  'INSTAGRAM_BUSINESS_ID', 'THREADS_USER_ID', 'THREADS_ACCESS_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN', 'DATABASE_URL',
  'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET', 'MANUAL_EDITOR_AI_ENABLED', 'GLOBAL_CRAWLER_ENABLED',
] as const
let saved: Record<string, string | undefined> = {}

const TEST_PROJECT = 'nahaber-smm-test'
const FB_A = accountIdFor('facebook', '5551')
const FB_OTHER = accountIdFor('facebook', '5552')

function setEnv(vals: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const [k, v] of Object.entries(vals)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}
/** Hazır (doğru yapılandırılmış) preview ortamı. */
function readyPreview(extra: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}) {
  setEnv({
    VERCEL_ENV: 'preview',
    FIREBASE_SERVICE_ACCOUNT_JSON: undefined,
    FIREBASE_STORAGE_BUCKET: undefined,
    SOCIAL_TEST_FIREBASE_PROJECT_ID: TEST_PROJECT,
    FIREBASE_ADMIN_PROJECT_ID: TEST_PROJECT,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: TEST_PROJECT,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${TEST_PROJECT}.firebasestorage.app`,
    SOCIAL_OAUTH_BASE_URL: 'https://nahaber-git-smm-test.vercel.app',
    SOCIAL_TEST_ALLOWED_ACCOUNT_IDS: `${FB_A}, not-an-id`,
    ...extra,
  })
}

// ── fetch recorder ──────────────────────────────────────────────────────────
let calls: RecordedCall[] = []
let logs: string[] = []
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  calls.push({ url, method, body: init?.body ? String(init.body) : '' })
  return cannedMetaResponse(url, method)
}
const meta = () => calls.filter((c) => !c.url.startsWith('https://img.example/'))

let fs: FakeFirestore
const NOW = Date.now()
const ORIGIN = 'https://nahaber-git-smm-test.vercel.app'

function account(externalId: string): SocialAccount {
  return {
    id: accountIdFor('facebook', externalId),
    platform: 'facebook',
    externalId,
    connectionMethod: 'facebook_login',
    displayName: 'Test Sayfa',
    username: null,
    ownership: { citySlug: 'antalya', publisherId: null },
    status: 'active',
    statusReason: null,
    connectedBy: 'admin1',
    connectedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: 'admin1',
    tokenExpiresAt: null,
    tokenExpiryVerified: true,
    grantedPermissions: [...requiredPermissionsFor('facebook', 'facebook_login')],
    permissionsVerifiedAt: NOW,
    platformAccountType: null,
    facebook: { pageId: externalId },
  } as SocialAccount
}

beforeEach(async () => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
  setEnv({
    SECRET_ENCRYPTION_KEY: 'e'.repeat(64),
    CMS_SESSION_SECRET: 'test-session-secret',
    INSTAGRAM_BUSINESS_ID: '2001',
    THREADS_USER_ID: '3001',
    THREADS_ACCESS_TOKEN: 'LEGACY_TH_TOKEN',
    CRON_SECRET: 'cron-secret-value',
    X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_TOKEN_SECRET: 'ts',
  })
  fs = new FakeFirestore()
  h.db = fs
  h.users = { admin1: { email: 'me@nahaber.com' } }
  await fs.collection('users').doc('admin1').set({ role: 'managing_editor' })
  for (const ext of ['5551', '5552']) {
    const a = account(ext)
    await fs.collection('socialAccounts').doc(a.id).set({ ...a })
    await fs.collection('socialAccountSecrets').doc(a.id).set({ ...(await buildEncryptedSecretRecord(`EAAG_PAGE_${ext}`, 'facebook_page')) })
  }
  await fs.collection('news').doc('n1').set({
    title: 'Antalya’da yeni tramvay hattı hizmete açıldı',
    spot: 'Yeni hat 12 durakla şehir merkezini havalimanına bağlıyor ve günde 40 bin yolcu taşıyacak.',
    content: 'Antalya Büyükşehir Belediyesi yeni tramvay hattını hizmete açtı. Hat 12 duraktan oluşuyor.',
    citySlug: 'antalya', cityName: 'Antalya', categoryId: 'gundem',
    thumbnail: 'https://img.example/cover.jpg', slug: 'antalya-tramvay', status: 'published',
  })
  calls = []
  logs = []
  vi.mocked(getSocialTokens).mockClear()
  vi.mocked(resolveFacebookCredentials).mockClear()
  vi.stubGlobal('fetch', fakeFetch)
  vi.stubGlobal('setTimeout', ((fn: () => void) => { fn(); return 0 }) as unknown as typeof setTimeout)
  for (const lvl of ['log', 'warn', 'error', 'info'] as const) {
    vi.spyOn(console, lvl).mockImplementation((...a: unknown[]) => {
      logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '))
    })
  }
})

afterEach(() => {
  for (const s of ['EAAG_PAGE_5551', 'EAAG_PAGE_5552', 'LEGACY_FB_TOKEN', 'LEGACY_IG_TOKEN', 'LEGACY_TH_TOKEN']) {
    expect(logs.join('\n'), `log leak ${s}`).not.toContain(s)
  }
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const fbOnly = { facebook: true, instagram: false, threads: false, twitter: false }
const manual = (opts: Parameters<typeof publishOneSocial>[1]) =>
  publishOneSocial('n1', { mode: 'post', manual: true, actorUid: 'admin1', overrides: { platforms: fbOnly }, ...opts })

// ── 1. Yapılandırma denetimi ────────────────────────────────────────────────
describe('test ortamı yapılandırma denetimi', () => {
  it('production ve bayraksız ortamda devre dışı (davranış değişmez)', () => {
    expect(isSocialTestMode()).toBe(false)
    setEnv({ VERCEL_ENV: 'production' })
    expect(isSocialTestMode()).toBe(false)
    expect(socialTestEnvStatus()).toEqual({ active: false, problems: [], warnings: [], allowedAccountCount: 0 })
    expect(testModeAccountProblem(FB_OTHER)).toBeNull()
  })

  it('preview veya SOCIAL_TEST_MODE=1 etkinleştirir; hiçbir şey tanımlı değilse bütün eksikler adlarıyla', () => {
    setEnv({ SOCIAL_TEST_MODE: '1' })
    expect(isSocialTestMode()).toBe(true)
    setEnv({ SOCIAL_TEST_MODE: undefined, VERCEL_ENV: 'preview' })
    const st = socialTestEnvStatus()
    expect(st.active).toBe(true)
    expect(st.problems).toEqual([
      'SOCIAL_TEST_FIREBASE_PROJECT_ID',
      'FIREBASE_ADMIN_PROJECT_ID',
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
      'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
      'SOCIAL_OAUTH_BASE_URL',
      'SOCIAL_TEST_ALLOWED_ACCOUNT_IDS',
    ])
  })

  it('production Firebase projesine / kovasına / alan adına geri düşen yapılandırma reddedilir', () => {
    readyPreview()
    expect(socialTestEnvStatus().problems).toEqual([])
    readyPreview({ SOCIAL_TEST_FIREBASE_PROJECT_ID: 'nahaberapp', FIREBASE_ADMIN_PROJECT_ID: 'nahaberapp', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'nahaberapp', NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'nahaberapp.firebasestorage.app' })
    expect(socialTestEnvStatus().problems).toEqual([
      'SOCIAL_TEST_FIREBASE_PROJECT_ID (production projesi)',
      'FIREBASE_ADMIN_PROJECT_ID',
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
      'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    ])
    // Sunucu test projesinde ama istemci production'da → reddedilir
    readyPreview({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'nahaberapp' })
    expect(socialTestEnvStatus().problems).toEqual(['NEXT_PUBLIC_FIREBASE_PROJECT_ID'])
    // Servis hesabı JSON'u production projesine aitse (FIREBASE_ADMIN_PROJECT_ID'den önce gelir)
    readyPreview({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'nahaberapp', private_key: 'x', client_email: 'y' }) })
    expect(socialTestEnvStatus().problems).toEqual(['FIREBASE_SERVICE_ACCOUNT_JSON'])
    readyPreview({ FIREBASE_STORAGE_BUCKET: 'nahaberapp.appspot.com' })
    expect(socialTestEnvStatus().problems).toEqual(['FIREBASE_STORAGE_BUCKET'])
    for (const bad of ['https://www.nahaber.com', 'https://antalya.nahaber.com', 'http://nahaber-git-x.vercel.app', 'https://x.vercel.app/path', 'notaurl']) {
      readyPreview({ SOCIAL_OAUTH_BASE_URL: bad })
      expect(socialTestEnvStatus().problems, bad).toEqual(['SOCIAL_OAUTH_BASE_URL'])
    }
    readyPreview({ SOCIAL_TEST_ALLOWED_ACCOUNT_IDS: 'facebook_x, ../etc' })
    expect(socialTestEnvStatus().problems).toEqual(['SOCIAL_TEST_ALLOWED_ACCOUNT_IDS'])
  })

  it('uyarılar yalnızca değişken adı içerir, değer içermez', () => {
    readyPreview({ FACEBOOK_PAGE_ACCESS_TOKEN: 'EAAG_SECRET_VALUE', DATABASE_URL: 'postgres://user:pw@host/db', MANUAL_EDITOR_AI_ENABLED: 'true', GLOBAL_CRAWLER_ENABLED: 'false' })
    const st = socialTestEnvStatus()
    expect(st.warnings).toEqual(['FACEBOOK_PAGE_ACCESS_TOKEN', 'THREADS_ACCESS_TOKEN', 'X_ACCESS_TOKEN', 'DATABASE_URL', 'MANUAL_EDITOR_AI_ENABLED'])
    expect(JSON.stringify(st)).not.toMatch(/EAAG_SECRET_VALUE|postgres:|pw@|LEGACY_TH_TOKEN/)
    expect(st.allowedAccountCount).toBe(1)
  })
})

// ── 2. OAuth callback kökü ──────────────────────────────────────────────────
describe('callback kökü güvenilir test yapılandırmasından', () => {
  it('test modunda NEXT_PUBLIC_APP_URL / site URL’sine düşmez; yalnızca SOCIAL_OAUTH_BASE_URL', () => {
    setEnv({ VERCEL_ENV: 'preview', NEXT_PUBLIC_APP_URL: 'https://www.nahaber.com', SOCIAL_FB_APP_ID: '123456789', SOCIAL_FB_APP_SECRET: 'x' })
    expect(oauthBaseUrl()).toBeNull()
    const st = getPlatformConfigStatus('facebook')
    expect(st.ready).toBe(false)
    expect(st.redirectUri).toBeNull()
    expect(st.missing).toEqual(expect.arrayContaining(['SOCIAL_OAUTH_BASE_URL', 'SOCIAL_TEST_FIREBASE_PROJECT_ID']))
    // Güvenilir kök yoksa panele dönüş göreli yoldur (production sitesine gitmez)
    expect(panelReturnUrl({ social: 'x' })).toBe('/admin/social?panel=accounts&social=x')
    readyPreview({ NEXT_PUBLIC_APP_URL: 'https://www.nahaber.com', SOCIAL_FB_APP_ID: '123456789', SOCIAL_FB_APP_SECRET: 'x' })
    const ok = getPlatformConfigStatus('facebook')
    expect(ok.ready).toBe(true)
    expect(ok.redirectUri).toBe(`${ORIGIN}/api/admin/social/oauth/facebook/callback`)
  })

  it('production davranışı aynı: SOCIAL_OAUTH_BASE_URL yoksa site URL’si', () => {
    setEnv({ VERCEL_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://www.nahaber.com' })
    expect(oauthBaseUrl()).toBe('https://www.nahaber.com')
  })
})

// ── 3. Legacy / otomatik / X kapalı; hedef izin listesi sunucuda ───────────
describe('test ortamında yayın sınırları', () => {
  it('legacy Onyeditivi kimlik bilgileri hiç okunmaz; hedefsiz yayın reddedilir', async () => {
    readyPreview()
    expect(await resolveLegacyCredentials('facebook')).toBeNull()
    expect(await resolveLegacyCredentials('threads')).toBeNull()
    expect(await legacyAccountId('instagram')).toBeNull()
    const r = await publishToFacebook({ newsId: 'n1', title: 't', imageUrl: 'https://img.example/og.jpg' }, undefined, { trigger: 'cron' })
    expect(r).toMatchObject({ success: false, code: 'test_env_legacy_disabled' })
    const c = await publishOneSocial('n1', { mode: 'post', manual: true, actorUid: 'admin1', overrides: { platforms: fbOnly } })
    expect(c.skipped).toBe(true)
    expect(getSocialTokens).not.toHaveBeenCalled()
    expect(resolveFacebookCredentials).not.toHaveBeenCalled()
    expect(meta()).toEqual([])
    expect(fs.docs('socialPublishRecords')).toHaveLength(0)
  })

  it('yapılandırma eksikse izin listesindeki hesaba bile yayın yok', async () => {
    readyPreview({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'nahaberapp' })
    const r = await manual({ targets: { facebook: FB_A } })
    expect(r.skipped).toBe(true)
    expect(r.reason).toMatch(/yapılandırması eksik/)
    expect(calls).toEqual([])
  })

  it('CMS after() / otomatik çağrı (manual değil) ve X kapalı', async () => {
    readyPreview()
    const auto = await publishOneSocial('n1')
    expect(auto).toMatchObject({ skipped: true })
    expect(auto.reason).toMatch(/otomatik/)
    const x = await manual({ targets: { facebook: FB_A }, overrides: { platforms: { ...fbOnly, twitter: true } } })
    expect(x.skipped).toBe(true)
    expect(await publishToTwitter({ newsId: 'n1', title: 't' })).toMatchObject({ success: false, code: 'test_env_twitter_disabled' })
    expect(calls).toEqual([])
  })

  it('izin listesi dışındaki hesap sunucuda reddedilir (ledger kaydı da açılmaz); listedeki hesaba manuel yayın yapılır', async () => {
    readyPreview()
    const denied = await manual({ targets: { facebook: FB_OTHER } })
    expect(denied.post?.facebook).toMatchObject({ success: false, code: 'test_env_target_not_allowed' })
    expect(meta()).toEqual([])
    expect(fs.docs('socialPublishRecords')).toHaveLength(0)
    const ok = await manual({ targets: { facebook: FB_A } })
    expect(ok.post?.facebook).toMatchObject({ success: true, accountId: FB_A })
    expect(meta().some((c) => c.url.includes('/5551/photos'))).toBe(true)
    expect(meta().some((c) => c.url.includes('/5552/') || c.url.includes('/1001/'))).toBe(false)
  })

  it('force-reshare rotası da aynı sınırı uygular (409, yayın yok)', async () => {
    readyPreview()
    const { POST } = await import('@/app/api/admin/social/force-reshare/route')
    const res = await POST(new Request(`${ORIGIN}/api/admin/social/force-reshare`, {
      method: 'POST',
      headers: { authorization: 'Bearer tok-admin1', origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['n1'], mode: 'post', manual: true, force: false, headline: 'Antalya’da tramvay hattı açıldı', platforms: fbOnly, targets: { facebook: FB_OTHER } }),
    }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'test_env_target_not_allowed' })
    expect(meta()).toEqual([])
  })

  it('OAuth bağlantısı yalnızca izin listesindeki hesabı kaydeder', async () => {
    readyPreview()
    const base = {
      platform: 'facebook' as const, connectionMethod: 'facebook_login' as const, displayName: 'X', username: null, platformAccountType: null,
      accessToken: 'EAAG_NEW_TOKEN', tokenType: 'facebook_page' as const, tokenExpiresAt: null, tokenExpiryVerified: true,
      grantedPermissions: [...requiredPermissionsFor('facebook', 'facebook_login')], permissionsVerifiedAt: NOW,
      ownership: { citySlug: 'antalya', publisherId: null }, reconnectAccountId: null, actorUid: 'admin1', now: NOW,
    }
    const denied = await saveConnectedAccount({ ...base, externalId: '7777' })
    expect(denied).toMatchObject({ ok: false, code: 'test_account_not_allowed' })
    expect(fs.store.has(`socialAccounts/${accountIdFor('facebook', '7777')}`)).toBe(false)
    expect(fs.store.has(`socialAccountSecrets/${accountIdFor('facebook', '7777')}`)).toBe(false)
  })

  it('sosyal AI metin üretimi çağrılmaz', async () => {
    readyPreview({ MANUAL_EDITOR_AI_ENABLED: 'true' })
    expect(await generateSocialContent('Başlık', 'Metin', 'Antalya')).toBeNull()
  })
})

// ── 4. Cron ve legacy token uçları ─────────────────────────────────────────
describe('test ortamında cron ve legacy token uçları', () => {
  it('sosyal cron 503 döner, hiçbir şey okumaz/yayımlamaz', async () => {
    readyPreview()
    const { GET } = await import('@/app/api/cron/social/route')
    const res = await GET(new Request(`${ORIGIN}/api/cron/social`, { headers: { authorization: 'Bearer cron-secret-value' } }))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'test_env_auto_disabled' })
    expect(resolveFacebookCredentials).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('legacy token / tanılama / eski test uçları 403 döner, token okunmaz', async () => {
    readyPreview()
    const routes = [
      ['@/app/api/admin/social/diagnose/route', 'GET'],
      ['@/app/api/admin/social/token/route', 'GET'],
      ['@/app/api/admin/social/token/route', 'POST'],
      ['@/app/api/admin/social/facebook-app/route', 'GET'],
      ['@/app/api/admin/social/facebook-app/callback/route', 'GET'],
      ['@/app/api/social/facebook/route', 'POST'],
      ['@/app/api/social/instagram/route', 'POST'],
      ['@/app/api/social/test/route', 'GET'],
    ] as const
    for (const [path, method] of routes) {
      const mod = (await import(path)) as Record<string, (r: Request) => Promise<Response>>
      const res = await mod[method](new Request(`${ORIGIN}/x`, { method, headers: { authorization: 'Bearer cron-secret-value' } }))
      expect(res.status, `${path} ${method}`).toBe(403)
      expect(await res.json()).toMatchObject({ code: 'test_env_legacy_disabled' })
    }
    expect(getSocialTokens).not.toHaveBeenCalled()
    expect(resolveFacebookCredentials).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('production’da (bayrak yok) aynı uçlar eskisi gibi çalışır: legacy yayın Onyeditivi’ye gider', async () => {
    setEnv({ VERCEL_ENV: 'production' })
    const r = await publishToFacebook({ newsId: 'n1', title: 'Antalya’da tramvay', imageUrl: 'https://img.example/og.jpg', articleUrl: 'https://www.nahaber.com/haber/x' }, undefined, { trigger: 'cron' })
    expect(r).toMatchObject({ success: true })
    expect(meta().some((c) => c.url.includes('/1001/photos'))).toBe(true)
  })
})
