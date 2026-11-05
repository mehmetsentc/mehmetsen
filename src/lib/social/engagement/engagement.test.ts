/**
 * Sosyal etkileşim: yayın → kuyruk → çalışan okuması → haber özeti → yorum
 * moderasyonu → herkese açık uç. Gerçek Meta / Google / Firebase yok.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from '../accounts/testing/fakeFirestore'

const h = vi.hoisted(() => ({
  db: null as unknown,
  accounts: {} as Record<string, Record<string, unknown>>,
  audits: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => h.db }))
vi.mock('../accounts/audit', () => ({ writeSocialAudit: vi.fn(async (e: Record<string, unknown>) => void h.audits.push(e)) }))
vi.mock('../accounts/accountStore', () => ({
  loadSocialAccount: vi.fn(async (id: string) => (h.accounts[id] ? { state: 'ok', account: h.accounts[id] } : { state: 'missing' })),
}))
vi.mock('../accounts/resolvePublishTarget', () => ({
  resolvePublishTarget: vi.fn(async (id: string) => {
    const a = h.accounts[id]
    if (!a || a.status !== 'active') return { ok: false, code: 'not_found' }
    const base = { facebook: 'https://graph.facebook.com/v21.0', instagram: 'https://graph.instagram.com/v21.0', threads: 'https://graph.threads.net/v1.0', youtube: 'https://www.googleapis.com/youtube/v3' }[a.platform as string]
    const target: Record<string, unknown> = { platform: a.platform, accountId: id, connectionMethod: a.connectionMethod, apiBase: base }
    Object.defineProperty(target, 'accessToken', { value: `TOKEN_${id}`, enumerable: false })
    return { ok: true, target }
  }),
}))

import { claimPublish, finishPublish } from '../accounts/publishLedger'
import { REQUIRED_PUBLISH_PERMISSIONS } from '../accounts/types'
import {
  allEngagementScopes,
  cleanCommentText,
  count,
  engagementQueueRow,
  nextRefreshAt,
  sumMetrics,
} from './model'
import { listCommentsForModeration, moderateComments, readPublicEngagement, refreshDueEngagement, seedEngagementQueueOnce } from './store'

const T0 = 1_780_000_000_000
const H = 3600_000
let fs: FakeFirestore
let calls: string[] = []
let routes: Array<[RegExp, (url: URL) => { status?: number; body: unknown }]> = []

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  fs = new FakeFirestore()
  h.db = fs
  h.audits = []
  calls = []
  routes = []
  h.accounts = {
    instagram_100: { id: 'instagram_100', platform: 'instagram', connectionMethod: 'instagram_login', status: 'active', displayName: 'NaHaber Antalya', username: 'antalya_nahaber_com', grantedPermissions: ['instagram_business_basic', 'instagram_business_content_publish'] },
    instagram_200: { id: 'instagram_200', platform: 'instagram', connectionMethod: 'instagram_login', status: 'active', displayName: 'NaHaber', username: 'nahaber_com', grantedPermissions: ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_insights', 'instagram_business_manage_comments'] },
    facebook_300: { id: 'facebook_300', platform: 'facebook', connectionMethod: 'facebook_login', status: 'active', displayName: 'Onyeditivi', username: null, grantedPermissions: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'] },
    threads_400: { id: 'threads_400', platform: 'threads', connectionMethod: 'threads_oauth', status: 'active', displayName: 'Onyeditivi', username: 'onyeditivi', grantedPermissions: ['threads_basic', 'threads_content_publish', 'threads_manage_insights', 'threads_read_replies'] },
    youtube_500: { id: 'youtube_500', platform: 'youtube', connectionMethod: 'google_oauth', status: 'active', displayName: 'NaHaber TV', username: null, grantedPermissions: [] },
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    calls.push(`${url.host}${url.pathname}`)
    for (const [re, fn] of routes) if (re.test(`${url.host}${url.pathname}`)) {
      const r = fn(url)
      return json(r.body, r.status ?? 200)
    }
    return json({ error: { code: 100, message: 'no route' } }, 400)
  }))
})
afterEach(() => vi.unstubAllGlobals())

async function publish(newsId: string, accountId: string, platform: string, format: string, postId: string, now = T0) {
  const c = await claimPublish({ newsId, accountId, platform: platform as never, format: format as never, force: false, actorUid: 'u1', now })
  if (!c.ok) throw new Error('claim failed')
  await finishPublish({ recordId: c.recordId, attemptId: c.attemptId, status: 'succeeded', externalPostId: postId, errorCode: null, actorUid: 'u1', now })
  return c.recordId
}
const tick = (now: number) => refreshDueEngagement(() => now, { deadline: now + 60_000 })
const eng = (newsId: string) => fs.store.get(`socialEngagement/${newsId}`) as Record<string, any> | undefined

describe('model', () => {
  it('etkileşim izinleri yayın zorunluluğuna eklenmez (mevcut yayın etkilenmez)', () => {
    for (const m of ['instagram_login', 'facebook_login', 'threads_oauth'] as const) {
      const req = REQUIRED_PUBLISH_PERMISSIONS[m]
      for (const p of allEngagementScopes(m === 'instagram_login' ? 'instagram' : m === 'facebook_login' ? 'facebook' : 'threads', m)) expect(req).not.toContain(p)
    }
    expect(allEngagementScopes('youtube', 'google_oauth')).toEqual([])
  })

  it('yenileme sıklığı yaşla azalır, 7 günde durur', () => {
    expect(nextRefreshAt(T0, T0 + H)).toBe(T0 + H + 30 * 60_000)
    expect(nextRefreshAt(T0, T0 + 10 * H)).toBe(T0 + 12 * H)
    expect(nextRefreshAt(T0, T0 + 72 * H)).toBe(T0 + 84 * H)
    expect(nextRefreshAt(T0, T0 + 7 * 24 * H)).toBeNull()
  })

  it('platform vermediği sayıyı 0 yazmaz; metin düz ve sınırlı', () => {
    expect(count(undefined)).toBeUndefined()
    expect(count('12')).toBe(12)
    expect(count(-1)).toBeUndefined()
    expect(sumMetrics([{ metrics: { likes: 2 } }, { metrics: { likes: 3, views: 10 } }])).toEqual({ likes: 5, views: 10 })
    expect(cleanCommentText('a‮b\u0000c ')).toBe('abc')
    expect(cleanCommentText('x'.repeat(2000)).length).toBe(1000)
  })

  it('hikâye ve 7 günden eski yayın kuyruğa girmez', () => {
    expect(engagementQueueRow('r', { newsId: 'n', accountId: 'a', platform: 'instagram', format: 'story' }, 'm1', T0, T0)).toBeNull()
    expect(engagementQueueRow('r', { newsId: 'n', accountId: 'a', platform: 'instagram', format: 'post' }, null, T0, T0)).toBeNull()
    expect(engagementQueueRow('r', { newsId: 'n', accountId: 'a', platform: 'instagram', format: 'post' }, 'm1', T0 - 8 * 24 * H, T0)).toBeNull()
    expect(engagementQueueRow('r', { newsId: 'n', accountId: 'a', platform: 'instagram', format: 'reel' }, 'm1', T0, T0)).toMatchObject({ nextAt: T0 + 30 * 60_000 })
  })
})

describe('yayın → kuyruk → okuma', () => {
  it('doğrulanmış gönderi tek kuyruk satırı alır; hikâye almaz; ilk okuma 30 dk sonra', async () => {
    const id = await publish('n1', 'instagram_100', 'instagram', 'post', 'm1')
    await publish('n1', 'instagram_100', 'instagram', 'story', 's1')
    expect(fs.docs('socialEngagementQueue').map((d) => d.id)).toEqual([id])
    expect((await tick(T0 + 10 * 60_000)).refreshed).toBe(0)
    expect(calls).toEqual([])
  })

  it('Instagram: temel izinle beğeni + yorum sayısı; görüntülenme/yorum metni için eksik izin açıkça kaydedilir', async () => {
    routes = [[/graph\.instagram\.com\/v21\.0\/m1$/, () => ({ body: { like_count: 42, comments_count: 3, permalink: 'https://www.instagram.com/p/abc/' } })]]
    await fs.collection('news').doc('n1').set({ slug: 'antalya-tramvay', title: 'Antalya tramvay' })
    const id = await publish('n1', 'instagram_100', 'instagram', 'post', 'm1')
    const r = await tick(T0 + 31 * 60_000)
    expect(r.refreshed).toBe(1)
    // İzin verilmemiş uç noktalar hiç çağrılmaz.
    expect(calls).toEqual(['graph.instagram.com/v21.0/m1'])
    const e = eng('n1')!
    expect(e.slug).toBe('antalya-tramvay')
    expect(e.totals).toEqual({ likes: 42, comments: 3 })
    expect(e.targets[id]).toMatchObject({ state: 'partial', missing: ['instagram_business_manage_insights', 'instagram_business_manage_comments'], permalink: 'https://www.instagram.com/p/abc/' })
    expect(e.targets[id].metrics.views).toBeUndefined()
    // Token hiçbir kayıtta yok.
    expect(JSON.stringify([...fs.store.values()])).not.toContain('TOKEN_')
    const q = fs.store.get(`socialEngagementQueue/${id}`) as { nextAt: number }
    expect(q.nextAt).toBe(T0 + 61 * 60_000)
  })

  it('izinli Instagram + Threads + YouTube + Facebook: sayılar toplanır, yorumlar onay bekler, sitede görünmez', async () => {
    routes = [
      [/graph\.instagram\.com\/v21\.0\/m2$/, () => ({ body: { like_count: 10, comments_count: 2, permalink: 'https://www.instagram.com/p/m2/' } })],
      [/graph\.instagram\.com\/v21\.0\/m2\/insights$/, () => ({ body: { data: [{ name: 'views', values: [{ value: 900 }] }, { name: 'shares', values: [{ value: 4 }] }] } })],
      [/graph\.instagram\.com\/v21\.0\/m2\/comments$/, () => ({ body: { data: [{ id: 'c1', text: 'Harika haber', timestamp: '2026-06-01T10:00:00+0000', username: 'ayse' }, { id: 'c2', text: '', username: 'bos' }] } })],
      [/graph\.threads\.net\/v1\.0\/t1$/, () => ({ body: { permalink: 'https://www.threads.com/@onyeditivi/post/x' } })],
      [/graph\.threads\.net\/v1\.0\/t1\/insights$/, () => ({ body: { data: [{ name: 'views', values: [{ value: 100 }] }, { name: 'likes', values: [{ value: 5 }] }, { name: 'replies', values: [{ value: 1 }] }, { name: 'reposts', values: [{ value: 2 }] }, { name: 'quotes', values: [{ value: 1 }] }] } })],
      [/graph\.threads\.net\/v1\.0\/t1\/replies$/, () => ({ body: { data: [{ id: 'r1', text: 'Takipteyiz', timestamp: '2026-06-01T11:00:00+0000', username: 'mehmet' }] } })],
      [/www\.googleapis\.com\/youtube\/v3\/videos$/, () => ({ body: { items: [{ statistics: { viewCount: '1000', likeCount: '50', commentCount: '1' } }] } })],
      [/www\.googleapis\.com\/youtube\/v3\/commentThreads$/, () => ({ body: { items: [{ id: 'y1', snippet: { topLevelComment: { snippet: { authorDisplayName: 'Ali', textOriginal: 'Teşekkürler', publishedAt: '2026-06-01T12:00:00Z' } } } }] } })],
      [/graph\.facebook\.com\/v21\.0\/300_9$/, () => ({ body: { reactions: { summary: { total_count: 7 } }, comments: { summary: { total_count: 0 } }, shares: { count: 1 }, permalink_url: 'https://facebook.com/300/posts/9' } })],
    ]
    await publish('n2', 'instagram_200', 'instagram', 'post', 'm2')
    await publish('n2', 'threads_400', 'threads', 'post', 't1')
    await publish('n2', 'youtube_500', 'youtube', 'reel', 'vid1')
    await publish('n2', 'facebook_300', 'facebook', 'post', '300_9')
    const r = await tick(T0 + 31 * 60_000)
    expect(r.refreshed).toBe(4)
    const e = eng('n2')!
    expect(e.totals).toEqual({ views: 2000, likes: 72, comments: 4, shares: 8 })
    // Facebook yorum metni için ek izin gerekir: uç nokta çağrılmadı.
    expect(calls.some((c) => c.endsWith('300_9/comments'))).toBe(false)
    const pending = await listCommentsForModeration('pending')
    expect(pending.map((c) => c.id).sort()).toEqual(['instagram_c1', 'threads_r1', 'youtube_y1'])
    // Onaysız yorum herkese açık uçta yok.
    const pub = await readPublicEngagement('n2', null)
    expect(pub!.comments).toEqual([])
    expect(pub!.totals.views).toBe(2000)
    expect(JSON.stringify(pub)).not.toContain('accountId')
  })

  it('moderasyon: onaylanan görünür, reddedilen görünmez, platformda silinen kalkar; denetim kaydında metin yok', async () => {
    let list = [{ id: 'c1', text: 'İlk yorum', username: 'ayse' }, { id: 'c2', text: 'Kötü yorum', username: 'troll' }]
    routes = [
      [/graph\.instagram\.com\/v21\.0\/m3$/, () => ({ body: { like_count: 1, comments_count: list.length } })],
      [/graph\.instagram\.com\/v21\.0\/m3\/insights$/, () => ({ body: { data: [] } })],
      [/graph\.instagram\.com\/v21\.0\/m3\/comments$/, () => ({ body: { data: list } })],
    ]
    await publish('n3', 'instagram_200', 'instagram', 'post', 'm3')
    await tick(T0 + 31 * 60_000)
    expect((await moderateComments(['instagram_c1'], 'approve', 'editor1', T0 + H)).updated).toBe(1)
    expect((await moderateComments(['instagram_c2'], 'reject', 'editor1', T0 + H)).updated).toBe(1)
    let pub = await readPublicEngagement('n3', null)
    expect(pub!.comments.map((c) => c.text)).toEqual(['İlk yorum'])
    expect(pub!.comments[0]).toMatchObject({ platform: 'instagram', author: 'ayse' })
    expect(JSON.stringify(h.audits)).not.toContain('İlk yorum')
    expect(h.audits[0]).toMatchObject({ action: 'social.comment.moderate', entityType: 'socialComment' })
    // Yorum platformda silindi → bir sonraki okumada NaHaber'den kalkar.
    list = [{ id: 'c2', text: 'Kötü yorum', username: 'troll' }]
    await tick(T0 + 2 * H)
    pub = await readPublicEngagement('n3', null)
    expect(pub!.comments).toEqual([])
    expect((fs.store.get('socialComments/instagram_c1') as { status: string }).status).toBe('removed')
    // Silinen yorum yeniden onaylanamaz; reddedilen bekleyen listesine dönmez.
    expect((await moderateComments(['instagram_c1'], 'approve', 'editor1', T0 + 3 * H)).updated).toBe(0)
    expect((fs.store.get('socialComments/instagram_c2') as { status: string }).status).toBe('rejected')
  })

  it('kanonik kimlikli sayfa slug ile bulur; bilinmeyen haber boş döner', async () => {
    routes = [[/graph\.instagram\.com\/v21\.0\/m4$/, () => ({ body: { like_count: 3 } })]]
    await fs.collection('news').doc('n4').set({ slug: 'kanonik-haber' })
    await publish('n4', 'instagram_100', 'instagram', 'post', 'm4')
    await tick(T0 + 31 * 60_000)
    expect((await readPublicEngagement('pg-uuid-1', 'kanonik-haber'))!.totals).toEqual({ likes: 3 })
    expect(await readPublicEngagement('yok', null)).toBeNull()
  })

  it('hesap kullanılamıyorsa son sayılar korunur; gönderi silinmişse takip biter; token reddi döngüye girmez', async () => {
    let fail: 'none' | 'gone' = 'none'
    routes = [[/graph\.instagram\.com\/v21\.0\/m5$/, () => (fail === 'gone' ? { status: 400, body: { error: { code: 100, error_subcode: 33 } } } : { body: { like_count: 8 } })]]
    const id = await publish('n5', 'instagram_100', 'instagram', 'post', 'm5')
    await tick(T0 + 31 * 60_000)
    h.accounts.instagram_100.status = 'needs_reauth'
    const r = await tick(T0 + 2 * H)
    expect(r.failed).toBe(1)
    expect(eng('n5')!.targets[id]).toMatchObject({ state: 'account_unavailable', metrics: { likes: 8 } })
    expect((fs.store.get(`socialEngagementQueue/${id}`) as { nextAt: number }).nextAt).toBeGreaterThanOrEqual(T0 + 4 * H)
    h.accounts.instagram_100.status = 'active'
    fail = 'gone'
    const r2 = await tick(T0 + 5 * H)
    expect(r2.dropped).toBe(1)
    expect(fs.store.has(`socialEngagementQueue/${id}`)).toBe(false)
    expect(eng('n5')!.totals).toEqual({ likes: 8 })
  })

  it('tek tick en fazla 6 satır okur; ilk kurulum son 7 günün yayınlarını bir kez sıraya alır', async () => {
    routes = [[/graph\.instagram\.com/, () => ({ body: { like_count: 1 } })]]
    for (let i = 0; i < 8; i++) await publish(`b${i}`, 'instagram_100', 'instagram', 'post', `x${i}`)
    expect((await tick(T0 + 31 * 60_000)).refreshed).toBe(6)
    // Seed: ledger records from before the feature (no queue rows yet).
    fs.store.clear()
    await fs.collection('socialPublishRecords').doc('old__instagram_100__post').set({ newsId: 'old', accountId: 'instagram_100', platform: 'instagram', format: 'post', status: 'succeeded', externalPostId: 'o1', updatedAt: T0 - 24 * H })
    await fs.collection('socialPublishRecords').doc('old__instagram_100__story').set({ newsId: 'old', accountId: 'instagram_100', platform: 'instagram', format: 'story', status: 'succeeded', externalPostId: 'o2', updatedAt: T0 - 24 * H })
    await fs.collection('socialPublishRecords').doc('fail__instagram_100__post').set({ newsId: 'fail', accountId: 'instagram_100', platform: 'instagram', format: 'post', status: 'failed', externalPostId: null, updatedAt: T0 - H })
    expect(await seedEngagementQueueOnce(T0)).toBe(1)
    expect(await seedEngagementQueueOnce(T0 + H)).toBeNull()
    expect(fs.docs('socialEngagementQueue').map((d) => d.id)).toEqual(['old__instagram_100__post'])
  })
})

describe('etkileşim izni yalnız istenince', () => {
  it('varsayılan bağlantı kapsamı değişmez; «etkileşim izni ver» ek izinleri ister', async () => {
    const { buildInstagramAuthorizeUrl } = await import('../accounts/connect/instagramLogin')
    const { buildThreadsAuthorizeUrl } = await import('../accounts/connect/threadsOAuth')
    const cfg = { appId: 'app', redirectUri: 'https://www.nahaber.com/cb' } as never
    expect(new URL(buildInstagramAuthorizeUrl(cfg, 's')).searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_content_publish')
    expect(new URL(buildInstagramAuthorizeUrl(cfg, 's', allEngagementScopes('instagram', 'instagram_login'))).searchParams.get('scope')).toBe(
      'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights,instagram_business_manage_comments',
    )
    expect(new URL(buildThreadsAuthorizeUrl(cfg, 's', allEngagementScopes('threads', 'threads_oauth'))).searchParams.get('scope')).toBe(
      'threads_basic,threads_content_publish,threads_manage_insights,threads_read_replies',
    )
  })
})
