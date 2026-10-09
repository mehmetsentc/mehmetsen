/**
 * Görev 5 — manuel yayın güvenliği.
 *
 * Legacy (Onyeditivi) ortak kilidi, biçim/görsel politikası, belirsiz sonuç
 * onayı ve log/yanıt/denetim kaydında sır sızıntısı.
 * In-memory Firestore + taklit Meta uçları. Gerçek Meta / Firebase / Storage yok.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from './testing/fakeFirestore'
import { cannedMetaResponse, accessTokenOf, type RecordedCall } from './testing/fetchRecorder'

const h = vi.hoisted(() => ({
  db: null as unknown,
  users: {} as Record<string, { email: string }>,
  imagePayload: null as null | { imageUrl: string; imageUrls?: string[]; mode: 'single' | 'carousel' },
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
vi.mock('@/lib/social/aiSocialEditor', () => ({
  generateSocialContent: vi.fn(async () => ({
    headline: 'Antalya’da tramvay hattı açıldı',
    storySummary: 'Yeni hat 12 durakla şehir merkezini havalimanına bağlıyor.',
    caption: 'Yeni tramvay hattı 12 durakla şehir merkezini havalimanına bağlıyor.',
    hashtags: ['#Antalya'],
    altText: 'Tramvay',
  })),
}))
vi.mock('@/lib/social/carouselImages', () => ({
  buildSocialImagePayload: vi.fn(async () => h.imagePayload ?? { imageUrl: 'https://img.example/og.jpg', mode: 'single' }),
  materializeBrandedOgForPublish: vi.fn(async (_u: string, _n: string, _c: string, kind: string) =>
    kind === 'story' ? 'https://img.example/story.jpg' : 'https://img.example/single.jpg'),
  resolveCarouselUrls: (p: { imageUrls?: string[] }) =>
    Array.isArray(p.imageUrls) && p.imageUrls.length >= 2 ? p.imageUrls : null,
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
vi.mock('@/lib/social/twitter', () => ({ publishToTwitter: vi.fn(async () => ({ success: false, error: 'x not configured' })) }))
vi.mock('@/services/newsDraftService', () => ({ ensurePublicNewsSlug: vi.fn(async () => 'antalya-tramvay') }))
vi.mock('sharp', () => ({ default: () => ({ metadata: async () => ({ width: 1200 }) }) }))

import { publishOneSocial } from '../publishOneSocial'
import { publishToFacebook, publishFacebookStory } from '../facebook'
import { publishToThreads } from '../threads'
import { publishToInstagram, publishInstagramStory } from '../instagram'
import { buildSocialImagePayload, materializeBrandedOgForPublish } from '@/lib/social/carouselImages'
import { buildEncryptedSecretRecord, buildLegacySecretRecord } from './secretStore'
import { accountIdFor, requiredPermissionsFor, type SocialAccount } from './types'
import { FACEBOOK_GRAPH_BASE, THREADS_GRAPH_BASE } from '../graphConfig'
import { classifyOutcome } from './publishLedger'
import { isVerifiedPublish } from './legacyLock'
import { publishableKinds, imageModeProblem } from './capabilities'
import { singleImageGuard, singleCoverPayload } from '../imagePolicy'
import { redactSecrets } from '../redact'
import { platformError, safeErrorText, sanitizeFreeText, socialLog } from '../safeLog'

// ── fetch with failure injection ────────────────────────────────────────────
const LEAK = 'EAAGLEAKTOKEN0123456789abcdefXYZ'
let calls: RecordedCall[] = []
let logs: string[] = []
type Fail = 'throw' | 'throw_leak' | 'reject_leak' | 'server' | null
let failRule: ((url: string, method: string, body: string) => Fail) | null = null
/** Runs before the canned answer (simulates something happening while the platform call is in flight). */
let onCall: ((url: string, method: string) => Promise<void>) | null = null
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  const body = init?.body ? String(init.body) : ''
  calls.push({ url, method, body })
  if (onCall) await onCall(url, method)
  const f = failRule?.(url, method, body)
  if (f === 'throw') throw new TypeError('fetch failed')
  if (f === 'throw_leak') {
    throw new TypeError(`fetch failed for ${FACEBOOK_GRAPH_BASE}/1001/photos?access_token=${LEAK}&appsecret_proof=deadbeef`)
  }
  if (f === 'reject_leak') {
    return new Response(JSON.stringify({
      error: {
        message: `Invalid OAuth access token ${LEAK} (request ${FACEBOOK_GRAPH_BASE}/me?access_token=${LEAK}&client_secret=s3cr3t)`,
        error_user_msg: `token=${LEAK}`,
        code: 190, error_subcode: 463, type: 'OAuthException', fbtrace_id: 'AbC123',
      },
    }), { status: 400 })
  }
  if (f === 'server') {
    return new Response(JSON.stringify({ error: { message: `An unknown error occurred ${LEAK}`, code: 2, type: 'OAuthException' } }), { status: 500 })
  }
  return cannedMetaResponse(url, method)
}
const meta = (c: RecordedCall[]) => c.filter((x) => !x.url.startsWith('https://img.example/'))
const posts = (suffix: string) => meta(calls).filter((c) => c.method === 'POST' && c.url.endsWith(suffix))

// ── fixtures ────────────────────────────────────────────────────────────────
let fs: FakeFirestore
const NOW = Date.now()
const ORIGIN = 'https://www.nahaber.com'
const SECRETS = ['EAAG_PAGE_A', 'EAAG_PAGE_B', 'THQ_TOKEN_A', 'LEGACY_FB_TOKEN', 'LEGACY_IG_TOKEN', 'LEGACY_TH_TOKEN', LEAK, 's3cr3t', 'deadbeef']

function account(over: Partial<SocialAccount> & Pick<SocialAccount, 'platform' | 'externalId' | 'connectionMethod'>): SocialAccount {
  const platformPart =
    over.platform === 'facebook'
      ? { facebook: { pageId: over.externalId } }
      : over.platform === 'instagram'
        ? { instagram: { igUserId: over.externalId, linkedFacebookPageId: null } }
        : { threads: { threadsUserId: over.externalId } }
  return {
    id: accountIdFor(over.platform, over.externalId),
    displayName: 'Test',
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
    grantedPermissions: over.connectionMethod === 'legacy' ? null : [...requiredPermissionsFor(over.platform, over.connectionMethod)],
    permissionsVerifiedAt: over.connectionMethod === 'legacy' ? null : NOW,
    platformAccountType: over.platform === 'instagram' ? 'BUSINESS' : null,
    ...platformPart,
    ...over,
  } as SocialAccount
}

async function seed(a: SocialAccount, token: string, type: 'facebook_page' | 'instagram_user' | 'threads_user') {
  await fs.collection('socialAccounts').doc(a.id).set({ ...a })
  await fs.collection('socialAccountSecrets').doc(a.id).set({ ...(await buildEncryptedSecretRecord(token, type)) })
}

const FB_A = account({ platform: 'facebook', externalId: '5551', connectionMethod: 'facebook_login' })
const FB_B = account({ platform: 'facebook', externalId: '5552', connectionMethod: 'facebook_login', ownership: { citySlug: 'ankara', publisherId: null } })
const TH_A = account({ platform: 'threads', externalId: '8881', connectionMethod: 'threads_oauth' })
const FB_LEGACY = account({ platform: 'facebook', externalId: '1001', connectionMethod: 'legacy', ownership: { citySlug: 'canakkale', publisherId: null } })
const LEGACY_FB_ID = accountIdFor('facebook', '1001')

async function seedNews(id = 'n1', extra: Record<string, unknown> = {}) {
  await fs.collection('news').doc(id).set({
    title: 'Antalya’da yeni tramvay hattı hizmete açıldı',
    spot: 'Yeni hat 12 durakla şehir merkezini havalimanına bağlıyor ve günde 40 bin yolcu taşıyacak.',
    content: 'Antalya Büyükşehir Belediyesi yeni tramvay hattını hizmete açtı. Hat 12 duraktan oluşuyor ve günlük 40 bin yolcu kapasitesine sahip.',
    citySlug: 'antalya',
    cityName: 'Antalya',
    categoryId: 'gundem',
    thumbnail: 'https://img.example/cover.jpg',
    images: ['https://img.example/cover.jpg', 'https://img.example/b.jpg', 'https://img.example/c.jpg'],
    slug: 'antalya-tramvay',
    status: 'published',
    ...extra,
  })
}

beforeEach(async () => {
  fs = new FakeFirestore()
  h.db = fs
  h.imagePayload = null
  h.users = { admin1: { email: 'me@nahaber.com' }, editor1: { email: 'ed@nahaber.com' } }
  await fs.collection('users').doc('admin1').set({ role: 'managing_editor' })
  await fs.collection('users').doc('editor1').set({ role: 'editor' })
  process.env.SECRET_ENCRYPTION_KEY = 'e'.repeat(64)
  process.env.NEXT_PUBLIC_APP_URL = ORIGIN
  process.env.SOCIAL_OAUTH_BASE_URL = ORIGIN
  process.env.INSTAGRAM_BUSINESS_ID = '2001'
  process.env.THREADS_USER_ID = '3001'
  process.env.THREADS_ACCESS_TOKEN = 'LEGACY_TH_TOKEN'
  await seed(FB_A, 'EAAG_PAGE_A', 'facebook_page')
  await seed(FB_B, 'EAAG_PAGE_B', 'facebook_page')
  await seed(TH_A, 'THQ_TOKEN_A', 'threads_user')
  await seedNews()
  calls = []
  logs = []
  failRule = null
  onCall = null
  vi.mocked(buildSocialImagePayload).mockClear()
  vi.mocked(materializeBrandedOgForPublish).mockClear()
  vi.stubGlobal('fetch', fakeFetch)
  vi.stubGlobal('setTimeout', ((fn: () => void) => { fn(); return 0 }) as unknown as typeof setTimeout)
  for (const lvl of ['log', 'warn', 'error', 'info'] as const) {
    vi.spyOn(console, lvl).mockImplementation((...a: unknown[]) => {
      logs.push(a.map((x) => (typeof x === 'string' ? x : x instanceof Error ? `${x.name}: ${x.message}` : JSON.stringify(x))).join(' '))
    })
  }
})

afterEach(() => {
  // Hiçbir yolda (hedefli + legacy) sır: log, Firestore (ledger/denetim/haber) düz metin.
  const allLogs = logs.join('\n')
  for (const s of SECRETS) expect(allLogs, `log leak ${s}`).not.toContain(s)
  expect(allLogs).not.toMatch(/access_token=|client_secret=|appsecret_proof=/)
  for (const [path, doc] of fs.store) {
    const raw = JSON.stringify(doc)
    for (const s of SECRETS) expect(raw, `firestore plaintext ${s} in ${path}`).not.toContain(s)
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const fbOnly = { facebook: true, instagram: false, threads: false, twitter: false }
const legacyComposer = (opts: Parameters<typeof publishOneSocial>[1] = {}) =>
  publishOneSocial('n1', { mode: 'post', manual: true, overrides: { platforms: fbOnly }, ...opts })
const targeted = (opts: Parameters<typeof publishOneSocial>[1]) =>
  publishOneSocial('n1', { mode: 'post', manual: true, actorUid: 'admin1', overrides: { platforms: fbOnly }, ...opts })
const basePayload = {
  newsId: 'n1',
  title: 'Antalya’da tramvay hattı açıldı',
  description: 'Yeni hat 12 durakla şehir merkezini havalimanına bağlıyor.',
  imageUrl: 'https://img.example/og.jpg',
  articleUrl: 'https://www.nahaber.com/haber/antalya-tramvay',
  hashtags: ['#Antalya'],
  cityName: 'Antalya',
}
const ledger = (accountId: string, format = 'post') => fs.store.get(`socialPublishRecords/n1__${accountId}__${format}`) as Record<string, unknown> | undefined
const news = () => fs.store.get('news/n1') as Record<string, unknown>

// ── 1. Legacy ortak kilit ───────────────────────────────────────────────────
describe('legacy (Onyeditivi) ortak yayın kilidi', () => {
  it('composer + cron + after() eşzamanlı → tek Facebook yayını', async () => {
    const results = await Promise.all([
      legacyComposer(),
      publishToFacebook(basePayload, undefined, { trigger: 'cron' }),
      publishToFacebook(basePayload, undefined, { trigger: 'after' }),
      publishToFacebook(basePayload, undefined, { trigger: 'api_social' }),
    ])
    expect(posts('/1001/photos')).toHaveLength(1)
    const direct = results.slice(1) as Array<{ success: boolean; code?: string }>
    const composer = (results[0] as Awaited<ReturnType<typeof publishOneSocial>>).post?.facebook
    const all = [composer!, ...direct]
    expect(all.filter((r) => r.success)).toHaveLength(1)
    for (const r of all.filter((x) => !x.success)) expect(['in_progress', 'already_published']).toContain(r.code)
    expect(ledger(LEGACY_FB_ID)).toMatchObject({ status: 'succeeded', externalPostId: 'fb-post-1', attempts: 1 })
  })

  it('legacy çağrı ile aynı dış hesaba açık hedef (legacy hesap kaydı) aynı kilidi paylaşır', async () => {
    await fs.collection('socialAccounts').doc(FB_LEGACY.id).set({ ...FB_LEGACY })
    await fs.collection('socialAccountSecrets').doc(FB_LEGACY.id).set({ ...buildLegacySecretRecord('facebook') })
    expect(FB_LEGACY.id).toBe(LEGACY_FB_ID)
    const [a, b] = await Promise.all([
      legacyComposer(),
      targeted({ targets: { facebook: FB_LEGACY.id } }),
    ])
    expect(posts('/1001/photos')).toHaveLength(1)
    const codes = [a.post?.facebook, b.post?.facebook].map((r) => (r?.success ? 'ok' : r?.code)).sort()
    expect(codes[1]).toBe('ok')
    expect(['in_progress', 'already_published']).toContain(codes[0])
    expect(fs.docs('socialPublishRecords').map((d) => d.id)).toEqual([`n1__${LEGACY_FB_ID}__post`])
    // Onyeditivi alanı (eski tüketiciler) güncel kalır.
    expect(news()).toMatchObject({ facebookPostId: 'fb-post-1', socialPublished: true })
  })

  it('legacy yayından sonra açık legacy-hedef: yeniden yayın yok, kimlik uzlaştırılır', async () => {
    await fs.collection('socialAccounts').doc(FB_LEGACY.id).set({ ...FB_LEGACY })
    await fs.collection('socialAccountSecrets').doc(FB_LEGACY.id).set({ ...buildLegacySecretRecord('facebook') })
    await legacyComposer()
    // Haber alanı başka bir süreçte kaybolmuş olsun (ör. yazım hatası) — ledger yine bilir.
    await fs.collection('news').doc('n1').update({ facebookPostId: null, socialPublished: false })
    calls = []
    const r = await targeted({ targets: { facebook: FB_LEGACY.id } })
    expect(meta(calls)).toEqual([])
    expect(r.post?.facebook).toMatchObject({ success: false, code: 'already_published', platformId: 'fb-post-1' })
    expect(isVerifiedPublish(r.post?.facebook)).toBe(true)
    expect(news()).toMatchObject({ facebookPostId: 'fb-post-1', socialPublished: true })
  })

  it('farklı hesaplar bağımsız: legacy + FB_A + FB_B aynı anda ayrı ayrı yayımlanır', async () => {
    const [l, a, b] = await Promise.all([
      legacyComposer(),
      targeted({ targets: { facebook: FB_A.id } }),
      targeted({ targets: { facebook: FB_B.id } }),
    ])
    expect([l, a, b].every((r) => r.post?.facebook.success)).toBe(true)
    expect(posts('/1001/photos')).toHaveLength(1)
    expect(posts('/5551/photos')).toHaveLength(1)
    expect(posts('/5552/photos')).toHaveLength(1)
    // Hedefli başka hesap Onyeditivi alanlarını değiştirmez — legacy alanı legacy yayından gelir.
    expect(news().facebookPostId).toBe('fb-post-1')
    expect(ledger(FB_A.id)).toMatchObject({ status: 'succeeded' })
  })

  it('hedefli başka hesap yayını Onyeditivi alanlarına dokunmaz', async () => {
    const r = await targeted({ targets: { facebook: FB_A.id } })
    expect(r.post?.facebook.success).toBe(true)
    expect(news()).not.toHaveProperty('facebookPostId')
    expect(news().socialPublished).not.toBe(true)
  })

  it('aktif kilit force ile aşılmaz (legacy ve hedefli)', async () => {
    for (const id of [LEGACY_FB_ID, FB_A.id]) {
      await fs.collection('socialPublishRecords').doc(`n1__${id}__post`).set({
        newsId: 'n1', accountId: id, platform: 'facebook', format: 'post', status: 'publishing', attemptId: 'live', attempts: 1,
        leaseUntil: Date.now() + 60_000, externalPostId: null, errorCode: null, updatedAt: 0, updatedBy: 'system', history: [],
      })
    }
    const l = await legacyComposer({ force: true })
    const t = await targeted({ force: true, targets: { facebook: FB_A.id } })
    const d = await publishToFacebook(basePayload, undefined, { force: true, trigger: 'cron' })
    expect(l.post?.facebook).toMatchObject({ success: false, code: 'in_progress' })
    expect(t.post?.facebook).toMatchObject({ success: false, code: 'in_progress' })
    expect(d).toMatchObject({ success: false, code: 'in_progress' })
    expect(meta(calls)).toEqual([])
    expect(ledger(LEGACY_FB_ID)).toMatchObject({ status: 'publishing', attemptId: 'live' })
  })

  it('eski haber alanındaki başarı yeniden yayın üretmez; eski kayıt silinmez / backfill yok', async () => {
    await fs.collection('news').doc('n1').update({ facebookPostId: 'old-onyeditivi-post', socialPublished: true })
    const d = await publishToFacebook(basePayload, undefined, { trigger: 'cron' })
    const c = await legacyComposer()
    expect(d).toMatchObject({ success: false, code: 'already_published', platformId: 'old-onyeditivi-post' })
    // Composer eski haber bayrağıyla zaten atlar ya da ledger "zaten yayımlandı" döner — iki durumda da yayın yok.
    if (c.post) expect(c.post.facebook).toMatchObject({ success: false, code: 'already_published' })
    else expect(c.skipped).toBe(true)
    expect(meta(calls)).toEqual([])
    expect(news()).toMatchObject({ facebookPostId: 'old-onyeditivi-post' })
    expect(fs.docs('socialPublishRecords')).toHaveLength(0)
  })

  it('süresi dolmuş legacy kilit belirsiz kalır; otomatik tekrar yok', async () => {
    await fs.collection('socialPublishRecords').doc(`n1__${LEGACY_FB_ID}__post`).set({
      newsId: 'n1', accountId: LEGACY_FB_ID, platform: 'facebook', format: 'post', status: 'publishing', attemptId: 'dead', attempts: 1,
      leaseUntil: Date.now() - 1, externalPostId: null, errorCode: null, updatedAt: 0, updatedBy: 'system', history: [],
    })
    const first = await publishToFacebook(basePayload, undefined, { trigger: 'cron' })
    const forced = await legacyComposer({ force: true })
    expect(first).toMatchObject({ success: false, code: 'uncertain_previous_attempt' })
    expect(forced.post?.facebook).toMatchObject({ success: false, code: 'uncertain_previous_attempt' })
    expect(ledger(LEGACY_FB_ID)).toMatchObject({ status: 'uncertain', errorCode: 'lease_expired' })
    expect(meta(calls)).toEqual([])
  })

  it('kaybolan platform cevabı (legacy) belirsiz; sonraki cron/composer tekrar yayımlamaz', async () => {
    failRule = (url) => (url.endsWith('/1001/photos') ? 'throw_leak' : null)
    const r = await legacyComposer()
    expect(r.post?.facebook).toMatchObject({ success: false, ledgerStatus: 'uncertain' })
    expect(r.post?.facebook.error).not.toContain(LEAK)
    expect(ledger(LEGACY_FB_ID)).toMatchObject({ status: 'uncertain' })
    failRule = null
    calls = []
    expect(await publishToFacebook(basePayload, undefined, { trigger: 'cron' })).toMatchObject({ code: 'uncertain_previous_attempt' })
    expect((await legacyComposer({ force: true })).post?.facebook).toMatchObject({ code: 'uncertain_previous_attempt' })
    expect(meta(calls)).toEqual([])
    // Kimliksiz sonuç haber belgesine kimlik yazmaz (force alan sıfırlaması FakeFirestore'da sentinel olarak kalır).
    expect(typeof news().facebookPostId).not.toBe('string')
    expect(news().socialPublished).not.toBe(true)
  })

  it('platform 5xx / kod 2 belirsiz sayılır (gönderi kabul edilmiş olabilir)', async () => {
    failRule = (url) => (url.endsWith('/5551/photos') ? 'server' : null)
    const r = await targeted({ targets: { facebook: FB_A.id } })
    expect(r.post?.facebook).toMatchObject({ success: false, ledgerStatus: 'uncertain', code: 'platform_server_error' })
    expect(r.post?.facebook.error).not.toContain(LEAK)
    expect(posts('/5551/photos')).toHaveLength(1)
    expect(classifyOutcome({ success: false, error: 'Facebook fotoğraf paylaşımı reddedildi (HTTP 503)' }, false)).toMatchObject({ status: 'uncertain' })
    expect(classifyOutcome({ success: false, error: 'Facebook fotoğraf paylaşımı reddedildi (HTTP 400, kod 1)' }, false)).toMatchObject({ status: 'uncertain' })
    expect(classifyOutcome({ success: false, error: 'Facebook fotoğraf paylaşımı reddedildi (HTTP 400, kod 100/33)' }, false)).toMatchObject({ status: 'failed' })
    expect(classifyOutcome({ success: false, error: 'Facebook fotoğraf paylaşımı reddedildi (HTTP 400, kod 190/463)' }, false)).toMatchObject({ status: 'failed' })
  })
})

// ── 2. Belirsiz kaydın kapsamlı onayı ───────────────────────────────────────
describe('belirsiz sonuç — "Platformda kontrol ettim, yeniden yayımla"', () => {
  const req = (id: string, body: unknown, uid = 'admin1', origin: string | null = ORIGIN) =>
    new Request(`${ORIGIN}/api/admin/social/publish-records/${id}/republish`, {
      method: 'POST',
      headers: { authorization: `Bearer tok-${uid}`, ...(origin ? { origin } : {}), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  const att = (accountId: string) => String(ledger(accountId)!.attemptId)
  const call = async (id: string, body: unknown, uid?: string, origin?: string | null) => {
    const { POST } = await import('@/app/api/admin/social/publish-records/[id]/republish/route')
    return POST(req(id, body, uid, origin), { params: Promise.resolve({ id }) })
  }

  async function makeUncertain() {
    failRule = (url) => (url.endsWith('/photos') ? 'throw' : null)
    await legacyComposer()
    await targeted({ targets: { facebook: FB_A.id } })
    failRule = null
    calls = []
    expect(ledger(LEGACY_FB_ID)).toMatchObject({ status: 'uncertain' })
    expect(ledger(FB_A.id)).toMatchObject({ status: 'uncertain' })
  }

  it('liste yalnızca yöneticiye; hesap/platform/içerik bilgisi döner, sır yok', async () => {
    await makeUncertain()
    const { GET } = await import('@/app/api/admin/social/publish-records/route')
    const denied = await GET(new Request(`${ORIGIN}/api/admin/social/publish-records`, { headers: { authorization: 'Bearer tok-editor1' } }))
    expect([401, 403]).toContain(denied.status)
    const res = await GET(new Request(`${ORIGIN}/api/admin/social/publish-records`, { headers: { authorization: 'Bearer tok-admin1' } }))
    const text = await res.text()
    for (const s of SECRETS) expect(text).not.toContain(s)
    const { records } = JSON.parse(text) as { records: Array<Record<string, unknown>> }
    expect(records.map((r) => r.id).sort()).toEqual([`n1__${FB_A.id}__post`, `n1__${LEGACY_FB_ID}__post`].sort())
    const legacy = records.find((r) => r.accountId === LEGACY_FB_ID)!
    expect(legacy).toMatchObject({ platform: 'facebook', format: 'post', isLegacyAccount: true, accountLabel: 'Onyeditivi (mevcut bağlantı)' })
    expect(String(legacy.newsTitle)).toContain('tramvay')
    expect(legacy.attemptId).toBe(att(LEGACY_FB_ID))
  })

  it('onay yalnızca seçilen kayda uygulanır; yetki, origin ve açık onay zorunlu; denetim kaydı yazılır', async () => {
    await makeUncertain()
    const ok = { confirm: 'checked_on_platform', attemptId: att(LEGACY_FB_ID) }
    expect((await call(`n1__${LEGACY_FB_ID}__post`, { attemptId: att(LEGACY_FB_ID) })).status).toBe(400)
    expect((await call(`n1__${LEGACY_FB_ID}__post`, { confirm: 'checked_on_platform' })).status).toBe(400)
    expect([401, 403]).toContain((await call(`n1__${LEGACY_FB_ID}__post`, ok, 'editor1')).status)
    expect((await call(`n1__${LEGACY_FB_ID}__post`, ok, 'admin1', 'https://evil.example')).status).toBe(403)
    expect((await call(`n1__${LEGACY_FB_ID}__story`, ok)).status).toBe(404)
    // Başka kaydın / eski denemenin kimliği → kayıt değişmiş sayılır
    const stale = await call(`n1__${LEGACY_FB_ID}__post`, { confirm: 'checked_on_platform', attemptId: att(FB_A.id) })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ code: 'stale_record' })
    expect(meta(calls)).toEqual([])

    const res = await call(`n1__${LEGACY_FB_ID}__post`, ok)
    const text = await res.text()
    expect(res.status).toBe(200)
    for (const s of SECRETS) expect(text).not.toContain(s)
    expect(JSON.parse(text).result).toMatchObject({ success: true, platformId: 'fb-post-1', ledgerStatus: 'succeeded' })
    expect(posts('/1001/photos')).toHaveLength(1)
    expect(posts('/5551/photos')).toHaveLength(0)
    expect(ledger(LEGACY_FB_ID)).toMatchObject({ status: 'succeeded', externalPostId: 'fb-post-1' })
    // Diğer hesabın belirsiz kaydı aynen kalır (genel bayrak yok).
    expect(ledger(FB_A.id)).toMatchObject({ status: 'uncertain' })
    expect(news()).toMatchObject({ facebookPostId: 'fb-post-1' })
    const audit = fs.docs('cmsAuditLogs').map((d) => d.data).find((a) => a.action === 'social.publish.uncertain_ack')
    expect(audit).toMatchObject({ actorId: 'admin1', entityId: LEGACY_FB_ID, meta: { recordId: `n1__${LEGACY_FB_ID}__post`, attemptId: ok.attemptId, platform: 'facebook', previousState: 'uncertain', legacyAccount: true } })
    // Önceki deneme geçmişte korunur.
    const hist = ledger(LEGACY_FB_ID)!.history as Array<{ attemptId: string; status: string }>
    expect(hist.map((x) => x.status)).toEqual(['uncertain', 'succeeded'])
    expect(hist[0].attemptId).toBe(ok.attemptId)

    // Artık belirsiz değil → ikinci onay (yeni deneme kimliğiyle bile) yeniden yayımlamaz.
    calls = []
    expect((await call(`n1__${LEGACY_FB_ID}__post`, { confirm: 'checked_on_platform', attemptId: att(LEGACY_FB_ID) })).status).toBe(409)
    expect(meta(calls)).toEqual([])
  })

  it('güncel hesap durumu yeniden doğrulanır: duraklatılmış hedef hesap için yayın yok', async () => {
    await makeUncertain()
    await fs.collection('socialAccounts').doc(FB_A.id).update({ status: 'paused' })
    const res = await call(`n1__${FB_A.id}__post`, { confirm: 'checked_on_platform', attemptId: att(FB_A.id) })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'paused' })
    expect(meta(calls)).toEqual([])
    expect(ledger(FB_A.id)).toMatchObject({ status: 'uncertain' })
  })

  it('canlı kilit varken onay yayın yapmaz', async () => {
    await fs.collection('socialPublishRecords').doc(`n1__${FB_A.id}__post`).set({
      newsId: 'n1', accountId: FB_A.id, platform: 'facebook', format: 'post', status: 'publishing', attemptId: 'abcdef01', attempts: 1,
      leaseUntil: Date.now() + 60_000, externalPostId: null, errorCode: null, updatedAt: 0, updatedBy: 'system', history: [],
    })
    const res = await call(`n1__${FB_A.id}__post`, { confirm: 'checked_on_platform', attemptId: 'abcdef01' })
    expect(res.status).toBe(409)
    expect(meta(calls)).toEqual([])
  })
})

// ── 3. Biçim ve görsel politikası ───────────────────────────────────────────
describe('yayın biçimleri = platform yeteneği ∩ adaptör', () => {
  it('Reels / video hiçbir hesapta yayımlanabilir değil; IG hikâye yalnızca doğrulanmış profesyonel türde', () => {
    const all = [
      { platform: 'facebook', connectionMethod: 'facebook_login', platformAccountType: null },
      { platform: 'instagram', connectionMethod: 'facebook_login', platformAccountType: null },
      { platform: 'instagram', connectionMethod: 'instagram_login', platformAccountType: 'BUSINESS' },
      { platform: 'instagram', connectionMethod: 'instagram_login', platformAccountType: 'MEDIA_CREATOR' },
      { platform: 'instagram', connectionMethod: 'instagram_login', platformAccountType: 'PERSONAL' },
      { platform: 'instagram', connectionMethod: 'instagram_login', platformAccountType: null },
      { platform: 'threads', connectionMethod: 'threads_oauth', platformAccountType: null },
    ] as const
    for (const a of all) {
      const k = publishableKinds(a)
      expect(k).not.toContain('reel')
      expect(k).not.toContain('video')
    }
    expect(publishableKinds(all[0])).toEqual(['image_post', 'story'])
    expect(publishableKinds(all[2])).toContain('story')
    expect(publishableKinds(all[3])).toContain('story')
    expect(publishableKinds(all[4])).not.toContain('story')
    expect(publishableKinds(all[5])).not.toContain('story')
    expect(publishableKinds(all[6])).toEqual(['image_post'])
    expect(imageModeProblem('carousel', ['instagram'])).toBeNull()
    expect(imageModeProblem('carousel', ['instagram', 'facebook'])).toBe('carousel_unsupported')
    expect(imageModeProblem('single', ['facebook', 'threads'])).toBeNull()
  })

  it('kaydırmalı + Facebook: medya hazırlığından ve platform isteğinden önce açık hata', async () => {
    const r = await targeted({ targets: { facebook: FB_A.id }, overrides: { platforms: fbOnly, imageMode: 'carousel' } })
    expect(r.skipped).toBe(true)
    expect(r.reason).toMatch(/Kaydırmalı/)
    expect(buildSocialImagePayload).not.toHaveBeenCalled()
    expect(materializeBrandedOgForPublish).not.toHaveBeenCalled()
    expect(calls).toEqual([])
    expect(fs.docs('socialPublishRecords')).toHaveLength(0)
  })

  it('kaydırmalı + Threads (legacy) aynı şekilde reddedilir', async () => {
    const r = await legacyComposer({ overrides: { platforms: { facebook: false, instagram: false, threads: true, twitter: false }, imageMode: 'carousel' } })
    expect(r.skipped).toBe(true)
    expect(buildSocialImagePayload).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('adaptör: çoklu görsel açık tek görsel seçimi olmadan Facebook / Threads’e sessizce düşürülmez', async () => {
    const multi = { ...basePayload, imageUrls: ['https://img.example/a.jpg', 'https://img.example/b.jpg'] }
    expect(await publishToFacebook(multi, undefined, { trigger: 'api_social' })).toMatchObject({ success: false, code: 'multi_image_unsupported' })
    expect(await publishToThreads(multi, undefined, { trigger: 'test' })).toMatchObject({ success: false, code: 'multi_image_unsupported' })
    expect(await publishToFacebook({ ...multi, imageMode: 'carousel' })).toMatchObject({ success: false, code: 'carousel_unsupported' })
    expect(calls).toEqual([])
    expect(fs.docs('socialPublishRecords')).toHaveLength(0)
    expect(singleImageGuard({ imageUrls: ['a', ''] }, 'facebook')).toBeNull()
    expect(singleImageGuard({ imageUrls: ['a', 'b'], imageMode: 'single' }, 'facebook')).toBeNull()
  })

  it('açık tek görsel seçimi korunur: kaydırmalı hazırlanmaz, Facebook tek görselle yayımlar', async () => {
    const r = await targeted({ targets: { facebook: FB_A.id }, overrides: { platforms: fbOnly, imageMode: 'single' } })
    expect(r.post?.facebook.success).toBe(true)
    expect(buildSocialImagePayload).not.toHaveBeenCalled()
    expect(materializeBrandedOgForPublish).toHaveBeenCalled()
    const photo = posts('/5551/photos')
    expect(photo).toHaveLength(1)
    expect(JSON.parse(photo[0].body).url).toBe('https://img.example/single.jpg')
  })

  it('biçim seçimi olmayan tetikleyici (after/cron): Instagram kaydırmalı, Facebook/Threads kapak görseli açık tek görsel + log', async () => {
    h.imagePayload = { imageUrl: 'https://img.example/og.jpg', imageUrls: ['https://img.example/og.jpg', 'https://img.example/b.jpg'], mode: 'carousel' }
    const r = await publishOneSocial('n1', { mode: 'post', manual: true, overrides: { platforms: { facebook: true, instagram: true, threads: true, twitter: false } } })
    expect(r.post?.facebook.success).toBe(true)
    expect(r.post?.instagram.success).toBe(true)
    expect(r.post?.threads?.success).toBe(true)
    expect(JSON.parse(posts('/1001/photos')[0].body).url).toBe('https://img.example/og.jpg')
    // IG: iki çocuk + ebeveyn konteyneri
    expect(meta(calls).filter((c) => c.method === 'POST' && c.url.startsWith(`${FACEBOOK_GRAPH_BASE}/2001/media`) && !c.url.endsWith('media_publish'))).toHaveLength(3)
    expect(meta(calls).some((c) => c.url.startsWith(`${THREADS_GRAPH_BASE}/3001/threads`))).toBe(true)
    expect(logs.join('\n')).toMatch(/\[social:facebook\] op=image_policy corr=n1 result=single_cover slides=2/)
    expect(logs.join('\n')).toMatch(/\[social:threads\] op=image_policy corr=n1 result=single_cover slides=2/)
  })

  it('singleCoverPayload kullanıcının kaydırmalı isteğini tek görsele çevirmez', () => {
    const p = { ...basePayload, imageUrls: ['https://img.example/a.jpg', 'https://img.example/b.jpg'], imageMode: 'carousel' as const }
    expect(singleCoverPayload(p, 'facebook')).toBe(p)
    const auto = singleCoverPayload({ ...basePayload, imageUrls: p.imageUrls }, 'facebook')
    expect(auto).toMatchObject({ imageMode: 'single', imageUrl: basePayload.imageUrl })
    expect(auto).not.toHaveProperty('imageUrls')
  })
})

// ── 4. Log / yanıt / denetim güvenliği ──────────────────────────────────────
describe('hata metinlerinde sır yok', () => {
  it('hedefli yol: gömülü token ve URL parametreli platform hatası', async () => {
    failRule = (url) => (url.endsWith('/5551/photos') ? 'reject_leak' : null)
    const r = await targeted({ targets: { facebook: FB_A.id } })
    expect(r.post?.facebook).toMatchObject({ success: false, ledgerStatus: 'failed' })
    const text = JSON.stringify(r)
    for (const s of SECRETS) expect(text).not.toContain(s)
    expect(r.post?.facebook.error).toMatch(/HTTP 400, kod 190\/463/)
    expect(logs.join('\n')).toMatch(/code=190/)
  })

  it('legacy yol: gömülü token ve URL parametreli platform hatası (post + hikâye + Threads)', async () => {
    failRule = (url) => (url.includes('/1001/') || url.includes('/3001/') ? 'reject_leak' : null)
    const post = await publishToFacebook(basePayload, undefined, { trigger: 'cron' })
    const story = await publishFacebookStory(basePayload, undefined, { trigger: 'cron' })
    const th = await publishToThreads(basePayload, undefined, { trigger: 'cron' })
    for (const r of [post, story, th]) {
      const text = JSON.stringify(r)
      for (const s of SECRETS) expect(text).not.toContain(s)
    }
    expect(post).toMatchObject({ success: false })
    expect(story).toMatchObject({ success: false })
  })

  it('legacy Instagram: ağ hatasındaki URL sorgusu temizlenir', async () => {
    failRule = (url) => (url.includes('/2001/media') ? 'throw_leak' : null)
    const r = await publishToInstagram(basePayload, undefined, { trigger: 'cron' })
    const text = JSON.stringify(r)
    for (const s of SECRETS) expect(text).not.toContain(s)
  })

  it('force-reshare yanıtı ve denetim kaydı (legacy + hedefli hata) sır içermez', async () => {
    failRule = (url) => (url.endsWith('/photos') ? 'reject_leak' : null)
    const { POST } = await import('@/app/api/admin/social/force-reshare/route')
    const mk = (extra: Record<string, unknown>) => new Request(`${ORIGIN}/api/admin/social/force-reshare`, {
      method: 'POST',
      headers: { authorization: 'Bearer tok-admin1', origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['n1'], mode: 'post', manual: true, force: false, headline: 'Antalya’da tramvay hattı açıldı', platforms: fbOnly, ...extra }),
    })
    for (const extra of [{}, { targets: { facebook: FB_A.id } }]) {
      const res = await POST(mk(extra))
      const text = await res.text()
      for (const s of SECRETS) expect(text).not.toContain(s)
    }
    const audits = JSON.stringify(fs.docs('cmsAuditLogs').map((d) => d.data))
    for (const s of SECRETS) expect(audits).not.toContain(s)
  })

  it('yardımcılar: redactSecrets / sanitizeFreeText / safeErrorText / platformError / socialLog', () => {
    const raw = `fail ${FACEBOOK_GRAPH_BASE}/oauth/access_token?client_id=1&client_secret=s3cr3t&code=AQBxyz123&redirect_uri=x token ${LEAK} Bearer abc.def.ghi`
    const red = String(redactSecrets(raw))
    for (const s of ['s3cr3t', 'AQBxyz123', LEAK]) expect(red).not.toContain(s)
    const clean = sanitizeFreeText(raw, 500)
    expect(clean).not.toMatch(/client_secret|code=|access_token=/)
    expect(safeErrorText(new Error(raw))).not.toContain(LEAK)
    expect(safeErrorText({ message: LEAK })).toBe('Bilinmeyen hata')
    const pe = platformError('facebook', 'fotoğraf paylaşımı', 400, { error: { message: `bad ${LEAK}`, code: 190, error_subcode: 463, type: 'OAuthException' } })
    expect(pe.message).toBe('Facebook fotoğraf paylaşımı reddedildi (HTTP 400, kod 190/463)')
    expect(safeErrorText(pe)).not.toContain(LEAK)
    socialLog('error', 'facebook', 'x', { corr: 'n1', detail: `${FACEBOOK_GRAPH_BASE}/me?access_token=${LEAK}`, raw: `token ${LEAK}` })
    const last = logs[logs.length - 1]
    expect(last).toMatch(/^\[social:facebook\] op=x corr=n1/)
    expect(last).not.toContain(LEAK)
  })
})

// ── Görev 6: ledger kenar durumları, Instagram hikâye, Threads, X ─────────
describe('Görev 6 — ledger kenar durumları', () => {
  it('süresi dolup belirsizleşen denemenin geç gelen DOĞRULANMIŞ başarısı kaydedilir; ikinci yayın yok', async () => {
    let fired = false
    onCall = async (url, method) => {
      if (fired || method !== 'POST' || !url.endsWith('/1001/photos')) return
      fired = true
      // Yayın sürerken lease dolar ve başka tetikleyici kaydı belirsiz yapar.
      await fs.collection('socialPublishRecords').doc(`n1__${LEGACY_FB_ID}__post`).update({ leaseUntil: Date.now() - 1 })
      const other = await publishToFacebook(basePayload, undefined, { trigger: 'cron' })
      expect(other).toMatchObject({ success: false, code: 'uncertain_previous_attempt' })
      expect(ledger(LEGACY_FB_ID)).toMatchObject({ status: 'uncertain', errorCode: 'lease_expired' })
    }
    const r = await publishToFacebook(basePayload, undefined, { trigger: 'composer' })
    expect(r).toMatchObject({ success: true, platformId: 'fb-post-1' })
    expect(ledger(LEGACY_FB_ID)).toMatchObject({ status: 'succeeded', externalPostId: 'fb-post-1', attempts: 1 })
    expect(posts('/1001/photos')).toHaveLength(1)
  })

  it('eski çalışan, onaylanmış YENİ denemenin kaydını ezemez', async () => {
    let fired = false
    let newAttempt = ''
    onCall = async (url, method) => {
      if (fired || method !== 'POST' || !url.endsWith('/5551/photos')) return
      fired = true
      const rec = ledger(FB_A.id)!
      await fs.collection('socialPublishRecords').doc(`n1__${FB_A.id}__post`).update({ leaseUntil: Date.now() - 1 })
      const { claimPublish } = await import('./publishLedger')
      const c1 = await claimPublish({ newsId: 'n1', accountId: FB_A.id, platform: 'facebook', format: 'post', force: false, actorUid: 'admin1', now: Date.now() })
      expect(c1).toMatchObject({ ok: false, code: 'uncertain_previous_attempt' })
      const c2 = await claimPublish({ newsId: 'n1', accountId: FB_A.id, platform: 'facebook', format: 'post', force: false, acknowledgeRecordId: `n1__${FB_A.id}__post`, acknowledgeAttemptId: String(rec.attemptId), actorUid: 'admin1', now: Date.now() })
      expect(c2.ok).toBe(true)
      newAttempt = c2.ok ? c2.attemptId : ''
    }
    failRule = (url) => (url.endsWith('/5551/photos') ? 'reject_leak' : null)
    await targeted({ targets: { facebook: FB_A.id } })
    // Eski deneme "failed" yazmaya çalıştı — yeni denemenin kaydı aynen kalır.
    expect(newAttempt).not.toBe('')
    expect(ledger(FB_A.id)).toMatchObject({ status: 'publishing', attemptId: newAttempt })
    expect(logs.join('\n')).toMatch(/op=target_finish_stale/)
  })

  it('platform başarılı, ledger yazımı başarısız → yanıt doğru; kayıt kilitli, sonra belirsiz; yeniden yayın yok', async () => {
    let fired = false
    const realTx = fs.runTransaction.bind(fs)
    onCall = async (url, method) => {
      if (fired || method !== 'POST' || !url.endsWith('/5551/photos')) return
      fired = true
      let n = 0
      fs.runTransaction = (async (fn: never) => {
        n += 1
        if (n === 1) throw new Error('UNAVAILABLE: firestore down')
        return realTx(fn)
      }) as typeof fs.runTransaction
    }
    const r = await targeted({ targets: { facebook: FB_A.id } })
    fs.runTransaction = realTx
    expect(r.post?.facebook).toMatchObject({ success: true, platformId: 'fb-post-1' })
    expect(ledger(FB_A.id)).toMatchObject({ status: 'publishing' })
    calls = []
    const again = await targeted({ force: true, targets: { facebook: FB_A.id } })
    expect(again.post?.facebook).toMatchObject({ success: false, code: 'in_progress' })
    await fs.collection('socialPublishRecords').doc(`n1__${FB_A.id}__post`).update({ leaseUntil: Date.now() - 1 })
    const later = await targeted({ force: true, targets: { facebook: FB_A.id } })
    expect(later.post?.facebook).toMatchObject({ success: false, code: 'uncertain_previous_attempt' })
    expect(meta(calls)).toEqual([])
    expect(logs.join('\n')).toMatch(/op=target_finish_error/)
  })

  it('legacy: platform başarılı, ledger yazımı başarısız → ikinci tetikleyici yayımlamaz', async () => {
    let fired = false
    const realTx = fs.runTransaction.bind(fs)
    onCall = async (url, method) => {
      if (fired || method !== 'POST' || !url.endsWith('/1001/photos')) return
      fired = true
      let n = 0
      fs.runTransaction = (async (fn: never) => {
        n += 1
        if (n === 1) throw new Error('UNAVAILABLE')
        return realTx(fn)
      }) as typeof fs.runTransaction
    }
    const r = await publishToFacebook(basePayload, undefined, { trigger: 'cron' })
    fs.runTransaction = realTx
    expect(r).toMatchObject({ success: true, platformId: 'fb-post-1' })
    expect(await publishToFacebook(basePayload, undefined, { trigger: 'after' })).toMatchObject({ code: 'in_progress' })
    expect(posts('/1001/photos')).toHaveLength(1)
  })
})

describe('Görev 6 — Instagram hikâye, Threads ve X', () => {
  it('Instagram hikâyesi link sticker parametresi göndermez; normal hikâye yayımlanır', async () => {
    const r = await publishInstagramStory(basePayload, undefined, { trigger: 'cron' })
    expect(r.success).toBe(true)
    const story = meta(calls).find((c) => c.body.includes('STORIES'))!
    const params = new URLSearchParams(story.body)
    expect(params.has('link_sticker_url')).toBe(false)
    expect([...params.keys()].sort()).toEqual(['access_token', 'image_url', 'media_type'])
    expect(meta(calls).filter((c) => c.method === 'POST' && c.url.endsWith('/2001/media'))).toHaveLength(1)
  })

  it('Instagram kaydırmalı media_publish 5xx → tek görsele düşmez, belirsiz', async () => {
    failRule = (url) => (url.endsWith('/2001/media_publish') ? 'server' : null)
    const r = await publishToInstagram({ ...basePayload, imageUrls: ['https://img.example/a.jpg', 'https://img.example/b.jpg'] }, undefined, { trigger: 'cron' })
    expect(r).toMatchObject({ success: false, ledgerStatus: 'uncertain' })
    expect(posts('/2001/media_publish')).toHaveLength(1)
    expect(ledger(accountIdFor('instagram', '2001'))).toMatchObject({ status: 'uncertain' })
  })

  it('Threads görselli istek: görsel başarısız → metne düşmez, açık hata (legacy + hedefli)', async () => {
    failRule = (url, method, body) => (method === 'POST' && url.endsWith('/threads') && body.includes('media_type=IMAGE') ? 'reject_leak' : null)
    const legacy = await publishToThreads(basePayload, undefined, { trigger: 'cron' })
    expect(legacy).toMatchObject({ success: false, ledgerStatus: 'failed' })
    expect(legacy.error).toMatch(/metin gönderisine düşürülmedi/)
    const t = await targeted({ targets: { threads: TH_A.id }, overrides: { platforms: { facebook: false, instagram: false, threads: true, twitter: false } } })
    expect(t.post?.threads).toMatchObject({ success: false, ledgerStatus: 'failed' })
    expect(meta(calls).some((c) => c.body.includes('media_type=TEXT'))).toBe(false)
    expect(posts('/threads_publish')).toHaveLength(0)
  })

  it('Threads yayın adımı 5xx → belirsiz; metin ya da ikinci deneme yok', async () => {
    failRule = (url) => (url.endsWith('/3001/threads_publish') ? 'server' : null)
    const r = await publishToThreads(basePayload, undefined, { trigger: 'cron' })
    expect(r).toMatchObject({ success: false, ledgerStatus: 'uncertain' })
    expect(posts('/threads_publish')).toHaveLength(1)
    expect(meta(calls).some((c) => c.body.includes('media_type=TEXT'))).toBe(false)
    expect(await publishToThreads(basePayload, undefined, { trigger: 'after' })).toMatchObject({ code: 'uncertain_previous_attempt' })
  })

  it('Threads açık metin yayını (görsel yok) korunur', async () => {
    const noImage = { ...basePayload, imageUrl: undefined }
    const r = await publishToThreads(noImage, undefined, { trigger: 'api' })
    expect(r).toMatchObject({ success: true, platformId: 'th-media-1' })
    expect(meta(calls).some((c) => c.body.includes('media_type=TEXT'))).toBe(true)
  })

  it('X ledger kapsamında değil: kayıt oluşmaz; panel bunu açıkça söyler', async () => {
    await publishOneSocial('n1', { mode: 'post', manual: true, overrides: { platforms: { facebook: false, instagram: false, threads: false, twitter: true } } })
    expect(fs.docs('socialPublishRecords')).toHaveLength(0)
    const page = readFileSync(join(process.cwd(), 'src/app/admin/social/page.tsx'), 'utf8')
    expect(page).toMatch(/X, mükerrer yayın kilidi ve belirsiz sonuç kaydı kapsamında değil/)
  })
})

// ── 5. Statik kontrol: adaptörlerde ham console, yayın yolunda ham hata yok ──
describe('statik log denetimi', () => {
  const root = process.cwd()
  const read = (p: string) => readFileSync(join(root, p), 'utf8')

  it('platform adaptörlerinde doğrudan console çağrısı yok (yalnızca socialLog)', () => {
    for (const f of ['facebook', 'instagram', 'threads', 'twitter']) {
      expect(read(`src/lib/social/${f}.ts`), f).not.toMatch(/\bconsole\.(log|warn|error|info|debug)\s*\(/)
    }
  })

  it('yayın yolu dosyalarında console çağrıları ham hata / yanıt / mesaj içermez', () => {
    const files = [
      'src/lib/social/publishOneSocial.ts',
      'src/app/api/cron/social/route.ts',
      'src/app/api/admin/social/force-reshare/route.ts',
      'src/lib/social/carouselImages.ts',
      'src/lib/social/storageUploader.ts',
      'src/lib/social/accounts/audit.ts',
    ]
    const offenders: string[] = []
    for (const f of files) {
      const src = read(f)
      let i = 0
      while ((i = src.indexOf('console.', i)) !== -1) {
        const open = src.indexOf('(', i)
        let depth = 0
        let j = open
        for (; j < src.length; j++) {
          if (src[j] === '(') depth++
          else if (src[j] === ')' && --depth === 0) break
        }
        const callText = src.slice(open + 1, j)
        const stripped = callText
          .replace(/safeErrorText\([^()]*(\([^()]*\)[^()]*)*\)/g, '')
          .replace(/sanitizeFreeText\([^()]*\)/g, '')
          .replace(/err instanceof Error \? err\.name : 'error'/g, '')
        if (/\b(err|sharpErr|imgErr|e|json|rawText|responseText|res)\b(?!\w)(?!\.(status|ok)\b)|\.message\b|JSON\.stringify/.test(stripped.replace(/`[^`]*`/g, (t) => t.replace(/\$\{[^}]*\}/g, (x) => (/safeErrorText|sanitizeFreeText/.test(x) ? '' : x))).replace(/'[^']*'/g, "''"))) {
          offenders.push(`${f}: console.${src.slice(i + 8, open)}(${callText.slice(0, 80)}…`)
        }
        i = j
      }
    }
    expect(offenders).toEqual([])
  })
})
