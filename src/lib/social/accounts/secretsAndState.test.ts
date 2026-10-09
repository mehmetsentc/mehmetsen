/** Şifreli sır saklama + OAuth state (in-memory Firestore; gerçek servis yok). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { FakeFirestore } from './testing/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => h.db }))

import {
  buildEncryptedSecretRecord,
  decryptAccessToken,
  readSecretRecord,
  saveEncryptedAccessToken,
  SecretEncryptionUnavailableError,
} from './secretStore'
import {
  buildBindingCookie,
  consumeSocialOAuthState,
  createSocialOAuthState,
  OAUTH_BINDING_COOKIE_DEV,
  OAUTH_BINDING_COOKIE_SECURE,
  OAUTH_STATE_TTL_MS,
  oauthCookieIsSecure,
} from './oauthState'

let fs: FakeFirestore
const NOW = 1_800_000_000_000
const sha = (v: string) => createHash('sha256').update(v).digest('hex')

beforeEach(() => {
  fs = new FakeFirestore()
  h.db = fs
  process.env.SECRET_ENCRYPTION_KEY = 'c'.repeat(64)
  delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY
})
afterEach(() => {
  delete process.env.SECRET_ENCRYPTION_KEY
})

describe('şifreli sır saklama', () => {
  it('token AES-GCM ile şifrelenir; düz metin belgede yok, çözme aynı değeri verir', async () => {
    await saveEncryptedAccessToken('facebook_5551', 'EAAG_PLAIN_TOKEN_VALUE', 'facebook_page')
    const raw = JSON.stringify(fs.store.get('socialAccountSecrets/facebook_5551'))
    expect(raw).not.toContain('EAAG_PLAIN_TOKEN_VALUE')
    const rec = await readSecretRecord('facebook_5551')
    expect(rec?.kind).toBe('encrypted')
    if (rec?.kind !== 'encrypted') throw new Error('x')
    expect(rec.accessTokenEncrypted.split(':')).toHaveLength(3)
    expect(await decryptAccessToken(rec)).toBe('EAAG_PLAIN_TOKEN_VALUE')
  })

  it('şifreleme anahtarı yoksa kayıt reddedilir ve hiçbir şey yazılmaz (düz metne düşmez)', async () => {
    delete process.env.SECRET_ENCRYPTION_KEY
    await expect(saveEncryptedAccessToken('facebook_5552', 'EAAG_NO_KEY', 'facebook_page')).rejects.toBeInstanceOf(
      SecretEncryptionUnavailableError,
    )
    await expect(buildEncryptedSecretRecord('EAAG_NO_KEY', 'facebook_page')).rejects.toThrow(/SECRET_ENCRYPTION_KEY/)
    expect(fs.writes).toBe(0)
    expect(fs.store.size).toBe(0)
  })

  it('kısa/bozuk anahtar da reddedilir; hata mesajı token içermez', async () => {
    process.env.SECRET_ENCRYPTION_KEY = 'abc'
    const err = await buildEncryptedSecretRecord('EAAG_SHORT_KEY', 'facebook_page').catch((e: Error) => e)
    expect(err).toBeInstanceOf(SecretEncryptionUnavailableError)
    expect(String((err as Error).message)).not.toContain('EAAG_SHORT_KEY')
  })
})

describe('OAuth state', () => {
  const start = (over: Partial<Parameters<typeof createSocialOAuthState>[0]> = {}) =>
    createSocialOAuthState({
      uid: 'admin-1',
      platform: 'instagram',
      connectionMethod: 'instagram_login',
      ownership: { citySlug: 'antalya', publisherId: null },
      now: NOW,
      secure: true,
      ...over,
    })

  it('kriptografik state + ayrı cookie; Firestore yalnızca hash saklar', async () => {
    const a = await start()
    const b = await start()
    expect(a.state).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a.state).not.toBe(b.state)
    expect(a.cookie.value).not.toBe(a.state)
    const stored = fs.store.get(`socialOAuthStates/${sha(a.state)}`)!
    const raw = JSON.stringify(stored)
    expect(raw).not.toContain(a.state)
    expect(raw).not.toContain(a.cookie.value)
    expect(stored).toMatchObject({ uid: 'admin-1', platform: 'instagram', connectionMethod: 'instagram_login', expiresAt: NOW + OAUTH_STATE_TTL_MS, consumedAt: null })
  })

  it('cookie: HttpOnly, SameSite=Lax, Path=/, üretimde Secure + __Host- ön eki', async () => {
    const a = await start()
    expect(a.cookie.name).toBe(OAUTH_BINDING_COOKIE_SECURE)
    expect(a.cookie.options).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: OAUTH_STATE_TTL_MS / 1000 })
    expect(buildBindingCookie('v', false).name).toBe(OAUTH_BINDING_COOKIE_DEV)
    expect(oauthCookieIsSecure({ NODE_ENV: 'production' })).toBe(true)
    expect(oauthCookieIsSecure({ NODE_ENV: 'development', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' })).toBe(false)
    expect(oauthCookieIsSecure({ NODE_ENV: 'development', NEXT_PUBLIC_SITE_URL: 'https://preview.nahaber.com' })).toBe(true)
  })

  it('geçerli tüketim: başlatan kullanıcı, platform ve sahiplik geri döner', async () => {
    const a = await start()
    const r = await consumeSocialOAuthState({ state: a.state, bindingCookie: a.cookie.value, expectedPlatform: 'instagram', now: NOW + 1000 })
    expect(r).toEqual({ ok: true, uid: 'admin-1', platform: 'instagram', connectionMethod: 'instagram_login', ownership: { citySlug: 'antalya', publisherId: null }, reconnectAccountId: null })
  })

  it('tek kullanım: ikinci tüketim reddedilir', async () => {
    const a = await start()
    const args = { state: a.state, bindingCookie: a.cookie.value, expectedPlatform: 'instagram' as const, now: NOW + 1 }
    expect((await consumeSocialOAuthState(args)).ok).toBe(true)
    expect(await consumeSocialOAuthState(args)).toEqual({ ok: false, code: 'already_used' })
  })

  it('eşzamanlı iki tüketimden yalnızca biri başarılı olur', async () => {
    const a = await start()
    const args = { state: a.state, bindingCookie: a.cookie.value, expectedPlatform: 'instagram' as const, now: NOW + 1 }
    const rs = await Promise.all([consumeSocialOAuthState(args), consumeSocialOAuthState(args), consumeSocialOAuthState(args)])
    expect(rs.filter((r) => r.ok)).toHaveLength(1)
  })

  it('süre tüketimde denetlenir (TTL silmesine güvenilmez) ve kayıt yakılır', async () => {
    const a = await start()
    const late = { state: a.state, bindingCookie: a.cookie.value, expectedPlatform: 'instagram' as const, now: NOW + OAUTH_STATE_TTL_MS }
    expect(await consumeSocialOAuthState(late)).toEqual({ ok: false, code: 'expired' })
    expect(await consumeSocialOAuthState({ ...late, now: NOW + 1 })).toEqual({ ok: false, code: 'already_used' })
  })

  it('platform, cookie ve kullanıcı uyuşmazlıkları reddedilir (deneme state’i yakar)', async () => {
    const p = await start()
    expect(await consumeSocialOAuthState({ state: p.state, bindingCookie: p.cookie.value, expectedPlatform: 'facebook', now: NOW })).toEqual({ ok: false, code: 'platform_mismatch' })

    const c = await start()
    expect(await consumeSocialOAuthState({ state: c.state, bindingCookie: 'başka-tarayıcı', expectedPlatform: 'instagram', now: NOW })).toEqual({ ok: false, code: 'binding_mismatch' })
    expect(await consumeSocialOAuthState({ state: c.state, bindingCookie: c.cookie.value, expectedPlatform: 'instagram', now: NOW })).toEqual({ ok: false, code: 'already_used' })

    const n = await start()
    expect(await consumeSocialOAuthState({ state: n.state, bindingCookie: null, expectedPlatform: 'instagram', now: NOW })).toEqual({ ok: false, code: 'binding_mismatch' })

    const u = await start()
    expect(await consumeSocialOAuthState({ state: u.state, bindingCookie: u.cookie.value, expectedPlatform: 'instagram', expectedUid: 'baska-kullanici', now: NOW })).toEqual({ ok: false, code: 'user_mismatch' })
  })

  it('biçimsiz ve bilinmeyen state', async () => {
    expect(await consumeSocialOAuthState({ state: 'kısa', bindingCookie: 'x', expectedPlatform: 'threads', now: NOW })).toEqual({ ok: false, code: 'invalid' })
    expect(await consumeSocialOAuthState({ state: 'A'.repeat(43), bindingCookie: 'x', expectedPlatform: 'threads', now: NOW })).toEqual({ ok: false, code: 'not_found' })
  })

  it('legacy yöntem, platforma uymayan yöntem ve sahipsiz kapsam ile state açılamaz', async () => {
    await expect(start({ connectionMethod: 'legacy' as never })).rejects.toThrow()
    await expect(start({ platform: 'threads', connectionMethod: 'instagram_login' })).rejects.toThrow()
    await expect(start({ ownership: { citySlug: null, publisherId: null } })).rejects.toThrow()
  })
})
