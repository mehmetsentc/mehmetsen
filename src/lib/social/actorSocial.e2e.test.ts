/**
 * Genel çoklu hesap: her rol için hesap görünürlüğü, bağlantı başlatma,
 * kural kapsamı, bağımsız kurallar, manuel paylaşım (legacy'ye dönüş yok),
 * içerik uygunluğu. Gerçek Meta / Firebase yok.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from './accounts/testing/fakeFirestore'
import { cannedMetaResponse, accessTokenOf, type RecordedCall } from './accounts/testing/fetchRecorder'

const h = vi.hoisted(() => ({
  db: null as unknown,
  users: {} as Record<string, { email: string }>,
  publishers: {} as Record<string, Array<{ id: string; role: string; name: string }>>,
}))
vi.mock('@/services/publisher/publisherRepository', () => ({
  publisherRepository: { listPublishersForUser: async (uid: string) => h.publishers[uid] ?? [] },
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

import { buildEncryptedSecretRecord } from './accounts/secretStore'
import { accountIdFor, requiredPermissionsFor, type SocialAccount, type SocialAccountOwnership } from './accounts/types'
import { runAutomationTick } from './automation/worker'

let calls: RecordedCall[] = []
let dropPublishResponse = false
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  calls.push({ url, method, body: init?.body ? String(init.body) : '' })
  // Platform accepted the post but the response was lost on the way back.
  if (dropPublishResponse && method === 'POST' && url.includes('/media_publish')) throw new TypeError('fetch failed')
  return cannedMetaResponse(url, method)
}
const publishes = () => calls.filter((c) => c.method === 'POST' && /\/(media_publish|threads_publish|photos|photo_stories)$/.test(new URL(c.url).pathname))

let fs: FakeFirestore
const T0 = Date.now() - 10 * 60_000
const ORIGIN = 'https://www.nahaber.com'

function account(platform: 'instagram' | 'threads' | 'facebook', externalId: string, ownership: SocialAccountOwnership): SocialAccount {
  const method = platform === 'instagram' ? 'instagram_login' : platform === 'threads' ? 'threads_oauth' : 'facebook_login'
  const part =
    platform === 'facebook' ? { facebook: { pageId: externalId } } : platform === 'instagram' ? { instagram: { igUserId: externalId, linkedFacebookPageId: null } } : { threads: { threadsUserId: externalId } }
  return {
    id: accountIdFor(platform, externalId), externalId, displayName: `acc ${externalId}`, username: `u${externalId}`, ownership,
    status: 'active', statusReason: null, connectedBy: 'x', connectedAt: T0, createdAt: T0, updatedAt: T0, updatedBy: 'x',
    tokenExpiresAt: null, tokenExpiryVerified: true, grantedPermissions: [...requiredPermissionsFor(platform, method)], permissionsVerifiedAt: T0,
    platformAccountType: platform === 'instagram' ? 'BUSINESS' : null, platform, connectionMethod: method, ...part,
  } as SocialAccount
}
async function seed(a: SocialAccount, token: string) {
  await fs.collection('socialAccounts').doc(a.id).set({ ...a })
  const type = a.platform === 'instagram' ? 'instagram_user' : a.platform === 'threads' ? 'threads_user' : 'facebook_page'
  await fs.collection('socialAccountSecrets').doc(a.id).set({ ...(await buildEncryptedSecretRecord(token, type)) })
}
const U1_IG = account('instagram', '9001', { citySlug: null, publisherId: null, ownerUid: 'u1' })
const U2_IG = account('instagram', '9002', { citySlug: null, publisherId: null, ownerUid: 'u2' })
const ANTALYA_IG = account('instagram', '9101', { citySlug: 'antalya', publisherId: null })
const ISTANBUL_IG = account('instagram', '9102', { citySlug: 'istanbul', publisherId: null })
const CENTRAL_IG = account('instagram', '9201', { citySlug: null, publisherId: null, central: true })
const PUB_IG = account('instagram', '9301', { citySlug: null, publisherId: 'pubA' })

async function seedNews(id: string, over: Record<string, unknown> = {}) {
  await fs.collection('news').doc(id).set({
    title: `Haber ${id} başlığı uzun ve açıklayıcı`, spot: 'Haberin spotu yeterince uzun bir özet cümlesi içeriyor, test için.',
    content: 'Haberin gövdesi burada yer alıyor ve paylaşım için gereken uzunluğu sağlıyor. İkinci cümle de var.',
    citySlug: 'antalya', cityName: 'Antalya', categoryId: 'yerel-asayis', thumbnail: 'https://img.example/c.jpg', slug: `haber-${id}`,
    status: 'published', publishedAt: T0 + 60_000, ...over,
  })
}

const req = (path: string, uid: string | null, init: { method?: string; body?: unknown } = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: init.method ?? 'GET',
    headers: { ...(uid ? { authorization: `Bearer tok-${uid}` } : {}), origin: ORIGIN, 'content-type': 'application/json' },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
const ruleBody = (accountId: string, citySlugs: string[], over: Record<string, unknown> = {}) => ({
  name: 'kural', accountId, geo: { kind: 'provinces', citySlugs }, categoryIds: ['yerel-haber', 'asayis'], allCategories: false,
  featuredMode: 'categories_or_featured', featuredKind: 'local', formats: ['post'], dailyLimit: 5, minIntervalMinutes: 15, quietHours: null, ...over,
})

beforeEach(async () => {
  fs = new FakeFirestore()
  h.db = fs
  h.users = { u1: { email: 'u1@x.com' }, u2: { email: 'u2@x.com' }, admin: { email: 'a@nahaber.com' }, ant: { email: 'ant@nahaber.com' }, ed: { email: 'ed@nahaber.com' }, pubOwner: { email: 'p@x.com' } }
  h.publishers = { pubOwner: [{ id: 'pubA', role: 'OWNER', name: 'Yayıncı A' }] }
  await fs.collection('users').doc('u1').set({ role: 'user' })
  await fs.collection('users').doc('u2').set({ role: 'user' })
  await fs.collection('users').doc('admin').set({ role: 'managing_editor' })
  await fs.collection('users').doc('ant').set({ role: 'editor', cmsScope: { provinceSlugs: ['antalya'], districtSlugs: [], categoryIds: [] } })
  await fs.collection('users').doc('ed').set({ role: 'editor' })
  await fs.collection('users').doc('pubOwner').set({ role: 'user' })
  process.env.SECRET_ENCRYPTION_KEY = 'e'.repeat(64)
  process.env.NEXT_PUBLIC_APP_URL = ORIGIN
  process.env.SOCIAL_OAUTH_BASE_URL = ORIGIN
  process.env.SOCIAL_IG_APP_ID = '2222222'
  process.env.SOCIAL_IG_APP_SECRET = 'IG_APP_SECRET_VALUE'
  process.env.CMS_SESSION_SECRET = 'test-cms-session-secret'
  process.env.INSTAGRAM_BUSINESS_ID = '2001'
  delete process.env.SOCIAL_TEST_MODE
  delete process.env.VERCEL_ENV
  for (const [a, t] of [[U1_IG, 'TOK_U1'], [U2_IG, 'TOK_U2'], [ANTALYA_IG, 'TOK_ANT'], [ISTANBUL_IG, 'TOK_IST'], [CENTRAL_IG, 'TOK_CEN'], [PUB_IG, 'TOK_PUB']] as const) await seed(a, t)
  calls = []
  dropPublishResponse = false
  vi.stubGlobal('fetch', fakeFetch)
  vi.stubGlobal('setTimeout', ((fn: () => void) => { fn(); return 0 }) as unknown as typeof setTimeout)
  for (const lvl of ['log', 'warn', 'error', 'info'] as const) vi.spyOn(console, lvl).mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const accountsOf = async (uid: string) => {
  const { GET } = await import('@/app/api/social/accounts/route')
  const r = await GET(req('/api/social/accounts', uid))
  return ((await r.json()) as { accounts: Array<{ id: string; canManage: boolean; canPublish: boolean }> }).accounts
}

describe('hesap görünürlüğü ve bağlantı (rol bazlı)', () => {
  it('normal kullanıcı yalnızca kendi kişisel hesabını görür', async () => {
    expect((await accountsOf('u1')).map((a) => a.id)).toEqual([U1_IG.id])
    expect((await accountsOf('u2')).map((a) => a.id)).toEqual([U2_IG.id])
  })
  it('merkez yönetici kurumsalları yönetir, yayıncıyı yalnız görür, kişisel hesapları görmez', async () => {
    const list = await accountsOf('admin')
    const ids = list.map((a) => a.id).sort()
    expect(ids).toEqual([ANTALYA_IG.id, ISTANBUL_IG.id, CENTRAL_IG.id, PUB_IG.id].sort())
    expect(list.find((a) => a.id === PUB_IG.id)).toMatchObject({ canManage: false, canPublish: false })
  })
  it('il yöneticisi yalnızca kendi ilinin hesabını görür; yayıncı sahibi yalnız kendi yayıncı hesabını', async () => {
    expect((await accountsOf('ant')).map((a) => a.id)).toEqual([ANTALYA_IG.id])
    expect((await accountsOf('pubOwner')).map((a) => a.id)).toEqual([PUB_IG.id])
    expect(await accountsOf('ed')).toEqual([])
  })
  it('kişisel bağlantı başlatılır; normal kullanıcı merkez / il hesabı başlatamaz; istemci ownerUid gönderemez', async () => {
    const { POST } = await import('@/app/api/social/accounts/connect/route')
    const ok = await POST(req('/api/social/accounts/connect', 'u1', { method: 'POST', body: { platform: 'instagram', ownership: { kind: 'user', ownerUid: 'u2' } } }))
    expect(ok.status, JSON.stringify(await ok.clone().json())).toBe(200)
    const st = fs.docs('socialOAuthStates')[0].data as { ownership: SocialAccountOwnership; returnTo: string }
    expect(st.ownership.ownerUid).toBe('u1')
    expect(st.returnTo).toBe('profile')
    for (const ownership of [{ kind: 'central' }, { kind: 'province', citySlug: 'antalya' }, { kind: 'publisher', publisherId: 'pubA' }]) {
      const r = await POST(req('/api/social/accounts/connect', 'u1', { method: 'POST', body: { platform: 'instagram', ownership } }))
      expect(r.status).toBe(403)
    }
    expect((await POST(req('/api/social/accounts/connect', null, { method: 'POST', body: { platform: 'instagram', ownership: { kind: 'user' } } }))).status).toBe(401)
  })
  it('başkasının hesabını duraklatma / yeniden bağlama yok (404, varlığı sızdırmaz)', async () => {
    const { PATCH } = await import('@/app/api/social/accounts/[id]/route')
    const r = await PATCH(req(`/api/social/accounts/${U2_IG.id}`, 'u1', { method: 'PATCH', body: { action: 'pause' } }), { params: Promise.resolve({ id: U2_IG.id }) })
    expect(r.status).toBe(404)
    expect(fs.store.get(`socialAccounts/${U2_IG.id}`)).toMatchObject({ status: 'active' })
    const own = await PATCH(req(`/api/social/accounts/${U1_IG.id}`, 'u1', { method: 'PATCH', body: { action: 'pause' } }), { params: Promise.resolve({ id: U1_IG.id }) })
    expect(own.status).toBe(200)
  })
})

describe('hesap bazlı kurallar', () => {
  const create = async (uid: string, body: unknown) => {
    const { POST } = await import('@/app/api/social/rules/route')
    return POST(req('/api/social/rules', uid, { method: 'POST', body }))
  }
  const enable = async (uid: string, id: string) => {
    const { PATCH } = await import('@/app/api/social/rules/[id]/route')
    return PATCH(req(`/api/social/rules/${id}`, uid, { method: 'PATCH', body: { action: 'enable', confirm: true } }), { params: Promise.resolve({ id }) })
  }

  it('il yöneticisi başka il seçemez, başka il hesabına kural yazamaz; kullanıcı başkasının hesabına yazamaz', async () => {
    expect((await create('ant', ruleBody(ANTALYA_IG.id, ['istanbul']))).status).toBe(403)
    expect((await create('ant', ruleBody(ISTANBUL_IG.id, ['istanbul']))).status).toBe(404)
    expect((await create('ant', ruleBody(ANTALYA_IG.id, ['antalya']))).status).toBe(201)
    expect((await create('u1', ruleBody(U2_IG.id, ['antalya']))).status).toBe(404)
    expect((await create('u1', ruleBody(ANTALYA_IG.id, ['antalya']))).status).toBe(404)
  })

  it('Antalya ve İstanbul hesaplarının bağımsız kuralları: Antalya haberi İstanbul hesabına gitmez', async () => {
    const a = (await (await create('admin', ruleBody(ANTALYA_IG.id, ['antalya']))).json()) as { rule: { id: string } }
    const i = (await (await create('admin', ruleBody(ISTANBUL_IG.id, ['istanbul']))).json()) as { rule: { id: string } }
    expect((await enable('admin', a.rule.id)).status).toBe(200)
    expect((await enable('admin', i.rule.id)).status).toBe(200)
    // kuralların açılış zamanını geçmişe çek (test saati)
    for (const id of [a.rule.id, i.rule.id]) await fs.collection('socialAutomationRules').doc(id).update({ enabledAt: T0 })
    const { invalidateRulesCache } = await import('./automation/ruleStore')
    invalidateRulesCache()
    await seedNews('ant1', { citySlug: 'antalya', categoryId: 'yerel-asayis' })
    await seedNews('ist1', { citySlug: 'istanbul', cityName: 'İstanbul', categoryId: 'asayis', publishedAt: T0 + 70_000 })
    await runAutomationTick({ now: () => Date.now() })
    const jobs = fs.docs('smmQueue').map((d) => d.id).sort()
    expect(jobs).toEqual([`auto__ant1__${ANTALYA_IG.id}__post`, `auto__ist1__${ISTANBUL_IG.id}__post`].sort())
    // Her gönderi kendi hesabının anahtarıyla
    const tokens = publishes().map(accessTokenOf)
    expect(tokens.every((t) => t === 'TOK_ANT' || t === 'TOK_IST')).toBe(true)
  })

  it('kişisel hesap sahibi kendi kuralını açar; başkası açamaz', async () => {
    const c = (await (await create('u1', ruleBody(U1_IG.id, ['antalya']))).json()) as { rule: { id: string } }
    expect((await enable('u2', c.rule.id)).status).toBe(404)
    expect((await enable('u1', c.rule.id)).status).toBe(200)
  })

  it('yayıncı hesabının kuralı yalnızca o yayıncının haberleriyle eşleşir', async () => {
    const r = await create('pubOwner', ruleBody(PUB_IG.id, ['antalya']))
    expect(r.status).toBe(201)
    const rule = ((await r.json()) as { rule: { id: string; publisherId: string } }).rule
    expect(rule.publisherId).toBe('pubA')
    const { POST } = await import('@/app/api/social/rules/preview/route')
    await seedNews('p1', { publisherId: 'pubA' })
    await seedNews('p2', { publisherId: 'pubB' })
    const pv = (await (await POST(req('/api/social/rules/preview', 'pubOwner', { method: 'POST', body: ruleBody(PUB_IG.id, ['antalya']) }))).json()) as { items: Array<{ newsId: string }> }
    expect(pv.items.map((i) => i.newsId)).toEqual(['p1'])
  })
})

describe('Hesabımda yayımla (manuel, açık hedef)', () => {
  const share = async (uid: string, body: unknown) => {
    const { POST } = await import('@/app/api/social/share/route')
    return POST(req('/api/social/share', uid, { method: 'POST', body }))
  }

  it('kullanıcı uygun haberi kendi hesabına yayımlar; kendi anahtarı kullanılır, legacy değil; ikinci istek tekrar göndermez', async () => {
    await seedNews('n1')
    const r = await share('u1', { newsId: 'n1', accountId: U1_IG.id, format: 'post' })
    expect(r.status).toBe(200)
    const body = (await r.json()) as { result: { status: string; platformId: string; account: string } }
    expect(body.result).toMatchObject({ status: 'published', platformId: 'ig-media-1', account: '@u9001' })
    const tokens = publishes().map(accessTokenOf)
    expect(tokens).toEqual(['TOK_U1'])
    expect(calls.some((c) => c.url.includes('/2001/'))).toBe(false)
    const again = await share('u1', { newsId: 'n1', accountId: U1_IG.id, format: 'post' })
    expect(((await again.json()) as { result: { status: string } }).result.status).toBe('already_published')
    expect(publishes()).toHaveLength(1)
  })

  it('başkasının hesabına yayın yok; legacy ya da hedefsiz istek reddedilir', async () => {
    await seedNews('n1')
    expect((await share('u1', { newsId: 'n1', accountId: U2_IG.id, format: 'post' })).status).toBe(404)
    expect((await share('u1', { newsId: 'n1', accountId: 'legacy', format: 'post' })).status).toBe(404)
    expect((await share('u1', { newsId: 'n1', accountId: '', format: 'post' })).status).toBe(404)
    expect(publishes()).toHaveLength(0)
  })

  it('harici kaynak haberi editör onayı olmadan kullanıcı hesabına yüklenmez; neden ve işlem gösterilir', async () => {
    await seedNews('x1', { sourceUrl: 'https://baska.com/haber' })
    const r = await share('u1', { newsId: 'x1', accountId: U1_IG.id, format: 'post' })
    expect(r.status).toBe(409)
    const b = (await r.json()) as { code: string; action: string }
    expect(b.code).toBe('needs_social_review')
    expect(b.action).toContain('Bağlantıyı paylaş')
    expect(publishes()).toHaveLength(0)
    // Editör uygun işaretler (kaynak korunur) → artık yayımlanabilir
    const { POST } = await import('@/app/api/social/eligibility/route')
    const e = await POST(req('/api/social/eligibility', 'ed', { method: 'POST', body: { newsId: 'x1', decision: 'allowed', mediaRights: 'source_permitted' } }))
    expect(e.status).toBe(200)
    expect((fs.store.get('news/x1') as { sourceUrl: string }).sourceUrl).toBe('https://baska.com/haber')
    expect(fs.docs('cmsAuditLogs').some((d) => d.data.action === 'social.eligibility.set')).toBe(true)
    expect((await share('u1', { newsId: 'x1', accountId: U1_IG.id, format: 'post' })).status).toBe(200)
  })

  it('uygunluk kararını normal kullanıcı veremez; il editörü başka ilin haberine veremez', async () => {
    await seedNews('x2', { sourceUrl: 'https://baska.com/h2', citySlug: 'istanbul' })
    const { POST } = await import('@/app/api/social/eligibility/route')
    expect((await POST(req('/api/social/eligibility', 'u1', { method: 'POST', body: { newsId: 'x2', decision: 'allowed', mediaRights: 'own' } }))).status).toBe(401)
    expect((await POST(req('/api/social/eligibility', 'ant', { method: 'POST', body: { newsId: 'x2', decision: 'allowed', mediaRights: 'own' } }))).status).toBe(403)
  })

  it('yayında olmayan / ileri tarihli haber paylaşılamaz', async () => {
    await seedNews('d1', { status: 'draft' })
    await seedNews('f1', { publishedAt: Date.now() + 3600_000 })
    expect((await share('u1', { newsId: 'd1', accountId: U1_IG.id, format: 'post' })).status).toBe(409)
    expect((await share('u1', { newsId: 'f1', accountId: U1_IG.id, format: 'post' })).status).toBe(409)
  })

  it('otomasyonu durdurmak manuel yayını kapatmaz', async () => {
    const { POST: create } = await import('@/app/api/social/rules/route')
    const { PATCH } = await import('@/app/api/social/rules/[id]/route')
    const c = (await (await create(req('/api/social/rules', 'u1', { method: 'POST', body: ruleBody(U1_IG.id, ['antalya']) }))).json()) as { rule: { id: string; enabled: boolean } }
    expect(c.rule.enabled).toBe(false)
    const patch = (action: string) => PATCH(req(`/api/social/rules/${c.rule.id}`, 'u1', { method: 'PATCH', body: { action, confirm: true } }), { params: Promise.resolve({ id: c.rule.id }) })
    expect((await patch('enable')).status).toBe(200)
    expect((await patch('disable')).status).toBe(200)
    await seedNews('m1')
    expect((await share('u1', { newsId: 'm1', accountId: U1_IG.id, format: 'post' })).status).toBe(200)
  })

  it('platform yanıtı kaybolursa sonuç belirsiz; ikinci istek körlemesine yeniden yayımlamaz', async () => {
    await seedNews('u1n')
    dropPublishResponse = true
    const r = await share('u1', { newsId: 'u1n', accountId: U1_IG.id, format: 'post' })
    expect(r.status).toBe(202)
    expect(((await r.json()) as { ledgerStatus: string }).ledgerStatus).toBe('uncertain')
    dropPublishResponse = false
    const again = await share('u1', { newsId: 'u1n', accountId: U1_IG.id, format: 'post' })
    expect(again.status).not.toBe(200)
    expect(publishes()).toHaveLength(1)
  })

  it('haber listesi uygunluk kodunu döndürür; normal kullanıcı personel sayılmaz', async () => {
    await seedNews('e1', { sourceUrl: 'https://baska.com/e1' })
    const { GET: news } = await import('@/app/api/social/news/route')
    const items = ((await (await news(req('/api/social/news', 'u1'))).json()) as { items: Array<{ newsId: string; eligible: boolean; code: string | null }> }).items
    expect(items.find((i) => i.newsId === 'e1')).toMatchObject({ eligible: false, code: 'needs_social_review' })
    const { GET: me } = await import('@/app/api/social/me/route')
    expect(((await (await me(req('/api/social/me', 'u1'))).json()) as { staff: boolean }).staff).toBe(false)
    expect(((await (await me(req('/api/social/me', 'ed'))).json()) as { staff: boolean }).staff).toBe(true)
  })
})

describe('Görev 17 — habere göre hedef hesaplar ve yayın kapsamı', () => {
  const targets = async (uid: string, newsId: string, formats = 'post') => {
    const { GET } = await import('@/app/api/social/targets/route')
    const r = await GET(req(`/api/social/targets?newsId=${newsId}&formats=${formats}`, uid))
    return { status: r.status, options: ((await r.json()) as { options?: Array<{ accountId: string; selectable: boolean; code: string | null }> }).options ?? [] }
  }
  const setScope = async (uid: string, id: string, scope: unknown) => {
    const { PATCH } = await import('@/app/api/social/accounts/[id]/route')
    return PATCH(req(`/api/social/accounts/${id}`, uid, { method: 'PATCH', body: { action: 'scope', scope } }), { params: Promise.resolve({ id }) })
  }

  it('Antalya haberi: Antalya hesabı seçilebilir, İstanbul hesabı kapsam dışı; liste filtresi değil haberin kendi konumu esas', async () => {
    await seedNews('a1', { citySlug: 'antalya' })
    const t = await targets('admin', 'a1')
    expect(t.options.find((o) => o.accountId === ANTALYA_IG.id)).toMatchObject({ selectable: true })
    expect(t.options.find((o) => o.accountId === ISTANBUL_IG.id)).toMatchObject({ selectable: false, code: 'outside_location' })
    // Kişisel hesaplar merkezde görünmez; kullanıcı yalnız kendi hesabını görür.
    expect(t.options.some((o) => o.accountId === U1_IG.id)).toBe(false)
    const u = await targets('u1', 'a1')
    expect(u.options.map((o) => o.accountId)).toEqual([U1_IG.id])
  })

  it('konumu eksik yerel haber ulusal ya da il sayılmaz', async () => {
    await seedNews('nocity', { citySlug: '', cityName: '', categoryId: 'yerel-asayis' })
    expect((await setScope('admin', CENTRAL_IG.id, { geo: { kind: 'national' }, allCategories: true, categoryIds: [], formats: ['post'], manualAccess: 'managers' })).status).toBe(200)
    const t = await targets('admin', 'nocity')
    expect(t.options.find((o) => o.accountId === ANTALYA_IG.id)).toMatchObject({ selectable: false, code: 'outside_location' })
    expect(t.options.find((o) => o.accountId === CENTRAL_IG.id)).toMatchObject({ selectable: false, code: 'outside_location' })
    // Görev 18: «tüm konumlar» hikâye kapsamı da konumu eksik haberi kabul etmez.
    const st = await targets('admin', 'nocity', 'story')
    expect(st.options.find((o) => o.accountId === ANTALYA_IG.id)).toMatchObject({ selectable: false, code: 'outside_location' })
  })

  it('manuel kapsam kategoriye göre sınırlanır ve sunucuda paylaşımda da reddedilir', async () => {
    expect((await setScope('admin', ANTALYA_IG.id, { geo: { kind: 'provinces', citySlugs: ['antalya'] }, allCategories: false, categoryIds: ['spor'], formats: ['post'], manualAccess: 'managers' })).status).toBe(200)
    await seedNews('a2', { citySlug: 'antalya', categoryId: 'yerel-asayis' })
    expect((await targets('admin', 'a2')).options.find((o) => o.accountId === ANTALYA_IG.id)).toMatchObject({ selectable: false })
    const { POST } = await import('@/app/api/social/share/route')
    const r = await POST(req('/api/social/share', 'admin', { method: 'POST', body: { newsId: 'a2', accountId: ANTALYA_IG.id, format: 'post' } }))
    expect(r.status).toBe(409)
    expect(publishes()).toHaveLength(0)
  })

  it('il yöneticisi kapsamı kendi iliyle sınırlı; başka ilin hesabının kapsamını değiştiremez', async () => {
    expect((await setScope('ant', ANTALYA_IG.id, { geo: { kind: 'all_provinces' }, allCategories: true, categoryIds: [], formats: ['post'], manualAccess: 'managers' })).status).toBe(403)
    expect((await setScope('ant', ISTANBUL_IG.id, { geo: { kind: 'provinces', citySlugs: ['istanbul'] }, allCategories: true, categoryIds: [], formats: ['post'], manualAccess: 'managers' })).status).toBe(404)
    expect((await setScope('u1', ANTALYA_IG.id, { geo: { kind: 'any' }, allCategories: true, categoryIds: [], formats: ['post'], manualAccess: 'managers' })).status).toBe(404)
  })

  it('«kapsamdaki editörler»: yetkisiz editör önce göremez; açılınca yalnız kendi kapsamındaki habere paylaşabilir', async () => {
    await seedNews('a3', { citySlug: 'antalya' })
    await seedNews('i3', { citySlug: 'istanbul', cityName: 'İstanbul' })
    expect((await targets('ed', 'a3')).options.some((o) => o.accountId === ANTALYA_IG.id)).toBe(false)
    expect((await setScope('admin', ANTALYA_IG.id, { geo: { kind: 'provinces', citySlugs: ['antalya'] }, allCategories: true, categoryIds: [], formats: ['post'], manualAccess: 'scope_editors' })).status).toBe(200)
    expect((await targets('ed', 'a3')).options.find((o) => o.accountId === ANTALYA_IG.id)).toMatchObject({ selectable: true })
    expect((await targets('ed', 'i3')).options.some((o) => o.accountId === ISTANBUL_IG.id)).toBe(false)
    // Normal kullanıcı kurumsal hesabı hiçbir koşulda görmez.
    expect((await targets('u2', 'a3')).options.some((o) => o.accountId === ANTALYA_IG.id)).toBe(false)
  })

  it('«Bağlantıyı kaldır»: anahtar silinir, kurallar kapanır, geçmiş korunur; başkası kaldıramaz', async () => {
    const { DELETE } = await import('@/app/api/social/accounts/[id]/route')
    const del = (uid: string, id: string) => DELETE(req(`/api/social/accounts/${id}`, uid, { method: 'DELETE' }), { params: Promise.resolve({ id }) })
    await fs.collection('socialPublishRecords').doc(`n9__${U1_IG.id}__post`).set({ newsId: 'n9', accountId: U1_IG.id, status: 'succeeded', externalPostId: 'p1' })
    expect((await del('u2', U1_IG.id)).status).toBe(404)
    expect((await del('u1', U1_IG.id)).status).toBe(200)
    expect(fs.store.has(`socialAccountSecrets/${U1_IG.id}`)).toBe(false)
    expect(fs.store.get(`socialAccounts/${U1_IG.id}`)).toMatchObject({ status: 'disabled', username: null, grantedPermissions: null, ownership: { ownerUid: 'u1' } })
    expect(fs.store.get(`socialPublishRecords/n9__${U1_IG.id}__post`)).toMatchObject({ externalPostId: 'p1' })
    expect(fs.docs('cmsAuditLogs').some((d) => d.data.action === 'social.account.disconnect')).toBe(true)
  })
})


describe('Görev 18 — gönderi yerel, manuel hikâye genel', () => {
  const targets = async (uid: string, newsId: string, formats = 'post') => {
    const { GET } = await import('@/app/api/social/targets/route')
    const r = await GET(req(`/api/social/targets?newsId=${newsId}&formats=${formats}`, uid))
    return ((await r.json()) as { options?: Array<{ accountId: string; selectable: boolean; code: string | null; reason: string | null; reconnect: boolean }> }).options ?? []
  }
  const pick = (opts: Awaited<ReturnType<typeof targets>>, id: string) => opts.find((o) => o.accountId === id)
  const share = async (uid: string, body: Record<string, unknown>) => {
    const { POST } = await import('@/app/api/social/share/route')
    return POST(req('/api/social/share', uid, { method: 'POST', body }))
  }

  it('1-2) il hesabı: ulusal ve başka il haberi manuel hikâyede seçilebilir, gönderide seçilemez', async () => {
    await seedNews('ist', { citySlug: 'istanbul', cityName: 'İstanbul', categoryId: 'yerel-asayis' })
    await seedNews('nat', { citySlug: '', cityName: '', categoryId: 'gundem' })
    await seedNews('dunya', { citySlug: '', cityName: '', categoryId: 'dunya' })
    for (const id of ['ist', 'nat', 'dunya']) {
      expect(pick(await targets('admin', id, 'story'), ANTALYA_IG.id)).toMatchObject({ selectable: true })
      expect(pick(await targets('admin', id, 'post'), ANTALYA_IG.id)).toMatchObject({ selectable: false, code: 'outside_location' })
    }
    // Sunucu da aynı kararı verir: başka ilin haberi Antalya hesabına gönderi olamaz.
    const r = await share('admin', { newsId: 'ist', accountId: ANTALYA_IG.id, format: 'post' })
    expect(r.status).toBe(409)
    expect(((await r.json()) as { code?: string }).code).toBe('outside_location')
    expect(publishes()).toHaveLength(0)
  })

  it('il yetkisi hikâye kapsamından ayrıdır: il editörü başka ilin hesabını hikâyede de görmez / yönetemez', async () => {
    await seedNews('nat2', { citySlug: '', cityName: '', categoryId: 'gundem' })
    expect((await targets('ant', 'nat2', 'story')).some((o) => o.accountId === ISTANBUL_IG.id)).toBe(false)
    const { PATCH } = await import('@/app/api/social/accounts/[id]/route')
    const r = await PATCH(req(`/api/social/accounts/${ISTANBUL_IG.id}`, 'ant', { method: 'PATCH', body: { action: 'scope', scope: { geo: { kind: 'provinces', citySlugs: ['istanbul'] }, storyGeo: { kind: 'any' }, allCategories: true, categoryIds: [], formats: ['post', 'story'], manualAccess: 'managers' } } }), { params: Promise.resolve({ id: ISTANBUL_IG.id }) })
    expect(r.status).toBe(404)
  })

  it('kapsam kaydı hikâye konumunu korur; il yöneticisi gönderiyi kendi iliyle sınırlar ama hikâyeyi genel bırakabilir', async () => {
    const { PATCH } = await import('@/app/api/social/accounts/[id]/route')
    const patch = (uid: string, scope: unknown) => PATCH(req(`/api/social/accounts/${ANTALYA_IG.id}`, uid, { method: 'PATCH', body: { action: 'scope', scope } }), { params: Promise.resolve({ id: ANTALYA_IG.id }) })
    expect((await patch('ant', { geo: { kind: 'provinces', citySlugs: ['antalya'] }, storyGeo: { kind: 'any' }, allCategories: true, categoryIds: [], formats: ['post', 'story'], manualAccess: 'managers' })).status).toBe(200)
    // storyGeo gönderilmezse mevcut hikâye kapsamı daralmaz.
    expect((await patch('admin', { geo: { kind: 'provinces', citySlugs: ['antalya'] }, allCategories: true, categoryIds: [], formats: ['post', 'story'], manualAccess: 'managers' })).status).toBe(200)
    expect((fs.store.get(`socialAccounts/${ANTALYA_IG.id}`) as { publishScope: { storyGeo: unknown } }).publishScope.storyGeo).toEqual({ kind: 'any' })
  })

  it('3) manuel kapsam otomasyon kuralından bağımsız: kurala uymayan haber manuel hikâyede engellenmez', async () => {
    const { POST } = await import('@/app/api/social/rules/route')
    const c = await POST(req('/api/social/rules', 'admin', { method: 'POST', body: ruleBody(ANTALYA_IG.id, ['antalya'], { categoryIds: ['yerel-asayis'] }) }))
    expect(c.status).toBe(201)
    await seedNews('spor', { citySlug: 'izmir', cityName: 'İzmir', categoryId: 'yerel-spor' })
    expect(pick(await targets('admin', 'spor', 'story'), ANTALYA_IG.id)).toMatchObject({ selectable: true })
  })

  it('6) bozuk hesap başka hesaba / legacy anahtara düşmez; «yeniden bağlantı gerekli» ayrı nedenle gösterilir', async () => {
    await fs.collection('socialAccounts').doc(ANTALYA_IG.id).update({ status: 'needs_reauth', statusReason: 'Platform erişimi reddetti' })
    await seedNews('a9', { citySlug: 'antalya' })
    expect(pick(await targets('admin', 'a9', 'post'), ANTALYA_IG.id)).toMatchObject({ selectable: false, code: 'reconnect_required', reconnect: true })
    const r = await share('admin', { newsId: 'a9', accountId: ANTALYA_IG.id, format: 'post' })
    expect(r.status).toBe(409)
    expect(publishes()).toHaveLength(0)
    expect(calls.some((c) => accessTokenOf(c) !== null)).toBe(false)
  })

  it('biçim nedeni ayrı: kapsamda kapalı biçim «format_not_allowed», desteklenmeyen biçim «format_unsupported»', async () => {
    const { PATCH } = await import('@/app/api/social/accounts/[id]/route')
    await PATCH(req(`/api/social/accounts/${ANTALYA_IG.id}`, 'admin', { method: 'PATCH', body: { action: 'scope', scope: { geo: { kind: 'provinces', citySlugs: ['antalya'] }, allCategories: true, categoryIds: [], formats: ['post'], manualAccess: 'managers' } } }), { params: Promise.resolve({ id: ANTALYA_IG.id }) })
    await seedNews('a10', { citySlug: 'antalya' })
    expect(pick(await targets('admin', 'a10', 'story'), ANTALYA_IG.id)).toMatchObject({ selectable: false, code: 'format_not_allowed' })
    const { manualTargetCheck } = await import('./accounts/manualTargets')
    const TH = account('threads', '9501', { citySlug: 'antalya', publisherId: null })
    const actor = { uid: 'admin', isStaff: true, central: true, provinces: [], publisherIds: [] } as unknown as Parameters<typeof manualTargetCheck>[0]
    const c = manualTargetCheck(actor, TH, { id: 'a10', data: { citySlug: 'antalya', categoryId: 'yerel-asayis' } }, ['story'], Date.now())
    expect(c).toMatchObject({ ok: false, code: 'format_unsupported' })
  })

  it('7) manuel hikâye kapsamı otomatik hikâyeyi açmaz: öne çıkan koşulu olmadan hikâye kuralı reddedilir; taslaklar kapalı ve yalnız gönderi', async () => {
    const { POST } = await import('@/app/api/social/rules/route')
    const bad = await POST(req('/api/social/rules', 'admin', { method: 'POST', body: ruleBody(ANTALYA_IG.id, ['antalya'], { formats: ['story'] }) }))
    expect(bad.status).toBe(400)
    const { draftRuleFor } = await import('./automation/drafts')
    const draft = draftRuleFor({ id: ANTALYA_IG.id, displayName: 'x', username: null, ownerKind: 'province', ownership: { citySlug: 'antalya' } }, (s) => s)!
    expect(draft).toMatchObject({ formats: ['post'], geo: { kind: 'provinces', citySlugs: ['antalya'] }, featuredMode: 'categories_or_featured', featuredKind: 'local', dailyLimit: 5, minIntervalMinutes: 15 })
    const central = draftRuleFor({ id: CENTRAL_IG.id, displayName: 'x', username: null, ownerKind: 'central', ownership: { citySlug: null } }, (s) => s)!
    expect(central).toMatchObject({ geo: { kind: 'national' }, featuredKind: 'national', categoryIds: ['asayis'] })
    const ok = await POST(req('/api/social/rules', 'admin', { method: 'POST', body: draft }))
    expect(ok.status).toBe(201)
    expect(((await ok.json()) as { rule: { enabled: boolean; enabledAt: number | null } }).rule).toMatchObject({ enabled: false, enabledAt: null })
  })

  it('12) yeni kural kapalı: worker çalışsa da geçmiş ve yeni haber gönderilmez', async () => {
    const { POST } = await import('@/app/api/social/rules/route')
    await POST(req('/api/social/rules', 'admin', { method: 'POST', body: ruleBody(ANTALYA_IG.id, ['antalya']) }))
    await seedNews('old', { citySlug: 'antalya', publishedAt: T0 - 86_400_000 })
    await seedNews('new', { citySlug: 'antalya', publishedAt: Date.now() })
    await runAutomationTick({ now: () => Date.now() })
    expect(publishes()).toHaveLength(0)
    expect(fs.docs('smmQueue').filter((d) => d.data.kind === 'account_automation')).toHaveLength(0)
  })

  it('10) bağlantıyı kaldırma bekleyen işleri iptal eder; kaldırılan hesap seçilemez ve eski anahtara düşmez', async () => {
    await fs.collection('smmQueue').doc('job1').set({ kind: 'account_automation', accountId: ANTALYA_IG.id, newsId: 'n1', format: 'post', status: 'queued', history: [] })
    const { DELETE } = await import('@/app/api/social/accounts/[id]/route')
    const r = await DELETE(req(`/api/social/accounts/${ANTALYA_IG.id}`, 'admin', { method: 'DELETE' }), { params: Promise.resolve({ id: ANTALYA_IG.id }) })
    expect(r.status).toBe(200)
    expect(fs.store.get('smmQueue/job1')).toMatchObject({ status: 'cancelled', errorCode: 'account_disconnected' })
    await seedNews('a11', { citySlug: 'antalya' })
    expect(pick(await targets('admin', 'a11', 'post'), ANTALYA_IG.id)).toMatchObject({ selectable: false })
    expect((await share('admin', { newsId: 'a11', accountId: ANTALYA_IG.id, format: 'post' })).status).toBe(409)
    expect(publishes()).toHaveLength(0)
  })

  it('11) hesap listesi son kontrol ve yenileme zamanını döndürür; süresi dolan anahtar «yeniden bağlantı gerekli» olur', async () => {
    await fs.collection('socialAccounts').doc(ANTALYA_IG.id).update({ connectionCheckedAt: T0 + 5, tokenRefreshedAt: T0 + 6 })
    const list = (await accountsOf('admin')) as Array<{ id: string; connectionCheckedAt?: number; tokenRefreshedAt?: number }>
    expect(list.find((a) => a.id === ANTALYA_IG.id)).toMatchObject({ connectionCheckedAt: T0 + 5, tokenRefreshedAt: T0 + 6 })
    await fs.collection('socialAccounts').doc(ISTANBUL_IG.id).update({ tokenExpiresAt: Date.now() - 1000 })
    await seedNews('i11', { citySlug: 'istanbul', cityName: 'İstanbul' })
    expect(pick(await targets('admin', 'i11', 'post'), ISTANBUL_IG.id)).toMatchObject({ selectable: false, code: 'reconnect_required' })
  })
})

describe('Görev 18 EK — kategori ve konum bazlı hesaplar', () => {
  const targets = async (uid: string, newsId: string, formats = 'post') => {
    const { GET } = await import('@/app/api/social/targets/route')
    const r = await GET(req(`/api/social/targets?newsId=${newsId}&formats=${formats}`, uid))
    return ((await r.json()) as { options?: Array<{ accountId: string; selectable: boolean; code: string | null }> }).options ?? []
  }
  const pick = (opts: Awaited<ReturnType<typeof targets>>, id: string) => opts.find((o) => o.accountId === id)
  const setScope = async (uid: string, id: string, scope: unknown) => {
    const { PATCH } = await import('@/app/api/social/accounts/[id]/route')
    return PATCH(req(`/api/social/accounts/${id}`, uid, { method: 'PATCH', body: { action: 'scope', scope } }), { params: Promise.resolve({ id }) })
  }

  it('merkez kategori hesabı (Magazin): il gerekmeden tüm konumlar VE Magazin; başka kategori seçilemez', async () => {
    expect((await setScope('admin', CENTRAL_IG.id, { geo: { kind: 'any' }, allCategories: false, categoryIds: ['magazin'], formats: ['post', 'story'], manualAccess: 'managers' })).status).toBe(200)
    await seedNews('mag', { citySlug: '', cityName: '', categoryId: 'magazin' })
    await seedNews('magIl', { citySlug: 'izmir', cityName: 'İzmir', categoryId: 'yerel-magazin' })
    await seedNews('spr', { citySlug: '', cityName: '', categoryId: 'spor' })
    expect(pick(await targets('admin', 'mag'), CENTRAL_IG.id)).toMatchObject({ selectable: true })
    expect(pick(await targets('admin', 'magIl'), CENTRAL_IG.id)).toMatchObject({ selectable: true }) // Yerel Magazin ≙ Magazin
    expect(pick(await targets('admin', 'spr'), CENTRAL_IG.id)).toMatchObject({ selectable: false, code: 'outside_category' })
    // Hikâye kategorisi ayrı: gönderi Magazin'e daraltıldı diye hikâye kısıtlanmaz (merkez varsayılanı tüm kategoriler).
    expect(pick(await targets('admin', 'spr', 'story'), CENTRAL_IG.id)).toMatchObject({ selectable: true })
  })

  it('konum + kategori (Antalya Spor) VE ile eşleşir; alt kategori sessizce kapsanmaz; çoklu kategori VEYA', async () => {
    expect((await setScope('admin', ANTALYA_IG.id, { geo: { kind: 'provinces', citySlugs: ['antalya'] }, allCategories: false, categoryIds: ['spor'], formats: ['post'], manualAccess: 'managers' })).status).toBe(200)
    await seedNews('as', { citySlug: 'antalya', categoryId: 'yerel-spor' })
    await seedNews('af', { citySlug: 'antalya', categoryId: 'futbol' })
    await seedNews('is', { citySlug: 'istanbul', cityName: 'İstanbul', categoryId: 'yerel-spor' })
    await seedNews('aa', { citySlug: 'antalya', categoryId: 'yerel-asayis' })
    expect(pick(await targets('admin', 'as'), ANTALYA_IG.id)).toMatchObject({ selectable: true })
    expect(pick(await targets('admin', 'af'), ANTALYA_IG.id)).toMatchObject({ selectable: false, code: 'outside_category' })
    expect(pick(await targets('admin', 'is'), ANTALYA_IG.id)).toMatchObject({ selectable: false, code: 'outside_location' })
    expect(pick(await targets('admin', 'aa'), ANTALYA_IG.id)).toMatchObject({ selectable: false, code: 'outside_category' })
    expect((await setScope('admin', ANTALYA_IG.id, { geo: { kind: 'provinces', citySlugs: ['antalya'] }, allCategories: false, categoryIds: ['spor', 'futbol'], formats: ['post'], manualAccess: 'managers' })).status).toBe(200)
    expect(pick(await targets('admin', 'af'), ANTALYA_IG.id)).toMatchObject({ selectable: true })
  })

  it('hikâye kategori kapsamı ayrıca düzenlenir ve sunucuda uygulanır; yetkisiz kullanıcı kapsam değiştiremez', async () => {
    expect((await setScope('admin', CENTRAL_IG.id, { geo: { kind: 'any' }, allCategories: true, categoryIds: [], storyGeo: { kind: 'any' }, storyAllCategories: false, storyCategoryIds: ['magazin'], formats: ['post', 'story'], manualAccess: 'managers' })).status).toBe(200)
    await seedNews('g1', { citySlug: '', cityName: '', categoryId: 'gundem' })
    expect(pick(await targets('admin', 'g1', 'post'), CENTRAL_IG.id)).toMatchObject({ selectable: true })
    expect(pick(await targets('admin', 'g1', 'story'), CENTRAL_IG.id)).toMatchObject({ selectable: false, code: 'outside_category' })
    expect((await setScope('ant', CENTRAL_IG.id, { geo: { kind: 'any' }, allCategories: true, categoryIds: [], formats: ['post'], manualAccess: 'managers' })).status).toBe(404)
    expect((await setScope('u1', CENTRAL_IG.id, { geo: { kind: 'any' }, allCategories: true, categoryIds: [], formats: ['post'], manualAccess: 'managers' })).status).toBe(404)
  })

  it('kapsam seçmek otomasyonu açmaz: kategori hesabının kuralı kapalı oluşur, kural yokken iş üretilmez', async () => {
    await setScope('admin', CENTRAL_IG.id, { geo: { kind: 'any' }, allCategories: false, categoryIds: ['magazin'], formats: ['post'], manualAccess: 'managers' })
    await seedNews('m2', { citySlug: '', cityName: '', categoryId: 'magazin', publishedAt: Date.now() })
    await runAutomationTick({ now: () => Date.now() })
    expect(fs.docs('smmQueue').filter((d) => d.data.kind === 'account_automation')).toHaveLength(0)
    const { POST } = await import('@/app/api/social/rules/route')
    const r = await POST(req('/api/social/rules', 'admin', { method: 'POST', body: { name: 'Magazin öne çıkan', accountId: CENTRAL_IG.id, geo: { kind: 'any' }, categoryIds: ['magazin'], allCategories: false, featuredMode: 'featured_in_categories', featuredKind: 'either', formats: ['post'], dailyLimit: 5, minIntervalMinutes: 15, quietHours: null } }))
    expect(r.status).toBe(201)
    expect(((await r.json()) as { rule: { enabled: boolean } }).rule.enabled).toBe(false)
    expect(publishes()).toHaveLength(0)
  })
})

describe('Görev 18 EK — hedef seçici ortak kilit durumunu gösterir', () => {
  it('zaten yayımlanmış / belirsiz hesap görünür ama seçilemez; diğer hesap seçilebilir', async () => {
    await seedNews('L1', { citySlug: '', cityName: '', categoryId: 'gundem' })
    await fs.collection('socialPublishRecords').doc(`L1__${ANTALYA_IG.id}__story`).set({ newsId: 'L1', accountId: ANTALYA_IG.id, format: 'story', status: 'succeeded', externalPostId: 'p9' })
    await fs.collection('socialPublishRecords').doc(`L1__${ISTANBUL_IG.id}__story`).set({ newsId: 'L1', accountId: ISTANBUL_IG.id, format: 'story', status: 'uncertain', externalPostId: null })
    const { GET } = await import('@/app/api/social/targets/route')
    const r = await GET(req('/api/social/targets?newsId=L1&formats=story', 'admin'))
    const opts = ((await r.json()) as { options: Array<{ accountId: string; selectable: boolean; code: string | null }> }).options
    expect(opts.find((o) => o.accountId === ANTALYA_IG.id)).toMatchObject({ selectable: false, code: 'already_published' })
    expect(opts.find((o) => o.accountId === ISTANBUL_IG.id)).toMatchObject({ selectable: false, code: 'uncertain_previous_attempt' })
    expect(opts.find((o) => o.accountId === CENTRAL_IG.id)).toMatchObject({ selectable: true })
  })
})
