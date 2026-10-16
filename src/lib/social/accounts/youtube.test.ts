/**
 * YouTube Shorts (Google OAuth) — connection model, token handling, upload
 * adapter and ledger outcome mapping. No real network: fetch is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from './testing/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => h.db }))

import {
  accountIdFor,
  parseSocialAccount,
  publishPermissionState,
  requiredPermissionsFor,
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_UPLOAD_SCOPE,
  type SocialAccount,
} from './types'
import { formatsForMode, requiredFormats, scopeFormats, supportedFormats, supportsReel, supportsVideoStory, targetBlocker } from './capabilities'
import { buildGoogleAuthorizeUrl, fetchMyYouTubeChannels, googleErrorReason, GoogleRefreshRejectedError, parseGrantedScopes, refreshGoogleAccessToken } from './connect/googleOAuth'
import { getPlatformConfigStatus, youtubeClientCredentials } from './connect/oauthConfig'
import { buildEncryptedSecretRecord, buildLegacySecretRecord } from './secretStore'
import { resolvePublishTarget } from './resolvePublishTarget'
import { classifyOutcome } from './publishLedger'
import { isAllowedVideoUrl, publishYouTubeShort, youtubeDescription, youtubeTags, youtubeTitle } from '../youtubeShorts'
import { buildYouTubeShortMeta } from '../reelPublish'
import type { YouTubePublishTarget } from './targetTypes'

const NOW = 1_800_000_000_000
const CHANNEL = 'UCabcdefghijklmnopqrstuv' // UC + 22
const CLIENT_ID = '111111111111-abcdefgh12345678.apps.googleusercontent.com'
const VIDEO_URL = 'https://storage.googleapis.com/nahaber.firebasestorage.app/videos/reels/n1.mp4?v=3'

let fs: FakeFirestore
let logs: string[] = []

function ytAccount(over: Partial<SocialAccount> = {}): SocialAccount {
  return {
    id: accountIdFor('youtube', CHANNEL),
    externalId: CHANNEL,
    displayName: 'NaHaber',
    username: '@nahaber',
    ownership: { citySlug: null, publisherId: null, central: true },
    status: 'active',
    statusReason: null,
    connectedBy: 'u1',
    connectedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: 'u1',
    tokenExpiresAt: null,
    tokenExpiryVerified: false,
    grantedPermissions: [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_READONLY_SCOPE],
    permissionsVerifiedAt: NOW,
    platformAccountType: null,
    platform: 'youtube',
    connectionMethod: 'google_oauth',
    youtube: { channelId: CHANNEL },
    ...over,
  } as SocialAccount
}

function target(): YouTubePublishTarget {
  const t = { accountId: accountIdFor('youtube', CHANNEL), connectionMethod: 'google_oauth' as const, apiBase: 'https://www.googleapis.com/youtube/v3', platform: 'youtube' as const, channelId: CHANNEL }
  Object.defineProperty(t, 'accessToken', { value: 'ACCESS_SECRET', enumerable: false })
  return t as YouTubePublishTarget
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

beforeEach(() => {
  fs = new FakeFirestore()
  h.db = fs
  logs = []
  process.env.SECRET_ENCRYPTION_KEY = 'f'.repeat(64)
  process.env.SOCIAL_YT_CLIENT_ID = CLIENT_ID
  process.env.SOCIAL_YT_CLIENT_SECRET = 'CLIENT_SECRET_VALUE'
  for (const lvl of ['log', 'warn', 'error'] as const) vi.spyOn(console, lvl).mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.SOCIAL_YT_CLIENT_ID
  delete process.env.SOCIAL_YT_CLIENT_SECRET
})

describe('YouTube hesap modeli', () => {
  it('kanal kaydı ayrıştırılır; kimlik uyuşmazlığı reddedilir', () => {
    const a = ytAccount()
    expect(parseSocialAccount(a.id, a)).toMatchObject({ platform: 'youtube', youtube: { channelId: CHANNEL } })
    expect(parseSocialAccount(a.id, { ...a, youtube: { channelId: 'UCzzzzzzzzzzzzzzzzzzzzzz' } })).toBeNull()
    // YouTube'da legacy (Onyeditivi) bağlantı yöntemi yok.
    expect(parseSocialAccount(a.id, { ...a, connectionMethod: 'legacy' })).toBeNull()
    expect(() => buildLegacySecretRecord('youtube')).toThrow()
  })

  it('yayın izni yalnız Google yanıtındaki iki kapsamla «verified»', () => {
    expect(requiredPermissionsFor('youtube', 'google_oauth')).toEqual([YOUTUBE_UPLOAD_SCOPE, YOUTUBE_READONLY_SCOPE])
    expect(publishPermissionState(ytAccount())).toBe('verified')
    expect(publishPermissionState(ytAccount({ grantedPermissions: [YOUTUBE_READONLY_SCOPE] }))).toBe('missing')
    expect(publishPermissionState(ytAccount({ grantedPermissions: null }))).toBe('unverified')
  })

  it('yalnız Shorts (reel): gönderi, hikâye ve video hikâye hedefi olamaz', () => {
    const a = ytAccount()
    expect(supportsReel(a)).toBe(true)
    expect(supportsVideoStory(a)).toBe(false)
    expect(supportedFormats(a)).toEqual([])
    expect(formatsForMode(a, 'reel')).toEqual(['reel'])
    expect(formatsForMode(a, 'post')).toEqual([])
    expect(requiredFormats('youtube', 'reel')).toEqual(['reel'])
    const pub = { ...a, publishPermission: 'verified' as const }
    expect(targetBlocker(pub, 'reel', NOW)).toBeNull()
    expect(targetBlocker(pub, 'post', NOW)).toBe('format_unsupported')
    expect(targetBlocker(pub, 'video_story', NOW)).toBe('format_unsupported')
    // Shorts gönderi kapsamını izler (konum / kategori), ama gönderi hedefi yapmaz.
    expect(scopeFormats(a)).toEqual(['post'])
  })
})

describe('Google OAuth', () => {
  it('yetkilendirme adresi: tam iki kapsam, çevrimdışı erişim, hesap seçici', () => {
    const u = new URL(buildGoogleAuthorizeUrl({ platform: 'youtube', appId: CLIENT_ID, appSecret: 'S', redirectUri: 'https://www.nahaber.com/api/admin/social/oauth/youtube/callback' }, 'STATE1'))
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(u.searchParams.get('scope')).toBe(`${YOUTUBE_UPLOAD_SCOPE} ${YOUTUBE_READONLY_SCOPE}`)
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('prompt')).toBe('consent select_account')
    expect(u.searchParams.get('state')).toBe('STATE1')
    expect(u.searchParams.get('redirect_uri')).toBe('https://www.nahaber.com/api/admin/social/oauth/youtube/callback')
    expect(u.toString()).not.toContain('S&')
  })

  it('yapılandırma: Google istemci kimliği biçimi doğrulanır, sır adı dışında değer dönmez', () => {
    process.env.SOCIAL_OAUTH_BASE_URL = 'https://www.nahaber.com'
    process.env.CMS_SESSION_SECRET = 'x'
    const ok = getPlatformConfigStatus('youtube')
    expect(ok.missing).not.toContain('SOCIAL_YT_CLIENT_ID')
    expect(ok.redirectUri).toBe('https://www.nahaber.com/api/admin/social/oauth/youtube/callback')
    expect(JSON.stringify(ok)).not.toContain('CLIENT_SECRET_VALUE')
    process.env.SOCIAL_YT_CLIENT_ID = '12345' // Meta tarzı sayısal kimlik YouTube için geçersiz
    expect(getPlatformConfigStatus('youtube').missing).toContain('SOCIAL_YT_CLIENT_ID')
    expect(youtubeClientCredentials()).toBeNull()
    delete process.env.SOCIAL_OAUTH_BASE_URL
    delete process.env.CMS_SESSION_SECRET
  })

  it('kapsamlar Google yanıtından okunur; hata metni değil yalnız kısa neden tutulur', () => {
    expect(parseGrantedScopes(`${YOUTUBE_UPLOAD_SCOPE} ${YOUTUBE_READONLY_SCOPE}`)).toEqual([YOUTUBE_UPLOAD_SCOPE, YOUTUBE_READONLY_SCOPE])
    expect(parseGrantedScopes('')).toBeNull()
    expect(googleErrorReason({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })).toBe('invalid_grant')
    expect(googleErrorReason({ error: { code: 403, message: 'secret text', errors: [{ reason: 'quotaExceeded', message: 'x' }] } })).toBe('quotaExceeded')
  })

  it('invalid_grant → GoogleRefreshRejectedError; anahtar değerleri loga düşmez', async () => {
    vi.stubGlobal('fetch', async () => json({ error: 'invalid_grant', error_description: 'expired' }, 400))
    await expect(refreshGoogleAccessToken({ appId: CLIENT_ID, appSecret: 'CLIENT_SECRET_VALUE' }, 'REFRESH_SECRET')).rejects.toBeInstanceOf(GoogleRefreshRejectedError)
    expect(logs.join('\n')).not.toMatch(/REFRESH_SECRET|CLIENT_SECRET_VALUE/)
  })

  it('kanal listesi: geçersiz kimlikler atlanır, @handle normalize edilir', async () => {
    vi.stubGlobal('fetch', async () => json({ items: [{ id: CHANNEL, snippet: { title: 'NaHaber', customUrl: 'nahaber' } }, { id: 'bad', snippet: { title: 'x' } }] }))
    expect(await fetchMyYouTubeChannels('A')).toEqual([{ channelId: CHANNEL, title: 'NaHaber', handle: '@nahaber' }])
  })
})

describe('yayın hedefi (refresh token → kısa ömürlü erişim anahtarı)', () => {
  async function seed(a: SocialAccount) {
    await fs.collection('socialAccounts').doc(a.id).set({ ...a })
    await fs.collection('socialAccountSecrets').doc(a.id).set({ ...(await buildEncryptedSecretRecord('REFRESH_SECRET', 'youtube_refresh', NOW)) })
  }

  it('saklanan refresh token ile erişim anahtarı alınır; anahtar görünmez özellikte', async () => {
    const a = ytAccount()
    await seed(a)
    const calls: string[] = []
    vi.stubGlobal('fetch', async (u: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${String(u)} ${String(init?.body ?? '')}`)
      return json({ access_token: 'ACCESS_NEW', expires_in: 3599, scope: `${YOUTUBE_UPLOAD_SCOPE} ${YOUTUBE_READONLY_SCOPE}` })
    })
    const r = await resolvePublishTarget(a.id, { expectedPlatform: 'youtube', now: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.target).toMatchObject({ platform: 'youtube', channelId: CHANNEL, apiBase: 'https://www.googleapis.com/youtube/v3' })
    expect(r.target.accessToken).toBe('ACCESS_NEW')
    expect(JSON.stringify(r.target)).not.toContain('ACCESS_NEW')
    expect(calls[0]).toContain('https://oauth2.googleapis.com/token')
    expect(calls[0]).toContain('grant_type=refresh_token')
    // Erişim anahtarı saklanmaz; sır kaydı değişmez.
    expect(JSON.stringify(fs.store.get(`socialAccountSecrets/${a.id}`))).not.toContain('ACCESS_NEW')
  })

  it('iptal edilmiş / süresi dolmuş refresh token → hesap needs_reauth, başka hesaba düşülmez', async () => {
    const a = ytAccount()
    await seed(a)
    vi.stubGlobal('fetch', async () => json({ error: 'invalid_grant' }, 400))
    const r = await resolvePublishTarget(a.id, { expectedPlatform: 'youtube', now: NOW })
    expect(r).toMatchObject({ ok: false, code: 'needs_reauth' })
    expect(fs.store.get(`socialAccounts/${a.id}`)).toMatchObject({ status: 'needs_reauth' })
  })

  it('geçici Google hatası → token_refresh_failed, hesap durumu değişmez', async () => {
    const a = ytAccount()
    await seed(a)
    vi.stubGlobal('fetch', async () => json({ error: 'internal_failure' }, 503))
    const r = await resolvePublishTarget(a.id, { expectedPlatform: 'youtube', now: NOW })
    expect(r).toMatchObject({ ok: false, code: 'token_refresh_failed' })
    expect(fs.store.get(`socialAccounts/${a.id}`)).toMatchObject({ status: 'active' })
  })

  it('istemci sırrı sunucuda yoksa not_configured', async () => {
    const a = ytAccount()
    await seed(a)
    delete process.env.SOCIAL_YT_CLIENT_SECRET
    const r = await resolvePublishTarget(a.id, { expectedPlatform: 'youtube', now: NOW })
    expect(r).toMatchObject({ ok: false, code: 'not_configured' })
  })
})

describe('Shorts yükleme adaptörü', () => {
  const MP4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])
  const SESSION = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=XYZ'
  const input = { newsId: 'n1', videoUrl: VIDEO_URL, title: 'Başlık <b>', description: 'Özet', tags: ['#haber', 'NaHaber', 'haber'] }

  function stub(handlers: { init?: () => Response; put?: () => Response | Promise<Response>; check?: () => Response }) {
    const seen: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = []
    vi.stubGlobal('fetch', async (u: RequestInfo | URL, init?: RequestInit) => {
      const url = String(u)
      const method = init?.method ?? 'GET'
      const headers = (init?.headers ?? {}) as Record<string, string>
      seen.push({ url, method, headers, body: init?.body })
      if (url.startsWith('https://storage.googleapis.com/')) return new Response(MP4, { status: 200, headers: { 'content-length': String(MP4.length) } })
      if (method === 'POST') return handlers.init ? handlers.init() : new Response(null, { status: 200, headers: { location: SESSION } })
      if (method === 'PUT' && headers['Content-Range']) return handlers.check ? handlers.check() : new Response(null, { status: 308 })
      if (method === 'PUT') return handlers.put ? handlers.put() : json({ id: 'dQw4w9WgXcQ', status: { privacyStatus: 'private' } })
      throw new Error('unexpected')
    })
    return seen
  }

  it('başarılı yükleme: video kimliği döner, meta veri temizlenir, gizlilik varsayılanı private', async () => {
    const seen = stub({})
    const r = await publishYouTubeShort(input, target())
    expect(r).toEqual({ success: true, platformId: 'dQw4w9WgXcQ' })
    const init = seen.find((s) => s.method === 'POST')!
    expect(init.url).toBe('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status')
    expect(init.headers.Authorization).toBe('Bearer ACCESS_SECRET')
    expect(init.headers['X-Upload-Content-Length']).toBe(String(MP4.length))
    const meta = JSON.parse(String(init.body))
    expect(meta.snippet.title).toBe('Başlık b')
    expect(meta.snippet.categoryId).toBe('25')
    expect(meta.snippet.tags).toEqual(['haber', 'NaHaber'])
    expect(meta.status).toEqual({ privacyStatus: 'private', selfDeclaredMadeForKids: false, embeddable: true })
    expect(classifyOutcome(r, false).status).toBe('succeeded')
    expect(logs.join('\n')).not.toMatch(/ACCESS_SECRET|upload_id/)
  })

  it('YOUTUBE_PRIVACY_STATUS=public istenirse public gönderilir', async () => {
    const seen = stub({})
    await publishYouTubeShort(input, target(), { privacy: 'public' })
    expect(JSON.parse(String(seen.find((s) => s.method === 'POST')!.body)).status.privacyStatus).toBe('public')
  })

  it('kota dolu (oturum açılamadı) → kesin başarısız, belirsiz değil', async () => {
    stub({ init: () => json({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }, 403) })
    const r = await publishYouTubeShort(input, target())
    expect(r.success).toBe(false)
    expect(r.error).toContain('kotası')
    expect(classifyOutcome(r, false).status).toBe('failed')
  })

  it('oturum adımında 5xx de kesin başarısız (video YouTube’a gitmedi)', async () => {
    stub({ init: () => json({ error: { code: 503, errors: [{ reason: 'backendError' }] } }, 503) })
    const r = await publishYouTubeShort(input, target())
    expect(classifyOutcome(r, false).status).toBe('failed')
  })

  it('yükleme yanıtı kayboldu, durum sorgusu tamamlandı diyor → başarılı', async () => {
    stub({ put: () => Promise.reject(new TypeError('fetch failed')), check: () => json({ id: 'abcDEF12345' }) })
    const r = await publishYouTubeShort(input, target())
    expect(r).toEqual({ success: true, platformId: 'abcDEF12345' })
  })

  it('yükleme yarım kaldı (308) → kesin başarısız, video yayımlanmadı', async () => {
    stub({ put: () => new Response(null, { status: 503 }), check: () => new Response(null, { status: 308 }) })
    const r = await publishYouTubeShort(input, target())
    expect(classifyOutcome(r, false).status).toBe('failed')
  })

  it('yanıt kayboldu ve durum bilinmiyor → BELİRSİZ (otomatik tekrar yok)', async () => {
    stub({ put: () => new Response(null, { status: 503 }), check: () => new Response(null, { status: 500 }) })
    const r1 = await publishYouTubeShort(input, target())
    expect(classifyOutcome(r1, false).status).toBe('uncertain')
    stub({ put: () => Promise.reject(new TypeError('fetch failed')), check: () => { throw new TypeError('fetch failed') } })
    const r2 = await publishYouTubeShort(input, target())
    expect(classifyOutcome(r2, false).status).toBe('uncertain')
  })

  it('YouTube içeriği reddetti (4xx) → kesin başarısız', async () => {
    stub({ put: () => json({ error: { code: 400, errors: [{ reason: 'invalidTitle' }] } }, 400) })
    const r = await publishYouTubeShort(input, target())
    expect(r).toMatchObject({ success: false, error: 'YouTube başlığı reddetti' })
    expect(classifyOutcome(r, false).status).toBe('failed')
  })

  it('yalnız NaHaber deposundaki video indirilir', async () => {
    const seen = stub({})
    const r = await publishYouTubeShort({ ...input, videoUrl: 'https://evil.example.com/v.mp4' }, target())
    expect(r.success).toBe(false)
    expect(seen).toHaveLength(0)
    expect(isAllowedVideoUrl('http://storage.googleapis.com/x.mp4')).toBe(false)
  })
})

describe('Shorts meta verisi', () => {
  it('başlık ≤ 100, açıklamada haber bağlantısı ve #Shorts; etiketler tekilleşir', () => {
    const long = 'A'.repeat(60) + ' ' + 'B'.repeat(60)
    expect(youtubeTitle(long).length).toBeLessThanOrEqual(100)
    expect(youtubeTitle('   ')).toBe('NaHaber')
    expect(youtubeDescription('x'.repeat(6000)).length).toBeLessThanOrEqual(4900)
    expect(youtubeTags(['Haber', 'haber', '#Antalya', 'a,b'])).toEqual(['Haber', 'Antalya', 'ab'])
    const m = buildYouTubeShortMeta({ title: 'Antalya’da yağış', summary: 'Kısa özet', city: 'Antalya' }, 'https://www.nahaber.com/haber/x')
    expect(m.title).toBe('Antalya’da yağış')
    expect(m.description).toContain('Haberin tamamı: https://www.nahaber.com/haber/x')
    expect(m.description).toContain('#Shorts')
    expect(m.tags).toContain('Antalya')
  })
})
