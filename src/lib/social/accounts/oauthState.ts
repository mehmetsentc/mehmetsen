/**
 * OAuth state for social account connections (not wired to any platform yet).
 *
 * start:
 *   - `state`   = 32 random bytes (base64url), sent to the platform
 *   - `binding` = 32 random bytes (base64url), set as an HttpOnly cookie
 *   - Firestore `socialOAuthStates/{sha256(state)}` stores only hashes plus
 *     uid, platform, connection method, ownership scope and expiry
 * callback (consumeSocialOAuthState):
 *   - one transaction: must exist, not consumed, not expired (checked HERE —
 *     Firestore TTL deletion is cleanup only), platform matches, cookie hash
 *     matches; the record is marked consumed on EVERY attempt (single use,
 *     even on failure)
 *   - the caller then re-checks the user's CURRENT authorization
 *     (recheckSocialAccountManager) before storing anything
 */
import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  ALLOWED_CONNECTION_METHODS,
  isSocialAccountPlatform,
  type SocialAccountOwnership,
  type SocialAccountPlatform,
  type SocialConnectionMethod,
} from './types'

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
export const OAUTH_BINDING_COOKIE_SECURE = '__Host-nh_social_oauth'
export const OAUTH_BINDING_COOKIE_DEV = 'nh_social_oauth'

export type OAuthConnectionMethod = Exclude<SocialConnectionMethod, 'legacy'>

export interface OAuthBindingCookie {
  name: string
  value: string
  options: {
    httpOnly: true
    secure: boolean
    sameSite: 'lax'
    path: '/'
    maxAge: number
  }
}

export interface CreatedOAuthState {
  state: string
  cookie: OAuthBindingCookie
  expiresAt: number
}

export type ConsumeOAuthStateResult =
  | {
      ok: true
      uid: string
      platform: SocialAccountPlatform
      connectionMethod: OAuthConnectionMethod
      ownership: SocialAccountOwnership
      /** Set when the flow re-connects an existing account (its id). */
      reconnectAccountId: string | null
    }
  | {
      ok: false
      code:
        | 'invalid'
        | 'not_found'
        | 'already_used'
        | 'expired'
        | 'platform_mismatch'
        | 'binding_mismatch'
        | 'user_mismatch'
    }

const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex')
const random = () => randomBytes(32).toString('base64url')
const STATE_RE = /^[A-Za-z0-9_-]{43}$/

/**
 * Secure cookies in production / https; plain `nh_social_oauth` only for
 * http://localhost development. SameSite=Lax so the cookie survives the
 * top-level redirect back from the platform's consent screen.
 */
export function oauthCookieIsSecure(env: { NODE_ENV?: string; NEXT_PUBLIC_SITE_URL?: string } = process.env): boolean {
  if (env.NODE_ENV === 'production') return true
  return (env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://')
}

export function buildBindingCookie(value: string, secure: boolean, ttlMs = OAUTH_STATE_TTL_MS): OAuthBindingCookie {
  return {
    name: secure ? OAUTH_BINDING_COOKIE_SECURE : OAUTH_BINDING_COOKIE_DEV,
    value,
    options: { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: Math.floor(ttlMs / 1000) },
  }
}

function statesCol() {
  return getAdminFirestore().collection(Collections.SOCIAL_OAUTH_STATES)
}

export async function createSocialOAuthState(input: {
  uid: string
  platform: SocialAccountPlatform
  connectionMethod: OAuthConnectionMethod
  ownership: SocialAccountOwnership
  reconnectAccountId?: string | null
  now?: number
  secure?: boolean
}): Promise<CreatedOAuthState> {
  const uid = input.uid?.trim()
  if (!uid) throw new Error('OAuth state: uid gerekli')
  if (!isSocialAccountPlatform(input.platform)) throw new Error('OAuth state: platform geçersiz')
  if (!ALLOWED_CONNECTION_METHODS[input.platform].includes(input.connectionMethod) || input.connectionMethod === ('legacy' as SocialConnectionMethod)) {
    throw new Error('OAuth state: bağlantı yöntemi platforma uygun değil')
  }
  const ownership: SocialAccountOwnership = {
    citySlug: input.ownership.citySlug?.trim() || null,
    publisherId: input.ownership.publisherId?.trim() || null,
  }
  if (!ownership.citySlug && !ownership.publisherId) throw new Error('OAuth state: sahiplik kapsamı gerekli')

  const now = input.now ?? Date.now()
  const state = random()
  const binding = random()
  const expiresAt = now + OAUTH_STATE_TTL_MS

  await statesCol().doc(sha256(state)).create({
    uid,
    platform: input.platform,
    connectionMethod: input.connectionMethod,
    ownership,
    reconnectAccountId: input.reconnectAccountId ?? null,
    bindingHash: sha256(binding),
    createdAt: now,
    expiresAt,
    consumedAt: null,
    /** Optional Firestore TTL policy field — cleanup only, never a security check. */
    ttlDeleteAt: new Date(expiresAt + 24 * 60 * 60 * 1000),
  })

  return {
    state,
    cookie: buildBindingCookie(binding, input.secure ?? oauthCookieIsSecure()),
    expiresAt,
  }
}

function hashesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb)
}

export async function consumeSocialOAuthState(input: {
  state: string | null | undefined
  bindingCookie: string | null | undefined
  expectedPlatform: SocialAccountPlatform
  /** When the callback knows the signed-in user, it must be the initiator. */
  expectedUid?: string | null
  now?: number
}): Promise<ConsumeOAuthStateResult> {
  const state = typeof input.state === 'string' ? input.state.trim() : ''
  if (!STATE_RE.test(state)) return { ok: false, code: 'invalid' }
  const binding = typeof input.bindingCookie === 'string' ? input.bindingCookie.trim() : ''
  const now = input.now ?? Date.now()
  const db = getAdminFirestore()
  const ref = statesCol().doc(sha256(state))

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return { ok: false, code: 'not_found' } as const
    const d = (snap.data() ?? {}) as Record<string, unknown>
    if (d.consumedAt !== null && d.consumedAt !== undefined) return { ok: false, code: 'already_used' } as const

    // Single use: consume before evaluating anything else.
    tx.update(ref, { consumedAt: now })

    const expiresAt = typeof d.expiresAt === 'number' ? d.expiresAt : 0
    if (!(expiresAt > now)) return { ok: false, code: 'expired' } as const
    if (d.platform !== input.expectedPlatform) return { ok: false, code: 'platform_mismatch' } as const
    const storedBinding = typeof d.bindingHash === 'string' ? d.bindingHash : ''
    if (!binding || !hashesEqual(storedBinding, sha256(binding))) {
      return { ok: false, code: 'binding_mismatch' } as const
    }
    const method = d.connectionMethod as OAuthConnectionMethod
    if (!ALLOWED_CONNECTION_METHODS[input.expectedPlatform].includes(method) || (method as string) === 'legacy') {
      return { ok: false, code: 'invalid' } as const
    }
    const own = (d.ownership ?? {}) as Record<string, unknown>
    const uid = typeof d.uid === 'string' ? d.uid : ''
    if (!uid) return { ok: false, code: 'invalid' } as const
    if (input.expectedUid != null && input.expectedUid !== uid) {
      return { ok: false, code: 'user_mismatch' } as const
    }
    return {
      ok: true,
      uid,
      platform: input.expectedPlatform,
      connectionMethod: method,
      ownership: {
        citySlug: typeof own.citySlug === 'string' ? own.citySlug : null,
        publisherId: typeof own.publisherId === 'string' ? own.publisherId : null,
      },
      reconnectAccountId: typeof d.reconnectAccountId === 'string' ? d.reconnectAccountId : null,
    } as const
  })
}
