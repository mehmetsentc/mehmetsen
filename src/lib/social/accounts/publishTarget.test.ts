/**
 * Hedef hesap çözümleme + platform yayıncılarında açık hedef.
 * In-memory Firestore, mock fetch; gerçek Meta/Firestore yok.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from './testing/fakeFirestore'
import { accessTokenOf, installFetchRecorder, metaCalls, type RecordedCall } from './testing/fetchRecorder'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => h.db }))
vi.mock('../facebookCredentials', () => ({
  resolveFacebookCredentials: vi.fn(async () => ({
    mode: 'custom',
    siteId: 'onyeditivi',
    pageId: '1001',
    accessToken: 'LEGACY_FB_TOKEN',
    appId: 'app-1',
    appName: 'Onyeditivi Publisher',
    source: 'firestore',
  })),
}))
vi.mock('../tokenStore', () => ({
  getSocialTokens: vi.fn(async () => ({ fbToken: 'LEGACY_FB_TOKEN', igToken: 'LEGACY_IG_TOKEN' })),
  invalidateTokenCache: vi.fn(),
}))
vi.mock('@/services/metaAiRewriteService', () => ({
  rewriteForPlatform: vi.fn(async () => ({ enabled: false })),
  rewriteForSocial: vi.fn(async () => ({ enabled: false })),
  logAiRewrite: vi.fn(async () => {}),
}))
vi.mock('../aiSocialEditor', () => ({ generateSocialContent: vi.fn(async () => null) }))
vi.mock('../carouselImages', () => ({ buildSocialImagePayload: vi.fn(), resolveCarouselUrls: () => undefined }))
vi.mock('../facebookRateLimit', () => ({
  checkFacebookRateLimit: vi.fn(async () => ({ allowed: true })),
  recordFacebookPublish: vi.fn(async () => {}),
}))
vi.mock('sharp', () => ({ default: () => ({ metadata: async () => ({ width: 1200 }) }) }))

import { resolvePublishTarget } from './resolvePublishTarget'
import { buildEncryptedSecretRecord, buildLegacySecretRecord } from './secretStore'
import { accountIdFor, requiredPermissionsFor, type SocialAccount } from './types'
import { INSTAGRAM_LOGIN_GRAPH_BASE, FACEBOOK_GRAPH_BASE, THREADS_GRAPH_BASE } from '../graphConfig'
import { INVALID_TARGET_ERROR } from './targetGuards'
import type { PublishTarget } from './targetTypes'
import { checkFacebookRateLimit } from '../facebookRateLimit'

const KEY = 'a'.repeat(64)
const NOW = 1_800_000_000_000
let fs: FakeFirestore
let rec: { calls: RecordedCall[]; restore: () => void }

function account(over: Partial<SocialAccount> & Pick<SocialAccount, 'platform' | 'externalId' | 'connectionMethod'>): SocialAccount {
  const base = {
    id: accountIdFor(over.platform, over.externalId),
    displayName: 'Test',
    username: null,
    ownership: { citySlug: 'antalya', publisherId: null },
    status: 'active',
    statusReason: null,
    connectedBy: 'u1',
    connectedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: 'u1',
    tokenExpiresAt: null,
    tokenExpiryVerified: false,
    grantedPermissions:
      over.connectionMethod === 'legacy' ? null : [...requiredPermissionsFor(over.platform, over.connectionMethod)],
    permissionsVerifiedAt: over.connectionMethod === 'legacy' ? null : NOW,
    platformAccountType: null,
  }
  const platformPart =
    over.platform === 'facebook'
      ? { facebook: { pageId: over.externalId } }
      : over.platform === 'instagram'
        ? { instagram: { igUserId: over.externalId, linkedFacebookPageId: null } }
        : { threads: { threadsUserId: over.externalId } }
  return { ...base, ...platformPart, ...over } as SocialAccount
}

async function seed(a: SocialAccount, token: string | 'legacy' | null, tokenType?: 'facebook_page' | 'instagram_user' | 'threads_user') {
  await fs.collection('socialAccounts').doc(a.id).set({ ...a })
  if (token === 'legacy') {
    await fs.collection('socialAccountSecrets').doc(a.id).set({ ...buildLegacySecretRecord(a.platform, NOW) })
  } else if (token) {
    await fs.collection('socialAccountSecrets').doc(a.id).set({ ...(await buildEncryptedSecretRecord(token, tokenType!, NOW)) })
  }
}

const payload = {
  newsId: 'n-antalya',
  title: 'Antalya’da yeni tramvay hattı açıldı',
  description: 'Yeni hat 12 durakla şehir merkezini havalimanına bağlıyor.',
  imageUrl: 'https://img.example/cover.jpg',
  articleUrl: 'https://www.nahaber.com/haber/antalya-tramvay',
  cityName: 'Antalya',
}

beforeEach(() => {
  fs = new FakeFirestore()
  h.db = fs
  process.env.SECRET_ENCRYPTION_KEY = KEY
  process.env.INSTAGRAM_BUSINESS_ID = '2001'
  process.env.THREADS_USER_ID = '3001'
  process.env.THREADS_ACCESS_TOKEN = 'LEGACY_THREADS_TOKEN'
  rec = installFetchRecorder()
  vi.stubGlobal('setTimeout', ((fn: () => void) => { fn(); return 0 }) as unknown as typeof setTimeout)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  rec.restore()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.SECRET_ENCRYPTION_KEY
})

describe('resolvePublishTarget — doğru hesap ve host', () => {
  it('Facebook Login sayfası → graph.facebook.com + kendi token', async () => {
    const a = account({ platform: 'facebook', externalId: '5551', connectionMethod: 'facebook_login' })
    await seed(a, 'EAAG_ANTALYA_PAGE_TOKEN', 'facebook_page')
    const r = await resolvePublishTarget(a.id, { now: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok || r.target.platform !== 'facebook') throw new Error('unexpected')
    expect(r.target.pageId).toBe('5551')
    expect(r.target.apiBase).toBe(FACEBOOK_GRAPH_BASE)
    expect(r.target.accessToken).toBe('EAAG_ANTALYA_PAGE_TOKEN')
  })

  it('Instagram Login → graph.instagram.com; Facebook Login IG → graph.facebook.com', async () => {
    const igLogin = account({ platform: 'instagram', externalId: '7771', connectionMethod: 'instagram_login' })
    const igFb = account({ platform: 'instagram', externalId: '7772', connectionMethod: 'facebook_login' })
    await seed(igLogin, 'IGAA_LOGIN_TOKEN', 'instagram_user')
    await seed(igFb, 'EAAG_IG_VIA_PAGE', 'facebook_page')
    const r1 = await resolvePublishTarget(igLogin.id, { now: NOW })
    const r2 = await resolvePublishTarget(igFb.id, { now: NOW })
    expect(r1.ok && r1.target.apiBase).toBe(INSTAGRAM_LOGIN_GRAPH_BASE)
    expect(r2.ok && r2.target.apiBase).toBe(FACEBOOK_GRAPH_BASE)
  })

  it('Instagram Login hesabına Facebook türü token bağlanmışsa reddedilir', async () => {
    const a = account({ platform: 'instagram', externalId: '7773', connectionMethod: 'instagram_login' })
    await seed(a, 'EAAG_WRONG_KIND', 'facebook_page')
    const r = await resolvePublishTarget(a.id, { now: NOW })
    expect(r).toMatchObject({ ok: false, code: 'secret_invalid' })
  })

  it('Threads OAuth → graph.threads.net', async () => {
    const a = account({ platform: 'threads', externalId: '8881', connectionMethod: 'threads_oauth' })
    await seed(a, 'THQ_TOKEN_ANTALYA', 'threads_user')
    const r = await resolvePublishTarget(a.id, { now: NOW })
    expect(r.ok && r.target.apiBase).toBe(THREADS_GRAPH_BASE)
  })

  it('token sayılabilir alan değil: JSON/spread/Object.keys içinde görünmez', async () => {
    const a = account({ platform: 'facebook', externalId: '5552', connectionMethod: 'facebook_login' })
    await seed(a, 'EAAG_SECRET_SHOULD_NOT_LEAK', 'facebook_page')
    const r = await resolvePublishTarget(a.id, { now: NOW })
    if (!r.ok) throw new Error('unexpected')
    expect(JSON.stringify(r)).not.toContain('EAAG_SECRET_SHOULD_NOT_LEAK')
    expect(Object.keys(r.target)).not.toContain('accessToken')
    expect(JSON.stringify({ ...r.target })).not.toContain('EAAG_SECRET')
  })

  it('legacy kayıt mevcut Onyeditivi kimlik bilgisine çözülür (kopya yok)', async () => {
    const a = account({ platform: 'facebook', externalId: '1001', connectionMethod: 'legacy', ownership: { citySlug: 'canakkale', publisherId: null } })
    await seed(a, 'legacy')
    const r = await resolvePublishTarget(a.id, { now: NOW })
    if (!r.ok || r.target.platform !== 'facebook') throw new Error('unexpected')
    expect(r.target.accessToken).toBe('LEGACY_FB_TOKEN')
    expect(r.target.legacyCredentialMode).toBe('custom')
    const secretDoc = fs.store.get(`socialAccountSecrets/${a.id}`)
    expect(JSON.stringify(secretDoc)).not.toContain('LEGACY_FB_TOKEN')
  })
})

describe('resolvePublishTarget — fail-closed', () => {
  const cases: Array<[string, (a: SocialAccount) => SocialAccount, string]> = [
    ['disabled', (a) => ({ ...a, status: 'disabled' }), 'disabled'],
    ['paused', (a) => ({ ...a, status: 'paused' }), 'paused'],
    ['needs_reauth', (a) => ({ ...a, status: 'needs_reauth' }), 'needs_reauth'],
    ['süresi dolmuş token', (a) => ({ ...a, tokenExpiresAt: NOW - 1 }), 'token_expired'],
  ]
  for (const [label, mutate, code] of cases) {
    it(`${label} → yayın hedefi yok (${code})`, async () => {
      const a = mutate(account({ platform: 'facebook', externalId: '5560', connectionMethod: 'facebook_login' }))
      await seed(a, 'EAAG_X', 'facebook_page')
      expect(await resolvePublishTarget(a.id, { now: NOW })).toMatchObject({ ok: false, code })
    })
  }

  it('yayın izni eksik veya doğrulanmamışsa hedef yok (istenen izin "verilmiş" sayılmaz)', async () => {
    const missing = account({ platform: 'instagram', externalId: '7800', connectionMethod: 'instagram_login', grantedPermissions: ['instagram_business_basic'] })
    const unverified = account({ platform: 'threads', externalId: '8800', connectionMethod: 'threads_oauth', grantedPermissions: null, permissionsVerifiedAt: null })
    await seed(missing, 'IGAA_X', 'instagram_user')
    await seed(unverified, 'THQ_X', 'threads_user')
    expect(await resolvePublishTarget(missing.id, { now: NOW })).toMatchObject({ ok: false, code: 'publish_permission_missing' })
    expect(await resolvePublishTarget(unverified.id, { now: NOW })).toMatchObject({ ok: false, code: 'publish_permission_unverified' })
  })

  it('bilinmeyen / bozuk kimlik / platform uyuşmazlığı', async () => {
    expect(await resolvePublishTarget('facebook_9999', { now: NOW })).toMatchObject({ ok: false, code: 'not_found' })
    expect(await resolvePublishTarget('../config/socialMedia', { now: NOW })).toMatchObject({ ok: false, code: 'invalid_account_id' })
    const a = account({ platform: 'facebook', externalId: '5561', connectionMethod: 'facebook_login' })
    await seed(a, 'EAAG_X', 'facebook_page')
    expect(await resolvePublishTarget(a.id, { now: NOW, expectedPlatform: 'instagram' })).toMatchObject({ ok: false, code: 'platform_mismatch' })
  })

  it('tutarsız kayıt (kimlik ≠ belge kimliği) → invalid_record', async () => {
    await fs.collection('socialAccounts').doc('facebook_5562').set({ ...account({ platform: 'facebook', externalId: '9999', connectionMethod: 'facebook_login' }) })
    expect(await resolvePublishTarget('facebook_5562', { now: NOW })).toMatchObject({ ok: false, code: 'invalid_record' })
  })

  it('sır yok / çözülemiyor / yanlış anahtar', async () => {
    const a = account({ platform: 'threads', externalId: '8890', connectionMethod: 'threads_oauth' })
    await seed(a, null)
    expect(await resolvePublishTarget(a.id, { now: NOW })).toMatchObject({ ok: false, code: 'secret_missing' })
    await seed(a, 'THQ_TOKEN', 'threads_user')
    process.env.SECRET_ENCRYPTION_KEY = 'b'.repeat(64)
    expect(await resolvePublishTarget(a.id, { now: NOW })).toMatchObject({ ok: false, code: 'secret_decrypt_failed' })
  })

  it('legacy kaynak artık bu hesabı göstermiyorsa → legacy_mismatch (Onyeditivi’ye yönlenmez)', async () => {
    const a = account({ platform: 'instagram', externalId: '2999', connectionMethod: 'legacy' })
    await seed(a, 'legacy')
    expect(await resolvePublishTarget(a.id, { now: NOW })).toMatchObject({ ok: false, code: 'legacy_mismatch' })
  })
})

describe('platform yayıncıları — açık hedef', () => {
  async function target(a: SocialAccount, token: string, type: 'facebook_page' | 'instagram_user' | 'threads_user'): Promise<PublishTarget> {
    await seed(a, token, type)
    const r = await resolvePublishTarget(a.id, { now: NOW })
    if (!r.ok) throw new Error(r.code)
    return r.target
  }

  it('Instagram Login hedefi graph.instagram.com’a, hedef token ile gider', async () => {
    const { publishToInstagram } = await import('../instagram')
    const t = await target(account({ platform: 'instagram', externalId: '7781', connectionMethod: 'instagram_login' }), 'IGAA_ANTALYA', 'instagram_user')
    const r = await publishToInstagram(payload, t as never)
    expect(r.success).toBe(true)
    const calls = metaCalls(rec.calls)
    expect(calls.map((c) => c.url.split('?')[0])).toEqual([
      `${INSTAGRAM_LOGIN_GRAPH_BASE}/7781/media`,
      `${INSTAGRAM_LOGIN_GRAPH_BASE}/7781/media_publish`,
    ])
    for (const c of calls) expect(accessTokenOf(c)).toBe('IGAA_ANTALYA')
    expect(rec.calls.some((c) => c.url.includes('2001'))).toBe(false)
  })

  it('Instagram hikâyesi de hedef hostu kullanır', async () => {
    const { publishInstagramStory } = await import('../instagram')
    const t = await target(account({ platform: 'instagram', externalId: '7782', connectionMethod: 'instagram_login' }), 'IGAA_STORY', 'instagram_user')
    const r = await publishInstagramStory(payload, t as never)
    expect(r.success).toBe(true)
    for (const c of metaCalls(rec.calls)) expect(c.url.startsWith(`${INSTAGRAM_LOGIN_GRAPH_BASE}/7782/`)).toBe(true)
  })

  it('Facebook hedefi kendi sayfasına yayınlar; Onyeditivi sınırlayıcısı ve kaynak satırı uygulanmaz', async () => {
    const { publishToFacebook } = await import('../facebook')
    const t = await target(account({ platform: 'facebook', externalId: '5571', connectionMethod: 'facebook_login' }), 'EAAG_ANTALYA', 'facebook_page')
    const r = await publishToFacebook(payload, t as never)
    expect(r.success).toBe(true)
    const calls = metaCalls(rec.calls)
    expect(calls.map((c) => c.url.split('?')[0])).toEqual([
      `${FACEBOOK_GRAPH_BASE}/5571/photos`,
      `${FACEBOOK_GRAPH_BASE}/fb-post-1/comments`,
    ])
    for (const c of calls) expect(accessTokenOf(c)).toBe('EAAG_ANTALYA')
    expect(JSON.parse(calls[1].body).message).not.toContain('onyeditivi')
    expect(checkFacebookRateLimit).not.toHaveBeenCalled()
  })

  it('Onyeditivi legacy kaydı hedef olarak verilirse eski sayfa, sınırlayıcı ve kaynak satırı korunur', async () => {
    const { publishToFacebook } = await import('../facebook')
    const a = account({ platform: 'facebook', externalId: '1001', connectionMethod: 'legacy', ownership: { citySlug: 'canakkale', publisherId: null } })
    await seed(a, 'legacy')
    const r0 = await resolvePublishTarget(a.id, { now: NOW })
    if (!r0.ok) throw new Error(r0.code)
    await fs.collection('news').doc('n-antalya').set({ title: 'x' })
    const r = await publishToFacebook(payload, r0.target as never)
    expect(r).toMatchObject({ success: true, credentialMode: 'custom', appId: 'app-1' })
    const calls = metaCalls(rec.calls)
    expect(calls[0].url.split('?')[0]).toBe(`${FACEBOOK_GRAPH_BASE}/1001/photos`)
    expect(accessTokenOf(calls[0])).toBe('LEGACY_FB_TOKEN')
    expect(JSON.parse(calls[1].body).message).toContain('Kaynak: onyeditivi.com')
    expect(checkFacebookRateLimit).toHaveBeenCalledTimes(1)
  })

  it('Threads hedefi kendi kullanıcı kimliğini kullanır', async () => {
    const { publishToThreads } = await import('../threads')
    const t = await target(account({ platform: 'threads', externalId: '8891', connectionMethod: 'threads_oauth' }), 'THQ_ANTALYA', 'threads_user')
    const r = await publishToThreads(payload, t as never)
    expect(r.success).toBe(true)
    for (const c of metaCalls(rec.calls)) {
      expect(c.url.startsWith(THREADS_GRAPH_BASE)).toBe(true)
      expect(accessTokenOf(c)).toBe('THQ_ANTALYA')
      expect(c.url).not.toContain('3001')
    }
  })

  it('geçersiz/yanlış platform hedefi → hiç istek yok, legacy hesaba düşmez', async () => {
    const { publishToFacebook, publishFacebookStory } = await import('../facebook')
    const { publishToInstagram, publishInstagramStory } = await import('../instagram')
    const { publishToThreads } = await import('../threads')
    const igTarget = await target(account({ platform: 'instagram', externalId: '7790', connectionMethod: 'instagram_login' }), 'IGAA_X', 'instagram_user')
    rec.calls.length = 0
    const forged = { ...igTarget, apiBase: FACEBOOK_GRAPH_BASE, accessToken: 'IGAA_X' }
    const results = [
      await publishToFacebook(payload, igTarget as never),
      await publishFacebookStory(payload, igTarget as never),
      await publishToThreads(payload, igTarget as never),
      await publishToInstagram(payload, forged as never),
      await publishInstagramStory(payload, { ...igTarget } as never), // spread drops the non-enumerable token
      await publishToInstagram(payload, null as never),
    ]
    for (const r of results) expect(r).toMatchObject({ success: false, error: INVALID_TARGET_ERROR })
    expect(rec.calls).toEqual([])
  })
})
