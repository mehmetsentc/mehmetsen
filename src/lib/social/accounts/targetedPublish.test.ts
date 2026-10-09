/**
 * Composer → force-reshare → publishOneSocial → platform adaptörü, açık hedef hesapla.
 * In-memory Firestore + taklit Meta uçları. Gerçek Meta / Firebase / Storage yok.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from './testing/fakeFirestore'
import { cannedMetaResponse, accessTokenOf, type RecordedCall } from './testing/fetchRecorder'

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
  buildSocialImagePayload: vi.fn(async () => ({ imageUrl: 'https://img.example/og.jpg', mode: 'single' })),
  materializeBrandedOgForPublish: vi.fn(async () => 'https://img.example/story.jpg'),
  resolveCarouselUrls: () => undefined,
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
import { buildEncryptedSecretRecord, buildLegacySecretRecord } from './secretStore'
import { accountIdFor, requiredPermissionsFor, type SocialAccount } from './types'
import { FACEBOOK_GRAPH_BASE, INSTAGRAM_LOGIN_GRAPH_BASE, THREADS_GRAPH_BASE } from '../graphConfig'
import { parseTargetsInput, classifyOutcome } from './targetedPublish'
import { targetBlocker } from './capabilities'

// ── fetch with failure injection ────────────────────────────────────────────
let calls: RecordedCall[] = []
let logs: string[] = []
let failRule: ((url: string, method: string) => 'throw' | 'reject' | null) | null = null
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  calls.push({ url, method, body: init?.body ? String(init.body) : '' })
  const f = failRule?.(url, method)
  if (f === 'throw') throw new TypeError('fetch failed')
  if (f === 'reject') return new Response(JSON.stringify({ error: { message: 'Invalid parameter (#100) token EAAG_SHOULD_NOT_ECHO', code: 100 } }), { status: 400 })
  return cannedMetaResponse(url, method)
}
const meta = (c: RecordedCall[]) => c.filter((x) => !x.url.startsWith('https://img.example/'))

// ── fixtures ────────────────────────────────────────────────────────────────
let fs: FakeFirestore
const NOW = Date.now()
const ORIGIN = 'https://www.nahaber.com'
const SECRETS = ['EAAG_PAGE_A', 'EAAG_PAGE_B', 'IGAA_TOKEN_A', 'IGAA_TOKEN_B', 'THQ_TOKEN_A', 'LEGACY_FB_TOKEN', 'LEGACY_IG_TOKEN', 'LEGACY_TH_TOKEN', 'EAAG_SHOULD_NOT_ECHO']

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
const IG_A = account({ platform: 'instagram', externalId: '7771', connectionMethod: 'instagram_login' })
const IG_UNKNOWN = account({ platform: 'instagram', externalId: '7772', connectionMethod: 'instagram_login', platformAccountType: null })
const TH_A = account({ platform: 'threads', externalId: '8881', connectionMethod: 'threads_oauth' })

async function seedNews(id = 'n1') {
  await fs.collection('news').doc(id).set({
    title: 'Antalya’da yeni tramvay hattı hizmete açıldı',
    spot: 'Yeni hat 12 durakla şehir merkezini havalimanına bağlıyor ve günde 40 bin yolcu taşıyacak.',
    content: 'Antalya Büyükşehir Belediyesi yeni tramvay hattını hizmete açtı. Hat 12 duraktan oluşuyor ve günlük 40 bin yolcu kapasitesine sahip.',
    citySlug: 'antalya',
    cityName: 'Antalya',
    categoryId: 'gundem',
    thumbnail: 'https://img.example/cover.jpg',
    slug: 'antalya-tramvay',
    status: 'published',
  })
}

beforeEach(async () => {
  fs = new FakeFirestore()
  h.db = fs
  h.users = { admin1: { email: 'me@nahaber.com' }, editor1: { email: 'ed@nahaber.com' } }
  await fs.collection('users').doc('admin1').set({ role: 'managing_editor' })
  await fs.collection('users').doc('editor1').set({ role: 'editor' })
  process.env.SECRET_ENCRYPTION_KEY = 'e'.repeat(64)
  process.env.NEXT_PUBLIC_APP_URL = ORIGIN
  process.env.SOCIAL_OAUTH_BASE_URL = ORIGIN
  process.env.INSTAGRAM_BUSINESS_ID = '2001'
  process.env.THREADS_USER_ID = '3001'
  process.env.THREADS_ACCESS_TOKEN = 'LEGACY_TH_TOKEN'
  process.env.CRON_SECRET = 'cron-secret-value'
  await seed(FB_A, 'EAAG_PAGE_A', 'facebook_page')
  await seed(FB_B, 'EAAG_PAGE_B', 'facebook_page')
  await seed(IG_A, 'IGAA_TOKEN_A', 'instagram_user')
  await seed(IG_UNKNOWN, 'IGAA_TOKEN_B', 'instagram_user')
  await seed(TH_A, 'THQ_TOKEN_A', 'threads_user')
  await seedNews()
  calls = []
  logs = []
  failRule = null
  vi.stubGlobal('fetch', fakeFetch)
  vi.stubGlobal('setTimeout', ((fn: () => void) => { fn(); return 0 }) as unknown as typeof setTimeout)
  for (const lvl of ['log', 'warn', 'error', 'info'] as const) {
    vi.spyOn(console, lvl).mockImplementation((...a: unknown[]) => {
      logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '))
    })
  }
})

afterEach(() => {
  // Plain-text secrets never reach Firestore (encrypted secret docs are expected and checked by shape).
  for (const [path, doc] of fs.store) {
    const raw = JSON.stringify(doc)
    for (const s of SECRETS) expect(raw, `firestore plaintext ${s} in ${path}`).not.toContain(s)
  }
  for (const s of ['EAAG_PAGE_A', 'EAAG_PAGE_B', 'IGAA_TOKEN_A', 'IGAA_TOKEN_B', 'THQ_TOKEN_A']) {
    expect(logs.join('\n'), `log leak ${s}`).not.toContain(s)
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const run = (opts: Parameters<typeof publishOneSocial>[1]) => publishOneSocial('n1', { manual: true, actorUid: 'admin1', ...opts })
const ledger = (accountId: string, format = 'post') => fs.store.get(`socialPublishRecords/n1__${accountId}__${format}`) as Record<string, unknown> | undefined
const news = () => fs.store.get('news/n1') as Record<string, unknown>

// ── tests ───────────────────────────────────────────────────────────────────
describe('hedefsiz (Onyeditivi) çağrı eski davranışı korur', () => {
  it('legacy kimlikler kullanılır, haber belgesine eski alanlar yazılır; ortak kilit yalnızca legacy hesap kimlikleriyle', async () => {
    const r = await publishOneSocial('n1', { mode: 'post', manual: true, force: true, overrides: { platforms: { facebook: true, instagram: true, threads: true, twitter: false } } })
    expect(r.ok).toBe(true)
    const m = meta(calls)
    expect(m.some((c) => c.url.startsWith(`${FACEBOOK_GRAPH_BASE}/1001/photos`))).toBe(true)
    expect(m.some((c) => c.url.startsWith(`${FACEBOOK_GRAPH_BASE}/2001/media`))).toBe(true)
    expect(m.some((c) => c.url.startsWith(`${THREADS_GRAPH_BASE}/3001/threads`))).toBe(true)
    expect(m.map(accessTokenOf).filter(Boolean).every((t) => /^LEGACY_/.test(t!))).toBe(true)
    expect(news()).toMatchObject({ facebookPostId: 'fb-post-1', instagramMediaId: 'ig-media-1', threadsPostId: 'th-media-1', socialPublished: true })
    // Görev 5: legacy yol da ortak ledger kilidini kullanır — anahtar legacy dış kimlikten türetilir.
    expect(fs.docs('socialPublishRecords').map((d) => d.id).sort()).toEqual(
      ['n1__facebook_1001__post', 'n1__instagram_2001__post', 'n1__threads_3001__post'],
    )
    expect(fs.docs('socialPublishRecords').every((d) => d.data.status === 'succeeded')).toBe(true)
  })

  it('hedef verilip actorUid yoksa (yetkisiz çağrı) hiçbir şey yayınlanmaz', async () => {
    const r = await publishOneSocial('n1', { mode: 'post', manual: true, targets: { facebook: FB_A.id } })
    expect(r.skipped).toBe(true)
    expect(calls).toEqual([])
  })
})

describe('açık hedef: doğru hesap, token ve host', () => {
  it('FB + IG Login + Threads hedefleri kendi kimlikleriyle; legacy alanlara dokunulmaz', async () => {
    const r = await run({ mode: 'post', targets: { facebook: FB_A.id, instagram: IG_A.id, threads: TH_A.id }, overrides: { platforms: { facebook: true, instagram: true, threads: true, twitter: false } } })
    expect(r.ok).toBe(true)
    const m = meta(calls)
    const fb = m.filter((c) => c.url.startsWith(`${FACEBOOK_GRAPH_BASE}/5551/`) || c.url.includes('/fb-post-1/'))
    const ig = m.filter((c) => c.url.startsWith(`${INSTAGRAM_LOGIN_GRAPH_BASE}/7771/`))
    const th = m.filter((c) => c.url.startsWith(`${THREADS_GRAPH_BASE}/8881/`))
    expect(fb.length).toBeGreaterThan(0)
    expect(ig.length).toBe(2)
    expect(th.length).toBe(2)
    for (const c of fb) expect(accessTokenOf(c)).toBe('EAAG_PAGE_A')
    for (const c of ig) expect(accessTokenOf(c)).toBe('IGAA_TOKEN_A')
    for (const c of th) expect(accessTokenOf(c)).toBe('THQ_TOKEN_A')
    // nothing went to Onyeditivi
    expect(m.some((c) => /\/(1001|2001|3001)\//.test(c.url) || /LEGACY_/.test(accessTokenOf(c) ?? ''))).toBe(false)
    // Onyeditivi comment attribution only on Onyeditivi
    const comment = m.find((c) => c.url.endsWith('/comments'))
    expect(JSON.parse(comment!.body).message).not.toContain('onyeditivi')
    expect(r.post?.facebook).toMatchObject({ success: true, accountId: FB_A.id, ledgerStatus: 'succeeded' })
    expect(ledger(FB_A.id)).toMatchObject({ status: 'succeeded', accountId: FB_A.id, platform: 'facebook', externalPostId: 'fb-post-1' })
    expect(ledger(IG_A.id)).toMatchObject({ status: 'succeeded', externalPostId: 'ig-media-1' })
    expect(ledger(TH_A.id)).toMatchObject({ status: 'succeeded', externalPostId: 'th-media-1' })
    expect(news()).not.toHaveProperty('facebookPostId')
    expect(news()).not.toHaveProperty('instagramMediaId')
    expect(news().socialPublished).not.toBe(true)
  })

  it('hedef + legacy karışık istek: hedefsiz platform Onyeditivi’ye, hedefli platform seçilen hesaba', async () => {
    const r = await run({ mode: 'post', targets: { instagram: IG_A.id }, overrides: { platforms: { facebook: true, instagram: true, threads: false, twitter: false } } })
    expect(r.ok).toBe(true)
    const m = meta(calls)
    expect(m.some((c) => c.url.startsWith(`${FACEBOOK_GRAPH_BASE}/1001/photos`))).toBe(true)
    expect(m.some((c) => c.url.startsWith(`${INSTAGRAM_LOGIN_GRAPH_BASE}/7771/media`))).toBe(true)
    expect(m.some((c) => c.url.includes('/2001/'))).toBe(false)
    expect(news()).toMatchObject({ facebookPostId: 'fb-post-1', socialPublished: true })
    expect(news()).not.toHaveProperty('instagramMediaId')
  })

  it('hikâye: IG Login (profesyonel) ve FB sayfası hedefleri kendi uçlarıyla', async () => {
    const r = await run({ mode: 'story', targets: { facebook: FB_A.id, instagram: IG_A.id }, overrides: { platforms: { facebook: true, instagram: true, threads: false, twitter: false } } })
    expect(r.ok).toBe(true)
    const m = meta(calls)
    expect(m.some((c) => c.url.startsWith(`${FACEBOOK_GRAPH_BASE}/5551/photo_stories`))).toBe(true)
    const igStory = m.find((c) => c.url.startsWith(`${INSTAGRAM_LOGIN_GRAPH_BASE}/7771/media`) && c.body.includes('STORIES'))
    expect(igStory).toBeTruthy()
    expect(ledger(IG_A.id, 'story')).toMatchObject({ status: 'succeeded' })
    expect(news().storyPublished).not.toBe(true)
  })
})

describe('red ve fail-closed', () => {
  it('yanlış platform eşleşmesi ayrıştırmada reddedilir', () => {
    expect(parseTargetsInput({ facebook: IG_A.id })).toMatchObject({ ok: false, code: 'platform_mismatch' })
    expect(parseTargetsInput({ twitter: 'facebook_1' })).toMatchObject({ ok: false, code: 'target_platform_unsupported' })
    expect(parseTargetsInput({ facebook: '../x' })).toMatchObject({ ok: false, code: 'invalid_account_id' })
    expect(parseTargetsInput({ facebook: 'legacy', instagram: IG_A.id })).toEqual({ ok: true, targets: { instagram: IG_A.id } })
  })

  it('yayın anında duraklatılmış hesap → o platform reddedilir, legacy’ye düşmez, diğer platform etkilenmez', async () => {
    // simulate a status change between preflight and publish: pause before the run
    await fs.collection('socialAccounts').doc(IG_A.id).update({ status: 'paused' })
    const r = await run({ mode: 'post', targets: { facebook: FB_A.id, instagram: IG_A.id }, overrides: { platforms: { facebook: true, instagram: true, threads: false, twitter: false } } })
    expect(r.post?.instagram).toMatchObject({ success: false, code: 'paused', ledgerStatus: 'failed' })
    expect(r.post?.facebook).toMatchObject({ success: true })
    const m = meta(calls)
    expect(m.some((c) => c.url.includes('/7771/') || c.url.includes('/2001/'))).toBe(false)
    expect(ledger(IG_A.id)).toMatchObject({ status: 'failed', errorCode: 'paused' })
  })

  for (const [label, patch, code] of [
    ['süresi dolmuş', { tokenExpiresAt: Date.now() - 1000 }, 'token_expired'],
    ['disabled', { status: 'disabled' }, 'disabled'],
    ['needs_reauth', { status: 'needs_reauth' }, 'needs_reauth'],
    ['izni doğrulanmamış', { grantedPermissions: null, permissionsVerifiedAt: null }, 'publish_permission_unverified'],
  ] as const) {
    it(`${label} hesap engellenir (${code})`, async () => {
      await fs.collection('socialAccounts').doc(TH_A.id).update(patch as Record<string, unknown>)
      const r = await run({ mode: 'post', targets: { threads: TH_A.id }, overrides: { platforms: { facebook: false, instagram: false, threads: true, twitter: false } } })
      expect(r.post?.threads).toMatchObject({ success: false, code })
      expect(meta(calls)).toEqual([])
    })
  }

  it('hesap türü bilinmeyen IG Login hesabına hikâye reddedilir; Threads’e hikâye reddedilir', async () => {
    const r = await run({ mode: 'story', targets: { instagram: IG_UNKNOWN.id }, overrides: { platforms: { facebook: false, instagram: true, threads: false, twitter: false } } })
    expect(r.story?.instagram).toMatchObject({ success: false, code: 'format_unsupported' })
    expect(meta(calls)).toEqual([])
    expect(targetBlocker({ ...TH_A, publishPermission: 'verified' }, 'story', Date.now())).toBe('format_unsupported')
    expect(targetBlocker({ ...IG_UNKNOWN, publishPermission: 'verified' }, 'post', Date.now())).toBeNull()
  })
})

describe('hesap bazlı geçmiş, mükerrer kontrol, belirsiz sonuç, kısmi başarı', () => {
  const fbOnly = { facebook: true, instagram: false, threads: false, twitter: false }

  it('aynı haber farklı hesaplarda bağımsız; aynı hesaba tekrar force olmadan engellenir', async () => {
    await run({ mode: 'post', targets: { facebook: FB_A.id }, overrides: { platforms: fbOnly } })
    calls = []
    const second = await run({ mode: 'post', targets: { facebook: FB_B.id }, overrides: { platforms: fbOnly } })
    expect(second.post?.facebook).toMatchObject({ success: true, accountId: FB_B.id })
    expect(meta(calls).some((c) => c.url.startsWith(`${FACEBOOK_GRAPH_BASE}/5552/photos`))).toBe(true)
    calls = []
    const again = await run({ mode: 'post', targets: { facebook: FB_A.id }, overrides: { platforms: fbOnly } })
    expect(again.post?.facebook).toMatchObject({ success: false, code: 'already_published' })
    expect(meta(calls)).toEqual([])
    calls = []
    const forced = await run({ mode: 'post', force: true, targets: { facebook: FB_A.id }, overrides: { platforms: fbOnly } })
    expect(forced.post?.facebook).toMatchObject({ success: true })
    expect(ledger(FB_A.id)).toMatchObject({ attempts: 2, status: 'succeeded' })
  })

  it('Onyeditivi’nin önceki paylaşımı yeni hesabı engellemez', async () => {
    await fs.collection('news').doc('n1').update({ socialPublished: true, facebookPostId: 'old-onyeditivi' })
    const r = await run({ mode: 'post', targets: { facebook: FB_A.id }, overrides: { platforms: fbOnly } })
    expect(r.post?.facebook).toMatchObject({ success: true })
    expect(news()).toMatchObject({ facebookPostId: 'old-onyeditivi' })
  })

  it('eşzamanlı iki istek aynı hedefe tek yayın üretir', async () => {
    const [a, b] = await Promise.all([
      run({ mode: 'post', targets: { facebook: FB_A.id }, overrides: { platforms: fbOnly } }),
      run({ mode: 'post', targets: { facebook: FB_A.id }, overrides: { platforms: fbOnly } }),
    ])
    const codes = [a.post?.facebook.code, b.post?.facebook.code].sort()
    expect(codes).toEqual(['in_progress', 'published'].sort())
    expect(meta(calls).filter((c) => c.url.endsWith('/5551/photos'))).toHaveLength(1)
  })

  it('platform yanıtı kaybolursa belirsiz; kör tekrar yok; onaylanınca yeniden denenir', async () => {
    const igOnly = { facebook: false, instagram: true, threads: false, twitter: false }
    failRule = (url) => (url.includes('/media_publish') ? 'throw' : null)
    const r = await run({ mode: 'post', targets: { instagram: IG_A.id }, overrides: { platforms: igOnly } })
    expect(r.post?.instagram).toMatchObject({ success: false, ledgerStatus: 'uncertain', code: 'transport_error' })
    expect(ledger(IG_A.id)).toMatchObject({ status: 'uncertain' })
    failRule = null
    calls = []
    const retry = await run({ mode: 'post', force: true, targets: { instagram: IG_A.id }, overrides: { platforms: igOnly } })
    expect(retry.post?.instagram).toMatchObject({ success: false, code: 'uncertain_previous_attempt' })
    expect(meta(calls)).toEqual([])
    // Başka bir kaydın kimliğiyle onay işe yaramaz (genel bayrak yok)
    const wrongAck = await run({ mode: 'post', force: true, acknowledgeUncertainRecordId: `n1__${FB_A.id}__post`, targets: { instagram: IG_A.id }, overrides: { platforms: igOnly } })
    expect(wrongAck.post?.instagram).toMatchObject({ success: false, code: 'uncertain_previous_attempt' })
    expect(meta(calls)).toEqual([])
    // Kayıt kimliği doğru ama deneme kimliği eski/yanlış → onay geçersiz
    const staleAck = await run({ mode: 'post', force: true, acknowledgeUncertainRecordId: `n1__${IG_A.id}__post`, acknowledgeUncertainAttemptId: 'not-the-attempt', targets: { instagram: IG_A.id }, overrides: { platforms: igOnly } })
    expect(staleAck.post?.instagram).toMatchObject({ success: false, code: 'uncertain_previous_attempt' })
    expect(meta(calls)).toEqual([])
    const attemptId = String(ledger(IG_A.id)!.attemptId)
    const ack = await run({ mode: 'post', force: true, acknowledgeUncertainRecordId: `n1__${IG_A.id}__post`, acknowledgeUncertainAttemptId: attemptId, targets: { instagram: IG_A.id }, overrides: { platforms: igOnly } })
    expect(ack.post?.instagram).toMatchObject({ success: true })
  })

  it('süresi dolmuş kilit belirsiz sayılır (çökme sonrası kör tekrar yok)', async () => {
    await fs.collection('socialPublishRecords').doc(`n1__${FB_A.id}__post`).set({
      newsId: 'n1', accountId: FB_A.id, platform: 'facebook', format: 'post', status: 'publishing', attemptId: 'old', attempts: 1, leaseUntil: Date.now() - 1, externalPostId: null, errorCode: null, updatedAt: 0, updatedBy: 'admin1', history: [],
    })
    const r = await run({ mode: 'post', force: true, targets: { facebook: FB_A.id }, overrides: { platforms: fbOnly } })
    expect(r.post?.facebook).toMatchObject({ success: false, code: 'uncertain_previous_attempt' })
    expect(ledger(FB_A.id)).toMatchObject({ status: 'uncertain', errorCode: 'lease_expired' })
    expect(meta(calls)).toEqual([])
  })

  it('kısmi başarı: bir platformun hatası diğerinin başarısını kaybettirmez; ham Meta metni temizlenir', async () => {
    failRule = (url, method) => (method === 'POST' && url.startsWith(`${INSTAGRAM_LOGIN_GRAPH_BASE}/7771/media`) && !url.endsWith('media_publish') ? 'reject' : null)
    const r = await run({ mode: 'post', targets: { facebook: FB_A.id, instagram: IG_A.id }, overrides: { platforms: { facebook: true, instagram: true, threads: false, twitter: false } } })
    expect(r.ok).toBe(true)
    expect(r.post?.facebook).toMatchObject({ success: true })
    expect(r.post?.instagram).toMatchObject({ success: false, ledgerStatus: 'failed', code: 'platform_rejected' })
    expect(r.post?.instagram.error).not.toContain('EAAG_SHOULD_NOT_ECHO')
    expect(ledger(FB_A.id)).toMatchObject({ status: 'succeeded' })
    expect(ledger(IG_A.id)).toMatchObject({ status: 'failed' })
  })

  it('sonuç sınıflandırma', () => {
    expect(classifyOutcome({ success: true, platformId: 'x' }, false).status).toBe('succeeded')
    expect(classifyOutcome({ success: true }, false).status).toBe('uncertain')
    expect(classifyOutcome(null, true).status).toBe('uncertain')
    expect(classifyOutcome({ success: false, error: 'The operation was aborted due to timeout' }, false).status).toBe('uncertain')
    expect(classifyOutcome({ success: false, error: 'Invalid parameter' }, false).status).toBe('failed')
  })
})

describe('force-reshare rotası', () => {
  const body = (extra: Record<string, unknown>) => ({
    ids: ['n1'], mode: 'post', manual: true, force: false, headline: 'Antalya’da tramvay hattı açıldı',
    platforms: { facebook: true, instagram: false, threads: false, twitter: false }, ...extra,
  })
  const req = (uid: string | null, b: unknown, origin: string | null = ORIGIN, auth?: string) =>
    new Request(`${ORIGIN}/api/admin/social/force-reshare`, {
      method: 'POST',
      headers: {
        ...(uid ? { authorization: `Bearer tok-${uid}` } : {}),
        ...(auth ? { authorization: auth } : {}),
        ...(origin ? { origin } : {}),
        'content-type': 'application/json',
      },
      body: JSON.stringify(b),
    })

  it('merkez yönetici hedefle paylaşır; yanıt ve denetim kaydı sır içermez', async () => {
    const { POST } = await import('@/app/api/admin/social/force-reshare/route')
    const res = await POST(req('admin1', body({ targets: { facebook: FB_A.id } })))
    const text = await res.text()
    expect(res.status).toBe(200)
    for (const s of SECRETS) expect(text).not.toContain(s)
    const parsed = JSON.parse(text)
    expect(parsed.results[0].post.facebook).toMatchObject({ success: true, accountId: FB_A.id })
    const audits = fs.docs('cmsAuditLogs').map((d) => d.data)
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['social.publish', 'social.publish.manual']))
    expect(audits.find((a) => a.action === 'social.publish')).toMatchObject({ actorId: 'admin1', entityId: FB_A.id, meta: { newsId: 'n1', platform: 'facebook', result: 'succeeded' } })
    for (const s of SECRETS) expect(JSON.stringify(audits)).not.toContain(s)
  })

  it('editör (news:publish var) hedefle paylaşamaz; hedefsiz eski yol aynen açık', async () => {
    const { POST } = await import('@/app/api/admin/social/force-reshare/route')
    const denied = await POST(req('editor1', body({ targets: { facebook: FB_A.id } })))
    expect(denied.status).toBe(403)
    expect(meta(calls)).toEqual([])
    const legacy = await POST(req('editor1', body({})))
    expect(legacy.status).toBe(200)
    expect(meta(calls).some((c) => c.url.startsWith(`${FACEBOOK_GRAPH_BASE}/1001/photos`))).toBe(true)
  })

  it('cron sırrı, yabancı origin, toplu haber ve uygun olmayan hesap reddedilir (hiç yayın yok)', async () => {
    const { POST } = await import('@/app/api/admin/social/force-reshare/route')
    expect((await POST(req(null, body({ targets: { facebook: FB_A.id } }), ORIGIN, 'Bearer cron-secret-value'))).status).toBe(403)
    expect((await POST(req('admin1', body({ targets: { facebook: FB_A.id } }), 'https://evil.example'))).status).toBe(403)
    expect((await POST(req('admin1', body({ ids: ['n1', 'n2'], targets: { facebook: FB_A.id } })))).status).toBe(400)
    expect((await POST(req('admin1', body({ targets: { facebook: IG_A.id } })))).status).toBe(400)
    await fs.collection('socialAccounts').doc(FB_A.id).update({ status: 'paused' })
    const paused = await POST(req('admin1', body({ targets: { facebook: FB_A.id } })))
    expect(paused.status).toBe(409)
    expect(await paused.json()).toMatchObject({ code: 'paused', platform: 'facebook' })
    const story = await POST(req('admin1', body({ mode: 'story', platforms: { facebook: false, instagram: true }, targets: { instagram: IG_UNKNOWN.id } })))
    expect(story.status).toBe(409)
    expect(await story.json()).toMatchObject({ code: 'format_unsupported' })
    expect(meta(calls)).toEqual([])
    expect(fs.docs('socialPublishRecords')).toHaveLength(0)
  })

  it('platform anahtarı kapalıysa o platformun hedefi yok sayılır', async () => {
    const { POST } = await import('@/app/api/admin/social/force-reshare/route')
    const res = await POST(req('admin1', body({ platforms: { facebook: true, instagram: false, threads: false, twitter: false }, targets: { facebook: FB_A.id, instagram: IG_A.id } })))
    expect(res.status).toBe(200)
    expect(meta(calls).some((c) => c.url.includes('/7771/'))).toBe(false)
  })

  it('legacy hesap kaydı hedef olarak Onyeditivi kimliğine çözülür', async () => {
    const legacy = account({ platform: 'facebook', externalId: '1001', connectionMethod: 'legacy', ownership: { citySlug: 'canakkale', publisherId: null } })
    await fs.collection('socialAccounts').doc(legacy.id).set({ ...legacy })
    await fs.collection('socialAccountSecrets').doc(legacy.id).set({ ...buildLegacySecretRecord('facebook') })
    const r = await run({ mode: 'post', targets: { facebook: legacy.id }, overrides: { platforms: fbOnly() } })
    expect(r.post?.facebook).toMatchObject({ success: true, accountId: legacy.id })
    expect(accessTokenOf(meta(calls)[0])).toBe('LEGACY_FB_TOKEN')
    function fbOnly() { return { facebook: true, instagram: false, threads: false, twitter: false } }
  })
})
