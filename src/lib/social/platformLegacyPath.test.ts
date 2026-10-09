/**
 * Onyeditivi (legacy) yayın yolu — hedef verilmediğinde platform istekleri.
 *
 * Bu test, çoklu hesap refaktöründen ÖNCE dokunulmamış kodda yazılıp geçirildi;
 * aynı beklentiler refaktörden sonra da geçmeli (davranış korunur).
 * Gerçek Meta uçlarına, Firestore'a veya Storage'a bağlanmaz.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accessTokenOf, installFetchRecorder, metaCalls, type RecordedCall } from './accounts/testing/fetchRecorder'
import { FakeFirestore } from './accounts/testing/fakeFirestore'

vi.mock('@/services/metaAiRewriteService', () => ({
  rewriteForPlatform: vi.fn(async () => ({ enabled: false })),
  rewriteForSocial: vi.fn(async () => ({ enabled: false })),
  logAiRewrite: vi.fn(async () => {}),
}))
vi.mock('./aiSocialEditor', () => ({ generateSocialContent: vi.fn(async () => null) }))
vi.mock('./carouselImages', () => ({
  buildSocialImagePayload: vi.fn(),
  resolveCarouselUrls: (p: { imageUrls?: string[] }) =>
    Array.isArray(p.imageUrls) && p.imageUrls.length >= 2 ? p.imageUrls : undefined,
}))
vi.mock('./tokenStore', () => ({
  getSocialTokens: vi.fn(async () => ({ fbToken: 'LEGACY_FB_TOKEN', igToken: 'LEGACY_IG_TOKEN' })),
  invalidateTokenCache: vi.fn(),
}))
vi.mock('./facebookCredentials', () => ({
  resolveFacebookCredentials: vi.fn(async () => ({
    mode: 'global',
    siteId: 'onyeditivi',
    pageId: 'LEGACY_PAGE_ID',
    accessToken: 'LEGACY_FB_TOKEN',
    appId: null,
    appName: 'Publisher',
    source: 'global',
  })),
}))
vi.mock('./facebookRateLimit', () => ({
  checkFacebookRateLimit: vi.fn(async () => ({ allowed: true })),
  recordFacebookPublish: vi.fn(async () => {}),
}))
const fsHolder = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => fsHolder.db }))
vi.mock('sharp', () => ({ default: () => ({ metadata: async () => ({ width: 1200 }) }) }))

const payload = {
  newsId: 'news-1',
  title: 'Çanakkale Boğazı gemi trafiğine kapatıldı',
  description: 'Boğaz, yoğun sis nedeniyle çift yönlü gemi trafiğine kapatıldı.',
  imageUrl: 'https://img.example/cover.jpg',
  articleUrl: 'https://www.nahaber.com/haber/canakkale-bogazi-kapatildi',
  hashtags: ['#Çanakkale'],
  cityName: 'Çanakkale',
}

let rec: { calls: RecordedCall[]; restore: () => void }

const fake = () => fsHolder.db as FakeFirestore
const newsDoc = () => fake().store.get('news/news-1')

beforeEach(async () => {
  // Görev 5: legacy yol ortak ledger kilidini kullanır → bellek içi Firestore.
  fsHolder.db = new FakeFirestore()
  await fake().collection('news').doc('news-1').set({ title: 'x' })
  rec = installFetchRecorder()
  vi.stubGlobal('setTimeout', ((fn: () => void) => {
    fn()
    return 0
  }) as unknown as typeof setTimeout)
  process.env.INSTAGRAM_BUSINESS_ID = 'LEGACY_IG_USER_ID'
  process.env.THREADS_USER_ID = 'LEGACY_THREADS_USER_ID'
  process.env.THREADS_ACCESS_TOKEN = 'LEGACY_THREADS_TOKEN'
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  rec.restore()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const endpoints = (calls: RecordedCall[]) =>
  metaCalls(calls).map((c) => `${c.method} ${c.url.split('?')[0]}`)

describe('legacy (hedefsiz) yayın yolu — Onyeditivi', () => {
  it('Facebook post: legacy sayfa + token, graph.facebook.com/v21.0', async () => {
    const { publishToFacebook } = await import('./facebook')
    const r = await publishToFacebook(payload)
    expect(r.success).toBe(true)
    expect(r.platformId).toBe('fb-post-1')
    expect(endpoints(rec.calls)).toEqual([
      'POST https://graph.facebook.com/v21.0/LEGACY_PAGE_ID/photos',
      'POST https://graph.facebook.com/v21.0/fb-post-1/comments',
    ])
    for (const c of metaCalls(rec.calls)) expect(accessTokenOf(c)).toBe('LEGACY_FB_TOKEN')
    const photoBody = JSON.parse(metaCalls(rec.calls)[0].body) as Record<string, unknown>
    expect(photoBody.url).toBe('https://img.example/cover.jpg')
    expect(photoBody.published).toBe(true)
    expect(String(photoBody.caption)).not.toMatch(/https?:\/\//)
    // Onyeditivi haber belgesine kimlik bilgisi alanları yazılır (eski davranış).
    expect(newsDoc()).toMatchObject({ facebookAppId: null, facebookCredentialMode: 'global' })
    expect(newsDoc()).toHaveProperty('facebookDeferredUntil')
    // Yorum: Onyeditivi kaynak satırı korunur.
    expect(JSON.parse(metaCalls(rec.calls)[1].body).message).toContain('Kaynak: onyeditivi.com')
  })

  it('Facebook hikâye: legacy sayfa + token', async () => {
    const { publishFacebookStory } = await import('./facebook')
    const r = await publishFacebookStory(payload)
    expect(r.success).toBe(true)
    expect(endpoints(rec.calls)).toEqual([
      'POST https://graph.facebook.com/v21.0/LEGACY_PAGE_ID/photos',
      'POST https://graph.facebook.com/v21.0/LEGACY_PAGE_ID/photo_stories',
    ])
    for (const c of metaCalls(rec.calls)) expect(accessTokenOf(c)).toBe('LEGACY_FB_TOKEN')
  })

  it('Instagram tek görsel: env IG kimliği + legacy token, graph.facebook.com/v21.0', async () => {
    const { publishToInstagram } = await import('./instagram')
    const r = await publishToInstagram(payload)
    expect(r.success).toBe(true)
    expect(r.platformId).toBe('ig-media-1')
    expect(endpoints(rec.calls)).toEqual([
      'POST https://graph.facebook.com/v21.0/LEGACY_IG_USER_ID/media',
      'POST https://graph.facebook.com/v21.0/LEGACY_IG_USER_ID/media_publish',
    ])
    for (const c of metaCalls(rec.calls)) expect(accessTokenOf(c)).toBe('LEGACY_IG_TOKEN')
  })

  it('Instagram kaydırmalı: çocuk → durum → ebeveyn → yayın', async () => {
    const { publishToInstagram } = await import('./instagram')
    const r = await publishToInstagram({
      ...payload,
      imageUrls: ['https://img.example/a.jpg', 'https://img.example/b.jpg'],
    })
    expect(r.success).toBe(true)
    expect(endpoints(rec.calls)).toEqual([
      'POST https://graph.facebook.com/v21.0/LEGACY_IG_USER_ID/media',
      'GET https://graph.facebook.com/v21.0/ig-container-1',
      'POST https://graph.facebook.com/v21.0/LEGACY_IG_USER_ID/media',
      'GET https://graph.facebook.com/v21.0/ig-container-1',
      'POST https://graph.facebook.com/v21.0/LEGACY_IG_USER_ID/media',
      'GET https://graph.facebook.com/v21.0/ig-container-1',
      'POST https://graph.facebook.com/v21.0/LEGACY_IG_USER_ID/media_publish',
    ])
  })

  it('Instagram hikâye: STORIES, link sticker yok (Meta desteklemiyor), legacy kimlik', async () => {
    const { publishInstagramStory } = await import('./instagram')
    const r = await publishInstagramStory(payload)
    expect(r.success).toBe(true)
    const calls = metaCalls(rec.calls)
    expect(endpoints(rec.calls)).toEqual([
      'POST https://graph.facebook.com/v21.0/LEGACY_IG_USER_ID/media',
      'POST https://graph.facebook.com/v21.0/LEGACY_IG_USER_ID/media_publish',
    ])
    const story = new URLSearchParams(calls[0].body)
    expect(story.get('media_type')).toBe('STORIES')
    expect(story.has('link_sticker_url')).toBe(false)
    expect([...story.keys()].sort()).toEqual(['access_token', 'image_url', 'media_type'])
    expect(story.get('access_token')).toBe('LEGACY_IG_TOKEN')
  })

  it('Threads: env kullanıcı + token, graph.threads.net/v1.0', async () => {
    const { publishToThreads } = await import('./threads')
    const r = await publishToThreads(payload)
    expect(r.success).toBe(true)
    expect(r.platformId).toBe('th-media-1')
    expect(endpoints(rec.calls)).toEqual([
      'POST https://graph.threads.net/v1.0/LEGACY_THREADS_USER_ID/threads',
      'GET https://graph.threads.net/v1.0/th-container-1',
      'POST https://graph.threads.net/v1.0/LEGACY_THREADS_USER_ID/threads_publish',
    ])
    for (const c of metaCalls(rec.calls)) expect(accessTokenOf(c)).toBe('LEGACY_THREADS_TOKEN')
    expect(new URLSearchParams(metaCalls(rec.calls)[0].body).get('media_type')).toBe('IMAGE')
  })
})
