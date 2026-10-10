/**
 * Hesap bazlı otomasyon uçtan uca: kural → reconcile → kuyruk → worker →
 * publishOneSocial → ledger → taklit Meta. Gerçek Meta / Firebase yok.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from '../accounts/testing/fakeFirestore'
import { cannedMetaResponse, type RecordedCall } from '../accounts/testing/fetchRecorder'

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
import { buildEncryptedSecretRecord } from '../accounts/secretStore'
import { accountIdFor, requiredPermissionsFor, type SocialAccount } from '../accounts/types'
import { withLegacyPublishLock } from '../accounts/legacyLock'
import { createRule, setRuleEnabled, setLegacyHandoff, listRules } from './ruleStore'
import { runAutomationTick } from './worker'
import { claimDueJobs, enqueueJob, JOB_LEASE_MS, recoverExpiredLeases } from './jobs'
import type { AutomationRuleInput } from './types'
import { istanbulParts } from './limits'

let calls: RecordedCall[] = []
let logs: string[] = []
let failRule: ((url: string, method: string) => 'throw' | 'token' | 'rate' | null) | null = null
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  calls.push({ url, method, body: init?.body ? String(init.body) : '' })
  const f = failRule?.(url, method)
  if (f === 'throw') throw new TypeError('fetch failed')
  if (f === 'token') return new Response(JSON.stringify({ error: { message: 'Error validating access token', code: 190, error_subcode: 460 } }), { status: 400 })
  if (f === 'rate') return new Response(JSON.stringify({ error: { message: 'Application request limit reached', code: 4 } }), { status: 400 })
  return cannedMetaResponse(url, method)
}
const publishes = () => calls.filter((c) => /\/(media_publish|threads_publish|photos|photo_stories)$/.test(new URL(c.url).pathname) && c.method === 'POST')

let fs: FakeFirestore
const T0 = Date.now() - 10 * 60 * 1000
const SECRETS = ['IGAA_TOKEN_A', 'EAAG_PAGE_ONY', 'THQ_TOKEN_A', 'LEGACY_FB_TOKEN', 'LEGACY_IG_TOKEN', 'LEGACY_TH_TOKEN']

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
    connectedAt: T0,
    createdAt: T0,
    updatedAt: T0,
    updatedBy: 'admin1',
    tokenExpiresAt: null,
    tokenExpiryVerified: true,
    grantedPermissions: [...requiredPermissionsFor(over.platform, over.connectionMethod)],
    permissionsVerifiedAt: T0,
    platformAccountType: over.platform === 'instagram' ? 'BUSINESS' : null,
    ...platformPart,
    ...over,
  } as SocialAccount
}
async function seed(a: SocialAccount, token: string, type: 'facebook_page' | 'instagram_user' | 'threads_user') {
  await fs.collection('socialAccounts').doc(a.id).set({ ...a })
  await fs.collection('socialAccountSecrets').doc(a.id).set({ ...(await buildEncryptedSecretRecord(token, type)) })
}
const IG_ANTALYA = account({ platform: 'instagram', externalId: '7771', connectionMethod: 'instagram_login' })
// Onyeditivi'nin legacy FB sayfası (1001) aynı dış hesap — resmî bağlantıyla da bağlı.
const FB_ONY = account({ platform: 'facebook', externalId: '1001', connectionMethod: 'facebook_login', ownership: { citySlug: 'canakkale', publisherId: null } })

async function seedNews(id: string, over: Record<string, unknown> = {}) {
  await fs.collection('news').doc(id).set({
    title: `Antalya’da yeni tramvay hattı hizmete açıldı ${id}`,
    spot: 'Yeni hat 12 durakla şehir merkezini havalimanına bağlıyor ve günde 40 bin yolcu taşıyacak.',
    content: 'Antalya Büyükşehir Belediyesi yeni tramvay hattını hizmete açtı. Hat 12 duraktan oluşuyor ve günlük 40 bin yolcu kapasitesine sahip.',
    citySlug: 'antalya',
    cityName: 'Antalya',
    categoryId: 'yerel-gundem',
    thumbnail: 'https://img.example/cover.jpg',
    slug: `antalya-tramvay-${id}`,
    status: 'published',
    publishedAt: T0 + 60_000,
    ...over,
  })
}

function ruleInput(over: Partial<AutomationRuleInput> = {}): AutomationRuleInput {
  return {
    name: 'Antalya yerel',
    accountId: IG_ANTALYA.id,
    geo: { kind: 'provinces', citySlugs: ['antalya'] },
    categoryIds: ['yerel-haber'],
    allCategories: false,
    featuredMode: 'categories_only',
    featuredKind: 'either',
    formats: ['post'],
    dailyLimit: 10,
    minIntervalMinutes: 5,
    quietHours: null,
    ...over,
  }
}

async function enabledRule(over: Partial<AutomationRuleInput> = {}, at = T0) {
  const c = await createRule(ruleInput(over), 'admin1', at)
  if (!c.ok) throw new Error(c.message)
  const e = await setRuleEnabled(c.rule.id, true, 'admin1', at)
  if (!e.ok) throw new Error(e.message)
  return e.rule
}

const job = (newsId: string, accountId = IG_ANTALYA.id, format = 'post') => fs.store.get(`smmQueue/auto__${newsId}__${accountId}__${format}`) as Record<string, unknown> | undefined
let clock = Date.now()
const tick = (publish?: typeof publishOneSocial) => runAutomationTick({ now: () => clock, ...(publish ? { publish } : {}) })

beforeEach(async () => {
  fs = new FakeFirestore()
  h.db = fs
  h.users = { admin1: { email: 'me@nahaber.com' }, editor1: { email: 'ed@nahaber.com' }, scoped1: { email: 'il@nahaber.com' } }
  await fs.collection('users').doc('admin1').set({ role: 'managing_editor' })
  await fs.collection('users').doc('editor1').set({ role: 'editor' })
  await fs.collection('users').doc('scoped1').set({ role: 'managing_editor', cmsScope: { kind: 'city', citySlugs: ['antalya'] } })
  process.env.SECRET_ENCRYPTION_KEY = 'e'.repeat(64)
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.nahaber.com'
  process.env.INSTAGRAM_BUSINESS_ID = '2001'
  process.env.THREADS_USER_ID = '3001'
  process.env.THREADS_ACCESS_TOKEN = 'LEGACY_TH_TOKEN'
  delete process.env.SOCIAL_TEST_MODE
  delete process.env.VERCEL_ENV
  await seed(IG_ANTALYA, 'IGAA_TOKEN_A', 'instagram_user')
  await seed(FB_ONY, 'EAAG_PAGE_ONY', 'facebook_page')
  clock = Date.now()
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
  for (const [path, doc] of fs.store) {
    const raw = JSON.stringify(doc)
    for (const s of SECRETS) expect(raw, `firestore plaintext ${s} in ${path}`).not.toContain(s)
  }
  for (const s of SECRETS) expect(logs.join('\n'), `log leak ${s}`).not.toContain(s)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('kurallar kapalı teslim edilir', () => {
  it('yeni kural kapalı oluşur; açık kural yokken worker haber taramaz', async () => {
    const c = await createRule(ruleInput(), 'admin1', T0)
    expect(c.ok && c.rule.enabled).toBe(false)
    await seedNews('n1')
    const readsBefore = fs.reads
    const r = await tick()
    expect(r.reconcile?.ran).toBe(false)
    expect(publishes()).toHaveLength(0)
    // boşta: kural sorgusu + vadesi gelen iş + süresi dolan kira (3 küçük sorgu), haber taraması yok
    expect(fs.reads - readsBefore).toBeLessThanOrEqual(3)
    expect(job('n1')).toBeUndefined()
  })

  it('yayın izni olmayan / yeniden bağlantı bekleyen hesapta kural açılamaz', async () => {
    await fs.collection('socialAccounts').doc(IG_ANTALYA.id).update({ status: 'needs_reauth' })
    const c = await createRule(ruleInput(), 'admin1', T0)
    if (!c.ok) throw new Error('create')
    const e = await setRuleEnabled(c.rule.id, true, 'admin1', T0)
    expect(e.ok).toBe(false)
  })

  it('desteklenmeyen biçim reddedilir (Threads hikâye yok)', async () => {
    const th = account({ platform: 'threads', externalId: '8881', connectionMethod: 'threads_oauth' })
    await seed(th, 'THQ_TOKEN_A', 'threads_user')
    const c = await createRule(ruleInput({ accountId: th.id, formats: ['story'] }), 'admin1', T0)
    expect(c.ok).toBe(false)
  })
})

describe('eşleşme → iş → yayın', () => {
  it('Antalya haberi Antalya hesabına tek kez gider; Ankara ve kural öncesi haber gitmez', async () => {
    await enabledRule()
    await seedNews('n1')
    await seedNews('n2', { citySlug: 'ankara', cityName: 'Ankara' })
    await seedNews('n0', { publishedAt: T0 - 60_000 })
    const r = await tick()
    expect(r.reconcile?.enqueued).toBe(1)
    expect(job('n2')).toBeUndefined()
    expect(job('n0')).toBeUndefined()
    expect(job('n1')).toMatchObject({ status: 'published', kind: 'account_automation' })
    expect(publishes()).toHaveLength(1)
    expect(publishes()[0].url).toContain('/7771/media_publish')
    expect(fs.store.get(`socialPublishRecords/n1__${IG_ANTALYA.id}__post`)).toMatchObject({ status: 'succeeded', lastTrigger: 'automation' })
    // Onyeditivi alanları başka hesabın yayınıyla doldurulmaz
    expect((fs.store.get('news/n1') as Record<string, unknown>).instagramMediaId).toBeUndefined()
    // Tekrar tick: yeni iş / yeni yayın yok
    clock += 10 * 60_000
    await tick()
    expect(publishes()).toHaveLength(1)
  })

  it('aynı hesaba iki kural eşleşse de tek iş, tek gönderi', async () => {
    const a = await enabledRule()
    const b = await enabledRule({ name: 'Antalya hepsi', categoryIds: [], allCategories: true })
    await seedNews('n1')
    await tick()
    expect(job('n1')?.ruleIds).toEqual([a.id, b.id])
    expect(publishes()).toHaveLength(1)
  })

  it('otomasyon AI metin üretmez', async () => {
    const ai = await import('@/lib/social/aiSocialEditor')
    await enabledRule()
    await seedNews('n1')
    await tick()
    expect(ai.generateSocialContent).not.toHaveBeenCalled()
  })

  it('harici kaynak / video haber kuyruğa girmez', async () => {
    await enabledRule()
    await seedNews('n1', { sourceUrl: 'https://baska-site.com/haber' })
    await seedNews('n2', { hasVideo: true })
    await tick()
    expect(job('n1')).toBeUndefined()
    expect(job('n2')).toBeUndefined()
  })
})

describe('eşzamanlılık: manuel + otomasyon + legacy tek gönderi', () => {
  it('worker ile manuel paylaşım aynı anda → platformda tek gönderi', async () => {
    await enabledRule()
    await seedNews('n1')
    const [, manual] = await Promise.all([
      tick(),
      publishOneSocial('n1', { mode: 'post', manual: true, actorUid: 'admin1', targets: { instagram: IG_ANTALYA.id }, overrides: { platforms: { facebook: false, instagram: true, threads: false, twitter: false } } }),
    ])
    expect(publishes()).toHaveLength(1)
    expect(manual).toBeDefined()
    expect(['published', 'queued']).toContain(job('n1')?.status)
  })

  it('iki worker aynı işi alamaz', async () => {
    await enabledRule()
    await seedNews('n1')
    await enqueueJob({ newsId: 'n1', accountId: IG_ANTALYA.id, platform: 'instagram', format: 'post', ruleIds: ['x'], citySlug: 'antalya', newsTitle: 't', dueAt: clock, now: clock })
    const [a, b] = await Promise.all([claimDueJobs(clock, 3), claimDueJobs(clock, 3)])
    expect(a.length + b.length).toBe(1)
  })

  it('legacy cron ile otomasyon aynı Onyeditivi hesabına → tek gönderi (ortak kilit)', async () => {
    await enabledRule({ accountId: FB_ONY.id, geo: { kind: 'provinces', citySlugs: ['antalya'] } })
    await seedNews('n1')
    const legacy = withLegacyPublishLock({ platform: 'facebook', format: 'post', newsId: 'n1', options: { trigger: 'cron' } }, async () => {
      calls.push({ url: 'https://graph.facebook.com/v21.0/1001/photos', method: 'POST', body: '' })
      return { success: true, platformId: 'fb-post-legacy' }
    })
    await Promise.all([tick(), legacy])
    expect(publishes()).toHaveLength(1)
  })
})

describe('legacy devri', () => {
  it('devredilen hesapta eski otomatik yol (cron/after) yayın yapmaz; manuel legacy yapar', async () => {
    const h1 = await setLegacyHandoff(FB_ONY.id, true, 'admin1', clock)
    expect(h1.ok).toBe(true)
    await seedNews('n1')
    let ran = 0
    const run = async () => { ran++; return { success: true, platformId: 'fb-x' } }
    const cron = await withLegacyPublishLock({ platform: 'facebook', format: 'post', newsId: 'n1', options: { trigger: 'cron' } }, run)
    const after = await withLegacyPublishLock({ platform: 'facebook', format: 'post', newsId: 'n1', options: { trigger: 'after' } }, run)
    expect(cron.code).toBe('legacy_handed_off')
    expect(after.code).toBe('legacy_handed_off')
    expect(ran).toBe(0)
    const manual = await withLegacyPublishLock({ platform: 'facebook', format: 'post', newsId: 'n1', options: { trigger: 'composer' } }, run)
    expect(manual.success).toBe(true)
    expect(ran).toBe(1)
    // geri alma → eski davranış
    await setLegacyHandoff(FB_ONY.id, false, 'admin1', clock)
    const cron2 = await withLegacyPublishLock({ platform: 'facebook', format: 'story', newsId: 'n1', options: { trigger: 'cron' } }, run)
    expect(cron2.success).toBe(true)
  })

  it('devir kaydı yokken eski davranış aynen sürer', async () => {
    await seedNews('n1')
    const r = await withLegacyPublishLock({ platform: 'facebook', format: 'post', newsId: 'n1', options: { trigger: 'cron' } }, async () => ({ success: true, platformId: 'fb-1' }))
    expect(r.success).toBe(true)
  })

  it('eski (legacy) kayıt devredilemez', async () => {
    const leg = account({ platform: 'threads', externalId: '3001', connectionMethod: 'legacy' })
    await fs.collection('socialAccounts').doc(leg.id).set({ ...leg })
    const r = await setLegacyHandoff(leg.id, true, 'admin1', clock)
    expect(r.ok).toBe(false)
  })
})

describe('iptal, sınırlar, hatalar', () => {
  it('kural kapatılınca bekleyen işler iptal edilir; yayımlanmış gönderiye dokunulmaz', async () => {
    const r = await enabledRule()
    await seedNews('n1')
    await enqueueJob({ newsId: 'n1', accountId: IG_ANTALYA.id, platform: 'instagram', format: 'post', ruleIds: [r.id], citySlug: 'antalya', newsTitle: 't', dueAt: clock + 3600_000, now: clock })
    const off = await setRuleEnabled(r.id, false, 'admin1', clock)
    expect(off.ok && off.cancelledJobs).toBe(1)
    expect(job('n1')).toMatchObject({ status: 'cancelled', errorCode: 'rule_disabled', autoDueAt: null })
    expect(publishes()).toHaveLength(0)
  })

  it('haber kaldırılınca / hesap duraklatılınca yayın öncesi kontrol iptal eder', async () => {
    await enabledRule()
    await seedNews('n1', { status: 'archived', publishedAt: null })
    await enqueueJob({ newsId: 'n1', accountId: IG_ANTALYA.id, platform: 'instagram', format: 'post', ruleIds: ['r'], citySlug: 'antalya', newsTitle: 't', dueAt: clock, now: clock })
    await tick()
    expect(job('n1')).toMatchObject({ status: 'cancelled', errorCode: 'news_unpublished' })
    await seedNews('n2')
    // n2 imleçten önce kaldı (bilerek) — iş doğrudan kuyruğa konur
    await enqueueJob({ newsId: 'n2', accountId: IG_ANTALYA.id, platform: 'instagram', format: 'post', ruleIds: ['r'], citySlug: 'antalya', newsTitle: 't', dueAt: clock, now: clock })
    await fs.collection('socialAccounts').doc(IG_ANTALYA.id).update({ status: 'paused' })
    await tick()
    expect(job('n2')).toMatchObject({ status: 'cancelled', errorCode: 'status_paused' })
    expect(publishes()).toHaveLength(0)
  })

  it('günlük sınır ve paylaşım aralığı uygulanır', async () => {
    await enabledRule({ dailyLimit: 1, minIntervalMinutes: 5 })
    await seedNews('n1')
    await seedNews('n2', { publishedAt: T0 + 70_000 })
    await tick()
    expect(publishes()).toHaveLength(1)
    const statuses = [job('n1')?.status, job('n2')?.status].sort()
    // ikinci iş: ya aralık nedeniyle ertelendi ya da günlük sınırda atlandı — asla yayımlanmadı
    expect(statuses).toContain('published')
    const second = job('n1')?.status === 'published' ? job('n2') : job('n1')
    expect(['queued', 'skipped']).toContain(second?.status)
    clock += 10 * 60_000
    await tick()
    expect(publishes()).toHaveLength(1)
    const s2 = job('n1')?.status === 'published' ? job('n2') : job('n1')
    expect(s2).toMatchObject({ status: 'skipped', errorCode: 'daily_limit' })
  })

  it('sessiz saatte iş ertelenir (deneme sayılmaz), saat bitince yayımlanır', async () => {
    const { hour } = istanbulParts(clock)
    await enabledRule({ quietHours: { startHour: hour, endHour: (hour + 1) % 24 } })
    await seedNews('n1')
    await tick()
    const j = job('n1')!
    expect(j).toMatchObject({ status: 'queued', errorCode: 'quiet_hours', attempts: 0 })
    expect(publishes()).toHaveLength(0)
    clock = j.autoDueAt as number
    await tick()
    expect(job('n1')?.status).toBe('published')
  })

  it('sessiz saat haberi 12 saatten fazla bekletecekse paylaşılmaz (eski haber)', async () => {
    const { hour } = istanbulParts(clock)
    await enabledRule({ quietHours: { startHour: hour, endHour: (hour + 23) % 24 } })
    await seedNews('n1')
    await tick()
    expect(job('n1')).toMatchObject({ status: 'skipped', errorCode: 'stale' })
  })

  it('yetki iptali (190) → hesap yeniden bağlantı bekler, iş başarısız, kuyruk durur', async () => {
    await enabledRule()
    await seedNews('n1')
    failRule = (url) => (url.includes('/7771/media') ? 'token' : null)
    await tick()
    expect(job('n1')).toMatchObject({ status: 'failed', errorCode: 'token_invalid' })
    expect(fs.store.get(`socialAccounts/${IG_ANTALYA.id}`)).toMatchObject({ status: 'needs_reauth' })
    expect(fs.store.get(`socialAutomationCounters/${IG_ANTALYA.id}`)).toMatchObject({ count: 0 })
  })

  it('hız sınırı → sınırlı gecikmeli yeniden deneme', async () => {
    await enabledRule()
    await seedNews('n1')
    failRule = (url) => (url.includes('/7771/media') ? 'rate' : null)
    await tick()
    expect(job('n1')).toMatchObject({ status: 'queued', errorCode: 'rate_limited' })
    expect((job('n1')!.autoDueAt as number) > clock).toBe(true)
  })

  it('belirsiz sonuç otomatik tekrar edilmez', async () => {
    await enabledRule()
    await seedNews('n1')
    failRule = (url, m) => (url.includes('/media_publish') && m === 'POST' ? 'throw' : null)
    await tick()
    expect(job('n1')?.status).toBe('uncertain')
    const n = publishes().length
    failRule = null
    clock += 60 * 60_000
    await tick()
    expect(publishes().length).toBe(n)
    expect(job('n1')?.status).toBe('uncertain')
  })

  it('kira süresi dolan iş: ledger yoksa yeniden kuyruğa, ledger "publishing" ise belirsiz', async () => {
    await seedNews('n1')
    await seedNews('n2')
    for (const id of ['n1', 'n2']) {
      await enqueueJob({ newsId: id, accountId: IG_ANTALYA.id, platform: 'instagram', format: 'post', ruleIds: ['r'], citySlug: 'antalya', newsTitle: 't', dueAt: clock, now: clock })
    }
    const claimed = await claimDueJobs(clock, 5)
    expect(claimed).toHaveLength(2)
    await fs.collection('socialPublishRecords').doc(`n2__${IG_ANTALYA.id}__post`).set({ status: 'publishing', attemptId: 'a', leaseUntil: clock })
    const later = clock + JOB_LEASE_MS + 1
    const n = await recoverExpiredLeases(later, async (j) => {
      const s = fs.store.get(`socialPublishRecords/${j.newsId}__${j.accountId}__${j.format}`) as { status: string } | undefined
      return s ? { status: s.status, externalPostId: null } : null
    })
    expect(n).toBe(2)
    expect(job('n1')?.status).toBe('queued')
    expect(job('n2')?.status).toBe('uncertain')
  })

  it('test (preview) ortamında worker hiçbir şey yapmaz', async () => {
    process.env.SOCIAL_TEST_MODE = '1'
    await enabledRule()
    await seedNews('n1')
    const r = await tick()
    expect(r.skipped).toBe('test_mode')
    expect(publishes()).toHaveLength(0)
    delete process.env.SOCIAL_TEST_MODE
  })

  it('otomasyon çağrısı tek hedef / tek platform dışında reddedilir', async () => {
    await seedNews('n1')
    const r = await publishOneSocial('n1', {
      mode: 'post',
      actorUid: 'system:social-automation',
      automation: { jobId: 'j', attemptId: 'a' },
      targets: { instagram: IG_ANTALYA.id, facebook: FB_ONY.id },
      overrides: { platforms: { facebook: true, instagram: true, threads: false, twitter: false } },
    })
    expect(r.skipped).toBe(true)
    expect(publishes()).toHaveLength(0)
    expect((await listRules()).length).toBe(0)
  })
})

describe('yönetim API’leri (merkez yönetici)', () => {
  const ORIGIN = 'https://www.nahaber.com'
  const req = (path: string, uid: string | null, init: { method?: string; body?: unknown } = {}) =>
    new Request(`${ORIGIN}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(uid ? { authorization: `Bearer tok-${uid}` } : {}),
        origin: ORIGIN,
        'content-type': 'application/json',
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    })

  it('yetkisiz / editör / il kapsamlı kullanıcı kural göremez ve oluşturamaz', async () => {
    const { GET, POST } = await import('@/app/api/admin/social/automation/rules/route')
    expect((await GET(req('/api/admin/social/automation/rules', null))).status).toBe(401)
    expect([401, 403]).toContain((await GET(req('/api/admin/social/automation/rules', 'editor1'))).status)
    expect([401, 403]).toContain((await POST(req('/api/admin/social/automation/rules', 'scoped1', { method: 'POST', body: ruleInput() }))).status)
    expect(fs.docs('socialAutomationRules')).toHaveLength(0)
  })

  it('oluşturulan kural kapalıdır; istemcinin gönderdiği enabled/ownership yok sayılır; açmak onay ister', async () => {
    const { POST } = await import('@/app/api/admin/social/automation/rules/route')
    const res = await POST(req('/api/admin/social/automation/rules', 'admin1', { method: 'POST', body: { ...ruleInput(), enabled: true, ownership: { citySlug: 'ankara' } } }))
    expect(res.status).toBe(201)
    const { rule } = (await res.json()) as { rule: { id: string; enabled: boolean; ownership: { citySlug: string }; summary: string } }
    expect(rule.enabled).toBe(false)
    expect(rule.ownership.citySlug).toBe('antalya')
    expect(rule.summary).toContain('İl: Antalya')
    const { PATCH } = await import('@/app/api/admin/social/automation/rules/[id]/route')
    const ctx = { params: Promise.resolve({ id: rule.id }) }
    expect((await PATCH(req(`/api/admin/social/automation/rules/${rule.id}`, 'admin1', { method: 'PATCH', body: { action: 'enable' } }), ctx)).status).toBe(400)
    const ok = await PATCH(req(`/api/admin/social/automation/rules/${rule.id}`, 'admin1', { method: 'PATCH', body: { action: 'enable', confirm: true } }), { params: Promise.resolve({ id: rule.id }) })
    expect(ok.status).toBe(200)
    expect(fs.store.get(`socialAutomationRules/${rule.id}`)).toMatchObject({ enabled: true })
    const audits = fs.docs('cmsAuditLogs').map((d) => d.data.action)
    expect(audits).toEqual(expect.arrayContaining(['social.automation.rule_create', 'social.automation.rule_enable']))
  })

  it('önizleme eşleşen haberleri gerekçesiyle döner ve hiçbir şey yayımlamaz', async () => {
    await seedNews('n1')
    await seedNews('n2', { citySlug: 'ankara', cityName: 'Ankara' })
    const { POST } = await import('@/app/api/admin/social/automation/preview/route')
    const res = await POST(req('/api/admin/social/automation/preview', 'admin1', { method: 'POST', body: ruleInput() }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { matched: number; items: Array<{ newsId: string; match: boolean; reasons: string[] }> }
    expect(body.items.find((i) => i.newsId === 'n1')?.match).toBe(true)
    expect(body.items.find((i) => i.newsId === 'n2')?.reasons[0]).toContain('İl eşleşmedi')
    expect(publishes()).toHaveLength(0)
    expect(fs.docs('smmQueue')).toHaveLength(0)
  })

  it('devir onaysız yapılmaz', async () => {
    const { POST } = await import('@/app/api/admin/social/automation/handoff/route')
    expect((await POST(req('/api/admin/social/automation/handoff', 'admin1', { method: 'POST', body: { accountId: FB_ONY.id, on: true } }))).status).toBe(400)
    expect((await POST(req('/api/admin/social/automation/handoff', 'admin1', { method: 'POST', body: { accountId: FB_ONY.id, on: true, confirm: true } }))).status).toBe(200)
  })

  it('cron ucu sırsız çağrıyı reddeder', async () => {
    process.env.CRON_SECRET = 'cron-secret-value'
    const { GET } = await import('@/app/api/cron/social-automation/route')
    expect((await GET(new Request(`${ORIGIN}/api/cron/social-automation`))).status).toBe(401)
    const ok = await GET(new Request(`${ORIGIN}/api/cron/social-automation`, { headers: { authorization: 'Bearer cron-secret-value' } }))
    expect(ok.status).toBe(200)
  })
})
