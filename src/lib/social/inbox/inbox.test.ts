/**
 * Sosyal gelen kutusu: sınıflandırma, otomatik cevap kararı, yorum cevabı /
 * gizleme, DM webhook'u, 24 saat penceresi, ortak çalışan adımı.
 * Gerçek Meta / Google / Firebase / AI yok.
 */
import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from '../accounts/testing/fakeFirestore'
import { Collections } from '@/lib/firebase/collections'

const h = vi.hoisted(() => ({
  db: null as unknown,
  accounts: {} as Record<string, Record<string, unknown>>,
  audits: [] as Array<Record<string, unknown>>,
  draft: null as null | ((i: { text: string }) => { text: string | null; category: string; needsHuman: boolean; provider: string | null; reason: string }),
}))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => h.db }))
vi.mock('../accounts/audit', () => ({ writeSocialAudit: vi.fn(async (e: Record<string, unknown>) => void h.audits.push(e)) }))
vi.mock('../accounts/accountStore', () => ({
  loadSocialAccount: vi.fn(async (id: string) => (h.accounts[id] ? { state: 'ok', account: h.accounts[id] } : { state: 'missing' })),
  getSocialAccount: vi.fn(async (id: string) => h.accounts[id] ?? null),
  isWellFormedAccountId: (id: unknown) => typeof id === 'string' && /^[a-z]+_[A-Za-z0-9_-]+$/.test(id),
}))
vi.mock('../accounts/resolvePublishTarget', () => ({
  resolvePublishTarget: vi.fn(async (id: string) => {
    const a = h.accounts[id]
    if (!a || a.status !== 'active') return { ok: false, code: 'not_found' }
    const base = { facebook: 'https://graph.facebook.com/v21.0', instagram: 'https://graph.instagram.com/v21.0', threads: 'https://graph.threads.net/v1.0', youtube: 'https://www.googleapis.com/youtube/v3' }[a.platform as string]
    const target: Record<string, unknown> = { platform: a.platform, accountId: id, connectionMethod: a.connectionMethod, apiBase: base, igUserId: a.externalId, pageId: a.externalId, threadsUserId: a.externalId, channelId: a.externalId }
    Object.defineProperty(target, 'accessToken', { value: `TOKEN_${id}`, enumerable: false })
    return { ok: true, target }
  }),
}))
vi.mock('./ai', () => ({
  draftReply: vi.fn(async (i: { text: string }) => {
    const { classifyByRules, isAutoSafe } = await import('./model')
    if (h.draft) return h.draft(i)
    const c = classifyByRules(i.text)
    return { text: null, category: c, needsHuman: !isAutoSafe(c), provider: null, reason: 'ai_off' }
  }),
}))

import {
  allInboxScopes,
  classifyByRules,
  decideAuto,
  DEFAULT_INBOX_SETTINGS,
  hasForeignLink,
  inboxCapabilities,
  messagingWindow,
  parseInboxSettings,
  YOUTUBE_FORCE_SSL_SCOPE,
} from './model'
import { verifyChallenge, verifySignature } from './webhookAuth'
import { inboxTiming } from './platform'
import {
  getConversation,
  hideCommentFromPanel,
  ingestMessagingWebhook,
  replyToCommentFromPanel,
  replyToConversationFromPanel,
  runInboxTick,
} from './store'

const T0 = 1_780_000_000_000
const H = 3600_000
let fs: FakeFirestore
let calls: Array<{ url: string; method: string; body: string }> = []
let responder: (url: string, method: string, body: string) => Response | Promise<Response>

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  fs = new FakeFirestore()
  h.db = fs
  h.audits = []
  h.draft = null
  calls = []
  inboxTiming.threadsPublishDelayMs = 0
  delete process.env.SOCIAL_INBOX_AUTO_REPLY
  h.accounts = {
    instagram_100: { id: 'instagram_100', externalId: '100', platform: 'instagram', connectionMethod: 'instagram_login', status: 'active', displayName: 'NaHaber Antalya', username: 'antalya_nahaber_com', ownership: { citySlug: 'antalya', publisherId: null }, grantedPermissions: ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_comments', 'instagram_business_manage_messages'], instagram: { igUserId: '100', linkedFacebookPageId: null } },
    facebook_300: { id: 'facebook_300', externalId: '300', platform: 'facebook', connectionMethod: 'facebook_login', status: 'active', displayName: 'Onyeditivi', username: null, ownership: { citySlug: 'canakkale', publisherId: null }, grantedPermissions: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_engagement', 'pages_read_user_content', 'pages_messaging', 'pages_manage_metadata'], facebook: { pageId: '300' } },
    threads_400: { id: 'threads_400', externalId: '400', platform: 'threads', connectionMethod: 'threads_oauth', status: 'active', displayName: 'NaHaber', username: 'nahaber', ownership: { central: true, citySlug: null, publisherId: null }, grantedPermissions: ['threads_basic', 'threads_content_publish', 'threads_manage_replies'], threads: { threadsUserId: '400' } },
  }
  responder = (url) => {
    if (url.includes('/replies') || url.includes('/comments')) return ok({ id: 'reply_1' })
    if (url.includes('/messages')) return ok({ recipient_id: '9', message_id: `m_out_${calls.length}` })
    if (url.includes('/threads_publish')) return ok({ id: 'th_pub_1' })
    if (url.includes('/me/threads')) return ok({ id: 'th_container_1' })
    return ok({ success: true })
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? init.body : ''
    calls.push({ url: String(url), method, body })
    return responder(String(url), method, body)
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function seedComment(id: string, over: Record<string, unknown> = {}) {
  await fs.collection(Collections.SOCIAL_COMMENTS).doc(id).set({
    commentId: id.split('_').slice(1).join('_'),
    newsId: 'n1',
    ledgerId: 'l1',
    platform: id.split('_')[0],
    accountId: { instagram: 'instagram_100', facebook: 'facebook_300', threads: 'threads_400' }[id.split('_')[0]] ?? 'instagram_100',
    author: 'okur1',
    text: 'Teşekkürler, eline sağlık',
    createdAt: T0 - 10 * 60_000,
    fetchedAt: T0,
    status: 'pending',
    permalink: null,
    ...over,
  })
}

describe('sınıflandırma ve karar (saf)', () => {
  it('kişi gerektiren kategoriler güvenli olanların önüne geçer', () => {
    expect(classifyByRules('Teşekkürler NaHaber')).toBe('thanks')
    expect(classifyByRules('haberin linki nerede?')).toBe('link_request')
    expect(classifyByRules('Teşekkürler ama yalan haber bu, düzeltin')).toBe('complaint')
    expect(classifyByRules('Avukatım dava açacak')).toBe('legal')
    expect(classifyByRules('CHP ne diyor bu işe')).toBe('political')
    expect(classifyByRules('Allah rahmet eylesin, başsağlığı')).toBe('sensitive')
    expect(classifyByRules('salak mısınız')).toBe('abuse')
    // «özel mesaj» siyasi sayılmaz
    expect(classifyByRules('özel mesajdan haber göndermek istiyorum')).toBe('contact')
  })

  it('otomatik mod yalnız güvenli, izinli, sınır içi öğeye cevap verir', () => {
    const base = {
      kind: 'comment' as const,
      category: 'thanks' as const,
      settings: { ...DEFAULT_INBOX_SETTINGS, commentMode: 'auto' as const },
      globalEnabled: true,
      newsSensitivity: 0,
      ownAccount: false,
      canReply: true,
      itemAt: T0 - 60_000,
      now: T0,
      counter: { count: 0, lastAt: null, authors: [] },
      authorKey: 'a1',
    }
    expect(decideAuto(base)).toEqual({ action: 'reply', category: 'thanks' })
    expect(decideAuto({ ...base, globalEnabled: false })).toMatchObject({ action: 'draft', reason: 'global_off' })
    expect(decideAuto({ ...base, category: 'complaint' })).toMatchObject({ action: 'draft', reason: 'not_safe_category' })
    expect(decideAuto({ ...base, category: 'contact' })).toMatchObject({ action: 'draft', reason: 'category_not_allowed' })
    expect(decideAuto({ ...base, newsSensitivity: 2 })).toMatchObject({ action: 'draft', reason: 'sensitive_news' })
    expect(decideAuto({ ...base, counter: { count: 20, lastAt: null, authors: [] } })).toMatchObject({ reason: 'daily_limit' })
    expect(decideAuto({ ...base, counter: { count: 1, lastAt: T0 - 30_000, authors: [] } })).toMatchObject({ reason: 'interval' })
    expect(decideAuto({ ...base, counter: { count: 1, lastAt: T0 - H, authors: ['a1'] } })).toMatchObject({ reason: 'same_person' })
    expect(decideAuto({ ...base, itemAt: T0 - 7 * H })).toMatchObject({ reason: 'old_item' })
    expect(decideAuto({ ...base, ownAccount: true })).toMatchObject({ action: 'skip', reason: 'own_account' })
    expect(decideAuto({ ...base, settings: { ...base.settings, paused: true } })).toMatchObject({ reason: 'paused' })
    expect(decideAuto({ ...base, settings: { ...base.settings, commentMode: 'off' } })).toMatchObject({ action: 'skip', reason: 'mode_off' })
    expect(decideAuto({ ...base, kind: 'dm', settings: { ...base.settings, dmMode: 'auto' }, window: 'human_agent' })).toMatchObject({ reason: 'window_closed' })
  })

  it('ayarlar sınırlanır; güvenli olmayan kategori otomatiğe eklenemez', () => {
    const s = parseInboxSettings({ commentMode: 'auto', dmMode: 'nope', autoCategories: ['thanks', 'complaint', 'political'], dailyLimit: 5000, minIntervalSec: 1 })
    expect(s.commentMode).toBe('auto')
    expect(s.dmMode).toBe('off')
    expect(s.autoCategories).toEqual(['thanks'])
    expect(s.dailyLimit).toBe(200)
    expect(s.minIntervalSec).toBe(30)
  })

  it('izin kümeleri platform ve bağlantı yöntemine göre', () => {
    expect(allInboxScopes('instagram', 'instagram_login')).toEqual(['instagram_business_manage_comments', 'instagram_business_manage_messages'])
    expect(allInboxScopes('facebook', 'facebook_login')).toEqual(expect.arrayContaining(['pages_manage_engagement', 'pages_messaging', 'pages_manage_metadata']))
    expect(allInboxScopes('youtube', 'google_oauth')).toEqual([YOUTUBE_FORCE_SSL_SCOPE])
    expect(allInboxScopes('facebook', 'legacy')).toEqual([])
    expect(inboxCapabilities({ platform: 'threads', connectionMethod: 'threads_oauth', grantedPermissions: ['threads_basic'] })).toMatchObject({ reply: 'missing', messages: 'unsupported' })
    expect(inboxCapabilities({ platform: 'instagram', connectionMethod: 'instagram_login', grantedPermissions: null })).toMatchObject({ reply: 'unknown' })
  })

  it('mesaj penceresi: 24 saat açık, 7 güne kadar yalnız kişi, sonra kapalı', () => {
    expect(messagingWindow(T0 - H, T0)).toBe('open')
    expect(messagingWindow(T0 - 30 * H, T0)).toBe('human_agent')
    expect(messagingWindow(T0 - 8 * 24 * H, T0)).toBe('closed')
    expect(messagingWindow(null, T0)).toBe('closed')
  })

  it('yalnız nahaber.com bağlantısına izin verilir', () => {
    expect(hasForeignLink('Haber: https://www.nahaber.com/haber/x')).toBe(false)
    expect(hasForeignLink('bakın https://evil.example/x')).toBe(true)
  })
})

describe('webhook doğrulaması', () => {
  it('imza ve doğrulama belirteci', () => {
    const body = '{"object":"instagram"}'
    const sig = `sha256=${createHmac('sha256', 'secretA').update(body).digest('hex')}`
    expect(verifySignature(body, sig, ['other', 'secretA'])).toBe(true)
    expect(verifySignature(body, sig, ['other'])).toBe(false)
    expect(verifySignature(body + ' ', sig, ['secretA'])).toBe(false)
    expect(verifySignature(body, null, ['secretA'])).toBe(false)
    const env = { SOCIAL_META_WEBHOOK_VERIFY_TOKEN: 'verify-token-123456' } as unknown as NodeJS.ProcessEnv
    expect(verifyChallenge(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-token-123456', 'hub.challenge': '987' }), env)).toBe('987')
    expect(verifyChallenge(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token-1234567', 'hub.challenge': '987' }), env)).toBeNull()
  })
})

describe('yorum cevabı ve gizleme', () => {
  it('Instagram yorumuna panelden cevap: tek gönderim, kayıt, metinsiz denetim', async () => {
    await seedComment('instagram_c1')
    const r = await replyToCommentFromPanel({ commentDocId: 'instagram_c1', text: 'Teşekkür ederiz!', source: 'editor', actorUid: 'u1', requestId: 'req-00000001', now: T0 })
    expect(r).toMatchObject({ ok: true, status: 'sent', duplicate: false })
    const post = calls.filter((c) => c.method === 'POST')
    expect(post).toHaveLength(1)
    expect(post[0].url).toBe('https://graph.instagram.com/v21.0/c1/replies')
    expect(new URLSearchParams(post[0].body).get('message')).toBe('Teşekkür ederiz!')
    // Aynı istek tekrar → platforma ikinci çağrı yok
    const again = await replyToCommentFromPanel({ commentDocId: 'instagram_c1', text: 'Teşekkür ederiz!', source: 'editor', actorUid: 'u1', requestId: 'req-00000001', now: T0 })
    expect(again).toMatchObject({ ok: true, duplicate: true })
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
    const c = fs.docs(Collections.SOCIAL_COMMENTS)[0].data as Record<string, { status: string }>
    expect(c.reply.status).toBe('sent')
    const audit = h.audits.find((a) => a.action === 'social.inbox.reply')!
    expect(JSON.stringify(audit)).not.toContain('Teşekkür ederiz')
    expect(JSON.stringify(audit)).not.toContain('TOKEN_')
  })

  it('cevap kaybolursa «belirsiz» olur ve körlemesine tekrar gönderilmez', async () => {
    await seedComment('instagram_c2')
    responder = () => {
      throw new Error('socket hang up')
    }
    const r = await replyToCommentFromPanel({ commentDocId: 'instagram_c2', text: 'Merhaba', source: 'editor', actorUid: 'u1', requestId: 'req-00000002', now: T0 })
    expect(r).toMatchObject({ ok: false, status: 502 })
    const doc = fs.docs(Collections.SOCIAL_COMMENTS)[0].data as Record<string, { status: string }>
    expect(doc.reply.status).toBe('uncertain')
    const next = await replyToCommentFromPanel({ commentDocId: 'instagram_c2', text: 'Merhaba', source: 'editor', actorUid: 'u1', requestId: 'req-00000003', now: T0 + 1000 })
    expect(next).toMatchObject({ ok: false, code: 'uncertain_needs_check' })
  })

  it('başka sitelere bağlantı ve boş metin reddedilir', async () => {
    await seedComment('instagram_c3')
    expect(await replyToCommentFromPanel({ commentDocId: 'instagram_c3', text: 'bkz https://x.example', source: 'editor', actorUid: 'u1', requestId: 'req-00000004', now: T0 })).toMatchObject({ ok: false, code: 'foreign_link' })
    expect(await replyToCommentFromPanel({ commentDocId: 'instagram_c3', text: '   ', source: 'editor', actorUid: 'u1', requestId: 'req-00000005', now: T0 })).toMatchObject({ ok: false, code: 'empty' })
    expect(calls).toHaveLength(0)
  })

  it('Facebook yorumu gizlenince NaHaber’de de gösterilmez', async () => {
    await seedComment('facebook_c4', { status: 'approved' })
    const r = await hideCommentFromPanel({ commentDocId: 'facebook_c4', hidden: true, actorUid: 'u1', now: T0 })
    expect(r).toEqual({ ok: true })
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toBe('https://graph.facebook.com/v21.0/c4')
    expect(new URLSearchParams(post.body).get('is_hidden')).toBe('true')
    const d = fs.docs(Collections.SOCIAL_COMMENTS)[0].data as Record<string, unknown>
    expect(d.hidden).toBe(true)
    expect(d.status).toBe('rejected')
  })

  it('Threads cevabı: kapsayıcı + yayın, cevap_to kimliğiyle', async () => {
    await seedComment('threads_c5')
    const r = await replyToCommentFromPanel({ commentDocId: 'threads_c5', text: 'Teşekkürler', source: 'editor', actorUid: 'u1', requestId: 'req-00000006', now: T0 })
    expect(r).toMatchObject({ ok: true, status: 'sent' })
    const [container, publish] = calls.filter((c) => c.method === 'POST')
    expect(container.url).toBe('https://graph.threads.net/v1.0/me/threads')
    expect(new URLSearchParams(container.body).get('reply_to_id')).toBe('c5')
    expect(publish.url).toBe('https://graph.threads.net/v1.0/400/threads_publish')
    expect(new URLSearchParams(publish.body).get('creation_id')).toBe('th_container_1')
  })
})

describe('DM (webhook + cevap)', () => {
  const igEvent = (mid: string, text: string, ts: number, extra: Record<string, unknown> = {}) => ({
    object: 'instagram',
    entry: [{ id: '100', time: ts, messaging: [{ sender: { id: '555' }, recipient: { id: '100' }, timestamp: ts, message: { mid, text, ...extra } }] }],
  })

  it('mesaj konuşma olarak saklanır; tekrar teslimat çoğaltmaz; bilinmeyen hesap yok sayılır', async () => {
    expect(await ingestMessagingWebhook(igEvent('mid.1', 'Merhaba, haberim var', T0), T0)).toMatchObject({ accepted: 1 })
    expect(await ingestMessagingWebhook(igEvent('mid.1', 'Merhaba, haberim var', T0), T0)).toMatchObject({ accepted: 1 })
    expect(fs.docs(Collections.SOCIAL_MESSAGES)).toHaveLength(1)
    const conv = fs.docs(Collections.SOCIAL_CONVERSATIONS)[0].data as Record<string, unknown>
    expect(conv).toMatchObject({ accountId: 'instagram_100', participantId: '555', unread: 1, inboxState: 'queued', lastInboundAt: T0 })
    const unknown = { object: 'instagram', entry: [{ id: '999', messaging: [{ sender: { id: '1' }, recipient: { id: '999' }, timestamp: T0, message: { mid: 'x', text: 'hi' } }] }] }
    expect(await ingestMessagingWebhook(unknown, T0)).toMatchObject({ accepted: 0, unknownAccounts: 1 })
  })

  it('24 saat içinde RESPONSE, sonrasında HUMAN_AGENT, 7 günden sonra gönderilmez', async () => {
    await ingestMessagingWebhook(igEvent('mid.2', 'Soru', T0), T0)
    const convId = fs.docs(Collections.SOCIAL_CONVERSATIONS)[0].id
    const r1 = await replyToConversationFromPanel({ conversationId: convId, text: 'Merhaba', source: 'editor', actorUid: 'u1', requestId: 'req-dm-0001', now: T0 + H })
    expect(r1).toMatchObject({ ok: true, status: 'sent' })
    const send1 = calls.filter((c) => c.method === 'POST').at(-1)!
    expect(send1.url).toBe('https://graph.instagram.com/v21.0/100/messages')
    const p1 = new URLSearchParams(send1.body)
    expect(p1.get('messaging_type')).toBe('RESPONSE')
    expect(JSON.parse(p1.get('recipient')!)).toEqual({ id: '555' })
    const r2 = await replyToConversationFromPanel({ conversationId: convId, text: 'Ek bilgi', source: 'editor', actorUid: 'u1', requestId: 'req-dm-0002', now: T0 + 30 * H })
    expect(r2).toMatchObject({ ok: true })
    const p2 = new URLSearchParams(calls.filter((c) => c.method === 'POST').at(-1)!.body)
    expect(p2.get('tag')).toBe('HUMAN_AGENT')
    const r3 = await replyToConversationFromPanel({ conversationId: convId, text: 'Geç', source: 'editor', actorUid: 'u1', requestId: 'req-dm-0003', now: T0 + 8 * 24 * H })
    expect(r3).toMatchObject({ ok: false, code: 'window_closed' })
    const got = await getConversation(convId)
    expect(got!.messages.map((m) => m.direction)).toEqual(['in', 'out', 'out'])
  })
})

describe('ortak çalışan adımı', () => {
  it('otomatik modda güvenli yorum bir kez cevaplanır; şikâyet kişiye kalır; genel anahtar kapalıysa yalnız taslak', async () => {
    await fs.collection(Collections.SOCIAL_INBOX_SETTINGS).doc('instagram_100').set({ ...DEFAULT_INBOX_SETTINGS, commentMode: 'auto' })
    await seedComment('instagram_t1', { inboxState: 'queued', text: 'Teşekkürler NaHaber' })
    await seedComment('instagram_t2', { inboxState: 'queued', text: 'Yalan haber, düzeltin', author: 'okur2' })

    // Genel anahtar kapalı → cevap yok, taslak var
    let rep = await runInboxTick(() => T0, { deadline: T0 + 60_000 })
    expect(rep.autoReplies).toBe(0)
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
    const t1 = fs.docs(Collections.SOCIAL_COMMENTS).find((d) => d.id === 'instagram_t1')!.data as Record<string, unknown>
    expect(t1).toMatchObject({ inboxState: 'done', category: 'thanks', autoBlock: 'global_off' })
    expect((t1.draft as { source: string }).source).toBe('template')

    // Genel anahtar açık → güvenli olan bir kez cevaplanır
    process.env.SOCIAL_INBOX_AUTO_REPLY = 'on'
    await fs.collection(Collections.SOCIAL_COMMENTS).doc('instagram_t1').update({ inboxState: 'queued' })
    await fs.collection(Collections.SOCIAL_COMMENTS).doc('instagram_t2').update({ inboxState: 'queued' })
    rep = await runInboxTick(() => T0 + 60_000, { deadline: T0 + 120_000 })
    expect(rep.autoReplies).toBe(1)
    const posts = calls.filter((c) => c.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toContain('/t1/replies')
    const t2 = fs.docs(Collections.SOCIAL_COMMENTS).find((d) => d.id === 'instagram_t2')!.data as Record<string, unknown>
    expect(t2).toMatchObject({ category: 'complaint', autoBlock: 'not_safe_category' })
    expect(t2.reply ?? null).toBeNull()

    // Aynı yorum yeniden kuyruğa girse de ikinci otomatik cevap yok
    await fs.collection(Collections.SOCIAL_COMMENTS).doc('instagram_t1').update({ inboxState: 'queued' })
    await runInboxTick(() => T0 + 10 * 60_000, { deadline: T0 + 11 * 60_000 })
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
    const counter = fs.docs(Collections.SOCIAL_INBOX_COUNTERS)[0].data as { count: number; authors: string[] }
    expect(counter.count).toBe(1)
    expect(counter.authors[0]).not.toContain('okur1')
  })

  it('hassas haberin yorumuna otomatik cevap verilmez', async () => {
    process.env.SOCIAL_INBOX_AUTO_REPLY = 'on'
    await fs.collection(Collections.NEWS).doc('n9').set({ title: 'Kazada 3 kişi hayatını kaybetti', slug: 'kaza-3-olu' })
    await fs.collection(Collections.SOCIAL_INBOX_SETTINGS).doc('instagram_100').set({ ...DEFAULT_INBOX_SETTINGS, commentMode: 'auto' })
    await seedComment('instagram_t3', { inboxState: 'queued', text: 'Teşekkürler haber için', newsId: 'n9' })
    await runInboxTick(() => T0, { deadline: T0 + 60_000 })
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
    expect((fs.docs(Collections.SOCIAL_COMMENTS)[0].data as Record<string, unknown>).autoBlock).toBe('sensitive_news')
  })

  it('panelden durdurulunca otomatik cevap durur', async () => {
    process.env.SOCIAL_INBOX_AUTO_REPLY = 'on'
    await fs.collection(Collections.SOCIAL_AUTOMATION_STATE).doc('inbox').set({ autoPaused: true })
    await fs.collection(Collections.SOCIAL_INBOX_SETTINGS).doc('instagram_100').set({ ...DEFAULT_INBOX_SETTINGS, commentMode: 'auto' })
    await seedComment('instagram_t4', { inboxState: 'queued', text: 'Teşekkürler' })
    await runInboxTick(() => T0, { deadline: T0 + 60_000 })
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })
})
