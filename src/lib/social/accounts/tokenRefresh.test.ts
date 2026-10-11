import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from './testing/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => h.db }))

import { refreshDueTokens, MIN_TOKEN_AGE_MS } from './tokenRefresh'
import { buildEncryptedSecretRecord, decryptAccessToken, readSecretRecord } from './secretStore'
import { accountIdFor, requiredPermissionsFor, type SocialAccount } from './types'

const NOW = 1_800_000_000_000
let fs: FakeFirestore
let calls: string[] = []
let logs: string[] = []
let reply: (url: string) => Response = () => new Response('{}')

function acct(platform: 'instagram' | 'threads' | 'facebook', id: string, over: Partial<SocialAccount> = {}): SocialAccount {
  const method = platform === 'instagram' ? 'instagram_login' : platform === 'threads' ? 'threads_oauth' : 'facebook_login'
  const part = platform === 'facebook' ? { facebook: { pageId: id } } : platform === 'instagram' ? { instagram: { igUserId: id, linkedFacebookPageId: null } } : { threads: { threadsUserId: id } }
  return {
    id: accountIdFor(platform, id), externalId: id, displayName: 'x', username: null, ownership: { citySlug: 'antalya', publisherId: null },
    status: 'active', statusReason: null, connectedBy: 'x', connectedAt: NOW - 50 * 86_400_000, createdAt: 0, updatedAt: 0, updatedBy: null,
    tokenExpiresAt: NOW + 5 * 86_400_000, tokenExpiryVerified: true, grantedPermissions: [...requiredPermissionsFor(platform, method)], permissionsVerifiedAt: 1,
    platformAccountType: platform === 'instagram' ? 'BUSINESS' : null, platform, connectionMethod: method, ...part, ...over,
  } as SocialAccount
}
async function seed(a: SocialAccount, token: string) {
  await fs.collection('socialAccounts').doc(a.id).set({ ...a })
  await fs.collection('socialAccountSecrets').doc(a.id).set({ ...(await buildEncryptedSecretRecord(token, a.platform === 'instagram' ? 'instagram_user' : a.platform === 'threads' ? 'threads_user' : 'facebook_page')) })
}

beforeEach(() => {
  fs = new FakeFirestore()
  h.db = fs
  calls = []
  logs = []
  process.env.SECRET_ENCRYPTION_KEY = 'f'.repeat(64)
  vi.stubGlobal('fetch', async (u: RequestInfo | URL) => {
    calls.push(String(u))
    return reply(String(u))
  })
  for (const lvl of ['log', 'warn', 'error'] as const) vi.spyOn(console, lvl).mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('token yenileme', () => {
  it('Instagram ve Threads resmî uçlarla yenilenir; yeni anahtar şifreli saklanır, değer loglara düşmez', async () => {
    await seed(acct('instagram', '11'), 'OLD_IG')
    await seed(acct('threads', '22'), 'OLD_TH')
    reply = (u) => new Response(JSON.stringify({ access_token: u.includes('instagram') ? 'NEW_IG' : 'NEW_TH', token_type: 'bearer', expires_in: 5_184_000 }))
    const r = await refreshDueTokens(NOW)
    expect(r.refreshed).toBe(2)
    expect(calls.some((u) => u.startsWith('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token'))).toBe(true)
    expect(calls.some((u) => u.startsWith('https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token'))).toBe(true)
    const sec = await readSecretRecord('instagram_11')
    expect(sec && sec.kind === 'encrypted' ? await decryptAccessToken(sec) : null).toBe('NEW_IG')
    expect(fs.store.get('socialAccounts/instagram_11')).toMatchObject({ tokenExpiresAt: NOW + 5_184_000_000, tokenRefreshedAt: NOW, refreshLeaseUntil: null })
    for (const [k, v] of fs.store) {
      if (k.startsWith('socialAccountSecrets/')) continue
      expect(JSON.stringify(v)).not.toMatch(/NEW_IG|NEW_TH|OLD_IG|OLD_TH/)
    }
    expect(logs.join('\n')).not.toMatch(/NEW_IG|NEW_TH|OLD_IG|OLD_TH/)
  })

  it('24 saatten genç anahtar ve Facebook sayfa anahtarı yenilenmez', async () => {
    await seed(acct('instagram', '11', { connectedAt: NOW - MIN_TOKEN_AGE_MS + 1000 }), 'OLD')
    await seed(acct('facebook', '33'), 'FB')
    const r = await refreshDueTokens(NOW)
    expect(r.refreshed).toBe(0)
    expect(calls).toEqual([])
  })

  it('iptal (190) → yeniden bağlantı gerekli; diğer hata → uyarı + 6 saat bekleme', async () => {
    await seed(acct('instagram', '11'), 'OLD')
    await seed(acct('threads', '22'), 'OLD2')
    reply = (u) =>
      u.includes('instagram')
        ? new Response(JSON.stringify({ error: { message: 'x', code: 190 } }), { status: 400 })
        : new Response(JSON.stringify({ error: { message: 'x', code: 2 } }), { status: 500 })
    const r = await refreshDueTokens(NOW)
    expect(r.failed).toBe(2)
    expect(fs.store.get('socialAccounts/instagram_11')).toMatchObject({ status: 'needs_reauth' })
    expect(fs.store.get('socialAccounts/threads_22')).toMatchObject({ status: 'active', tokenWarning: expect.stringContaining('yeniden bağlayın') })
    calls = []
    await refreshDueTokens(NOW + 60_000)
    expect(calls).toEqual([])
  })

  it('süresi dolmuş etkin hesap yeniden bağlantı durumuna geçer', async () => {
    await seed(acct('threads', '22', { tokenExpiresAt: NOW - 1 }), 'OLD')
    const r = await refreshDueTokens(NOW)
    expect(r.expired).toBe(1)
    expect(fs.store.get('socialAccounts/threads_22')).toMatchObject({ status: 'needs_reauth' })
  })

  it('iki çalışan aynı anda aynı hesabı yenilemez (kira)', async () => {
    await seed(acct('instagram', '11'), 'OLD')
    reply = () => new Response(JSON.stringify({ access_token: 'NEW', expires_in: 5_184_000 }))
    const [a, b] = await Promise.all([refreshDueTokens(NOW), refreshDueTokens(NOW)])
    expect(a.refreshed + b.refreshed).toBe(1)
    expect(calls).toHaveLength(1)
  })
})
