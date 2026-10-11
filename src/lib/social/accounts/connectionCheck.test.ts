import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from './testing/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => h.db }))

import { checkAccountConnection } from './connectionCheck'
import { buildEncryptedSecretRecord } from './secretStore'
import { accountIdFor, requiredPermissionsFor, type SocialAccount } from './types'

let fs: FakeFirestore
let calls: string[] = []
let logs: string[] = []
let reply: (url: string) => Response = () => new Response('{"id":"1"}')

function acct(platform: 'instagram' | 'facebook' | 'threads', id: string): SocialAccount {
  const method = platform === 'instagram' ? 'instagram_login' : platform === 'threads' ? 'threads_oauth' : 'facebook_login'
  const part = platform === 'facebook' ? { facebook: { pageId: id } } : platform === 'instagram' ? { instagram: { igUserId: id, linkedFacebookPageId: null } } : { threads: { threadsUserId: id } }
  return {
    id: accountIdFor(platform, id), externalId: id, displayName: 'x', username: null, ownership: { citySlug: 'canakkale', publisherId: null },
    status: 'active', statusReason: null, connectedBy: 'x', connectedAt: 1, createdAt: 0, updatedAt: 0, updatedBy: null,
    tokenExpiresAt: null, tokenExpiryVerified: true, grantedPermissions: [...requiredPermissionsFor(platform, method)], permissionsVerifiedAt: 1,
    platformAccountType: platform === 'instagram' ? 'BUSINESS' : null, platform, connectionMethod: method, ...part,
  } as SocialAccount
}
async function seed(a: SocialAccount) {
  await fs.collection('socialAccounts').doc(a.id).set({ ...a })
  await fs.collection('socialAccountSecrets').doc(a.id).set({ ...(await buildEncryptedSecretRecord('TOKEN_VALUE_NEVER_LOGGED', a.platform === 'instagram' ? 'instagram_user' : a.platform === 'threads' ? 'threads_user' : 'facebook_page')) })
}

beforeEach(() => {
  fs = new FakeFirestore()
  h.db = fs
  calls = []
  logs = []
  process.env.SECRET_ENCRYPTION_KEY = 'a'.repeat(64)
  vi.stubGlobal('fetch', async (u: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(u)}`)
    return reply(String(u))
  })
  for (const lvl of ['log', 'warn', 'error'] as const) vi.spyOn(console, lvl).mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('bağlantı kontrolü (yalnız okuma)', () => {
  it('çalışan anahtar: tek GET, paylaşım yok, durum değişmez', async () => {
    const a = acct('instagram', '17841477331518718')
    await seed(a)
    const r = await checkAccountConnection(a.id, { by: 'admin', now: 5 })
    expect(r.state).toBe('ok')
    expect(calls).toHaveLength(1)
    expect(calls[0].startsWith('GET https://graph.instagram.com/')).toBe(true)
    expect(fs.store.get(`socialAccounts/${a.id}`)).toMatchObject({ status: 'active' })
  })

  it('iptal edilmiş anahtar (190/460): needs_reauth; sahiplik korunur; anahtar loglanmaz', async () => {
    const a = acct('facebook', '167304713122153')
    await seed(a)
    reply = () => new Response(JSON.stringify({ error: { message: 'session invalidated', type: 'OAuthException', code: 190, error_subcode: 460 } }), { status: 400 })
    const r = await checkAccountConnection(a.id, { by: 'admin', now: 5 })
    expect(r).toMatchObject({ state: 'token_rejected', code: 190, subcode: 460, statusChanged: true })
    expect(calls).toEqual([expect.stringMatching(/^GET https:\/\/graph\.facebook\.com\/v\d+\.\d+\/167304713122153\?/)])
    expect(fs.store.get(`socialAccounts/${a.id}`)).toMatchObject({ status: 'needs_reauth', ownership: { citySlug: 'canakkale' } })
    expect(logs.join('\n')).not.toContain('TOKEN_VALUE_NEVER_LOGGED')
    expect(JSON.stringify(fs.docs('cmsAuditLogs').map((d) => d.data))).not.toContain('TOKEN_VALUE_NEVER_LOGGED')
  })

  it('geçici platform hatası durumu değiştirmez', async () => {
    const a = acct('threads', '39373226298991726')
    await seed(a)
    reply = () => new Response(JSON.stringify({ error: { message: 'x', code: 2 } }), { status: 500 })
    const r = await checkAccountConnection(a.id, { by: 'admin', now: 5 })
    expect(r.state).toBe('unavailable')
    expect(fs.store.get(`socialAccounts/${a.id}`)).toMatchObject({ status: 'active' })
  })
})
