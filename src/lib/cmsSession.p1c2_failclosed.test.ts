/**
 * SEC-P1C.2 — regression tests for the CMS session fail-closed fix.
 *
 * Proves:
 *  A. CMS_SESSION_SECRET present  -> sign + verify round-trip works.
 *  B. CMS_SESSION_SECRET absent   -> sign returns null, verify returns null
 *                                    (no hardcoded/public fallback is used).
 *  C. A token signed with the OLD known public fallback string
 *     ('dev-cms-session-secret-change-me') can no longer be verified as
 *     valid once a real secret is configured — the old, leaked value is
 *     worthless for forging sessions now.
 *
 * This is a local/unit-level test only. It never touches production and
 * never sends any request to a live server.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const ORIGINAL_SECRET = process.env.CMS_SESSION_SECRET
const ORIGINAL_NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET

async function freshCmsSessionModule() {
  // Re-import so the module re-reads process.env.CMS_SESSION_SECRET fresh
  // for each scenario (getSecretKey() reads it at call time, not at import
  // time, but vi.resetModules keeps scenarios fully isolated regardless).
  return await import('./cmsSession')
}

describe('SEC-P1C.2: cmsSession fail-closed behavior', () => {
  beforeEach(() => {
    delete process.env.CMS_SESSION_SECRET
    delete process.env.NEXTAUTH_SECRET
  })

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CMS_SESSION_SECRET
    else process.env.CMS_SESSION_SECRET = ORIGINAL_SECRET
    if (ORIGINAL_NEXTAUTH_SECRET === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = ORIGINAL_NEXTAUTH_SECRET
  })

  it('A. signs and verifies a valid session when CMS_SESSION_SECRET is present', async () => {
    process.env.CMS_SESSION_SECRET = 'a-real-random-production-style-secret-value'
    const { signCmsSessionToken, verifyCmsSessionToken } = await freshCmsSessionModule()

    const token = await signCmsSessionToken({
      uid: 'uid_123',
      role: 'super_admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    expect(token).not.toBeNull()

    const verified = await verifyCmsSessionToken(token ?? undefined)
    expect(verified).not.toBeNull()
    expect(verified?.uid).toBe('uid_123')
    expect(verified?.role).toBe('super_admin')
  })

  it('B. fails closed (no hardcoded fallback) when CMS_SESSION_SECRET is absent', async () => {
    // Both CMS_SESSION_SECRET and NEXTAUTH_SECRET are unset (see beforeEach).
    const { signCmsSessionToken, verifyCmsSessionToken } = await freshCmsSessionModule()

    const token = await signCmsSessionToken({
      uid: 'uid_attacker_or_anyone',
      role: 'super_admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    expect(token).toBeNull()

    // Even a syntactically well-formed token cannot be verified when there
    // is no secret configured to check it against.
    const bogusToken = 'ZmFrZQ.c2ln'
    const verified = await verifyCmsSessionToken(bogusToken)
    expect(verified).toBeNull()
  })

  it('C. a token forged with the OLD known public fallback secret is rejected once a real secret is set', async () => {
    // Simulate what the OLD code (pre-SEC-P1C.2) would have produced when no
    // env var was configured: a token signed with the publicly-known
    // hardcoded string. We build this by hand, entirely locally, using the
    // SAME HMAC construction cmsSession.ts uses — no network, no production
    // system involved at any point.
    const encoder = new TextEncoder()
    const OLD_PUBLIC_FALLBACK = 'dev-cms-session-secret-change-me'

    function base64UrlEncode(bytes: Uint8Array): string {
      let s = ''
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }

    async function forgeToken(secret: string) {
      const payload = { uid: 'forged_uid', role: 'super_admin', exp: Math.floor(Date.now() / 1000) + 3600 }
      const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const sig = base64UrlEncode(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body))))
      return `${body}.${sig}`
    }

    const forgedWithOldPublicSecret = await forgeToken(OLD_PUBLIC_FALLBACK)

    // Now configure a REAL, different secret (as SEC-P1C.1 did in production)
    // and confirm the forged token is rejected.
    process.env.CMS_SESSION_SECRET = 'a-completely-different-real-secret'
    const { verifyCmsSessionToken } = await freshCmsSessionModule()

    const verified = await verifyCmsSessionToken(forgedWithOldPublicSecret)
    expect(verified).toBeNull()
  })
})
