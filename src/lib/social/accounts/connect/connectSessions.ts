/**
 * Short-lived server-side Facebook page-selection session.
 *
 * After the Facebook callback, the long-lived USER token is stored encrypted
 * here (never sent to the browser) together with the eligible page list
 * (id/name/tasks only). The browser receives only a session id (URL) and a
 * separate HttpOnly binding cookie. Selection requires: same NaHaber user,
 * same browser (cookie), not expired, page in THIS session's eligible list.
 * Successful selection consumes the session atomically (single use).
 */
import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { decryptSecret, encryptSecret, hasSecretEncryptionKey } from '@/lib/crypto/secretCrypto'
import type { SocialAccountOwnership } from '../types'
import { SecretEncryptionUnavailableError } from '../secretStore'
import type { FacebookPageCandidate } from './facebookLogin'

export const SELECT_SESSION_TTL_MS = 10 * 60 * 1000
export const SELECT_COOKIE_SECURE = '__Host-nh_social_select'
export const SELECT_COOKIE_DEV = 'nh_social_select'
const SESSION_RE = /^[A-Za-z0-9_-]{43}$/

const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex')

function sessionsCol() {
  return getAdminFirestore().collection(Collections.SOCIAL_CONNECT_SESSIONS)
}

export interface FacebookSelectSessionInput {
  uid: string
  ownership: SocialAccountOwnership
  reconnectAccountId: string | null
  userToken: string
  userTokenExpiresAt: number | null
  grantedPermissions: string[]
  pages: FacebookPageCandidate[]
  pagesTruncated: boolean
  now: number
}

export async function createFacebookSelectSession(
  input: FacebookSelectSessionInput,
): Promise<{ sessionId: string; binding: string; expiresAt: number }> {
  if (!hasSecretEncryptionKey()) throw new SecretEncryptionUnavailableError()
  const sessionId = randomBytes(32).toString('base64url')
  const binding = randomBytes(32).toString('base64url')
  const expiresAt = input.now + SELECT_SESSION_TTL_MS
  await sessionsCol().doc(sha256(sessionId)).create({
    purpose: 'facebook_page_select',
    uid: input.uid,
    ownership: input.ownership,
    reconnectAccountId: input.reconnectAccountId,
    userTokenEncrypted: await encryptSecret(input.userToken),
    userTokenExpiresAt: input.userTokenExpiresAt,
    grantedPermissions: input.grantedPermissions,
    pages: input.pages.slice(0, 1000).map((p) => ({ id: p.id, name: p.name, tasks: p.tasks, eligible: p.eligible })),
    pagesTruncated: input.pagesTruncated,
    bindingHash: sha256(binding),
    createdAt: input.now,
    expiresAt,
    consumedAt: null,
    ttlDeleteAt: new Date(expiresAt + 24 * 60 * 60 * 1000),
  })
  return { sessionId, binding, expiresAt }
}

export type SelectSessionError =
  | 'invalid'
  | 'not_found'
  | 'expired'
  | 'already_used'
  | 'binding_mismatch'
  | 'user_mismatch'
  | 'page_not_in_session'
  | 'page_not_eligible'

interface StoredSession {
  uid: string
  ownership: SocialAccountOwnership
  reconnectAccountId: string | null
  userTokenEncrypted: string
  grantedPermissions: string[]
  pages: Array<{ id: string; name: string; tasks: string[]; eligible: boolean }>
  pagesTruncated: boolean
  bindingHash: string
  expiresAt: number
  consumedAt: number | null
}

function hashEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ab.length > 0 && ab.length === bb.length && timingSafeEqual(ab, bb)
}

function check(
  d: StoredSession | null,
  input: { binding: string | null | undefined; uid: string; now: number },
): SelectSessionError | null {
  if (!d) return 'not_found'
  if (d.consumedAt !== null && d.consumedAt !== undefined) return 'already_used'
  if (!(d.expiresAt > input.now)) return 'expired'
  if (!input.binding || !hashEq(d.bindingHash, sha256(input.binding))) return 'binding_mismatch'
  if (d.uid !== input.uid) return 'user_mismatch'
  return null
}

/** Page list (metadata only) for the browser, paginated. */
export async function readFacebookSelectSession(input: {
  sessionId: string | null | undefined
  binding: string | null | undefined
  uid: string
  now: number
  offset: number
  limit: number
}): Promise<
  | {
      ok: true
      pages: Array<{ id: string; name: string; eligible: boolean }>
      total: number
      nextOffset: number | null
      truncated: boolean
      expiresAt: number
      reconnect: boolean
    }
  | { ok: false; code: SelectSessionError }
> {
  const sid = typeof input.sessionId === 'string' ? input.sessionId.trim() : ''
  if (!SESSION_RE.test(sid)) return { ok: false, code: 'invalid' }
  const snap = await sessionsCol().doc(sha256(sid)).get()
  const d = snap.exists ? (snap.data() as StoredSession) : null
  const err = check(d, input)
  if (err || !d) return { ok: false, code: err ?? 'not_found' }
  const offset = Math.max(0, Math.floor(input.offset) || 0)
  const limit = Math.min(50, Math.max(1, Math.floor(input.limit) || 25))
  const slice = d.pages.slice(offset, offset + limit)
  return {
    ok: true,
    pages: slice.map((p) => ({ id: p.id, name: p.name, eligible: p.eligible })),
    total: d.pages.length,
    nextOffset: offset + limit < d.pages.length ? offset + limit : null,
    truncated: d.pagesTruncated === true,
    expiresAt: d.expiresAt,
    reconnect: !!d.reconnectAccountId,
  }
}

/**
 * Validate and consume the session for one page. The page must be in THIS
 * session's list and eligible; otherwise nothing is consumed.
 */
export async function consumeFacebookSelectSession(input: {
  sessionId: string | null | undefined
  binding: string | null | undefined
  uid: string
  pageId: string
  now: number
}): Promise<
  | {
      ok: true
      userToken: string
      ownership: SocialAccountOwnership
      reconnectAccountId: string | null
      grantedPermissions: string[]
      page: { id: string; name: string }
    }
  | { ok: false; code: SelectSessionError }
> {
  const sid = typeof input.sessionId === 'string' ? input.sessionId.trim() : ''
  if (!SESSION_RE.test(sid) || !/^[0-9]{1,30}$/.test(input.pageId)) return { ok: false, code: 'invalid' }
  const db = getAdminFirestore()
  const ref = sessionsCol().doc(sha256(sid))
  const r = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const d = snap.exists ? (snap.data() as StoredSession) : null
    const err = check(d, input)
    if (err || !d) return { ok: false as const, code: err ?? ('not_found' as const) }
    const page = d.pages.find((p) => p.id === input.pageId)
    if (!page) return { ok: false as const, code: 'page_not_in_session' as const }
    if (!page.eligible) return { ok: false as const, code: 'page_not_eligible' as const }
    tx.update(ref, { consumedAt: input.now, selectedPageId: page.id, userTokenEncrypted: null })
    return { ok: true as const, d, page }
  })
  if (!r.ok) return r
  let userToken: string
  try {
    userToken = await decryptSecret(r.d.userTokenEncrypted)
  } catch {
    return { ok: false, code: 'invalid' }
  }
  return {
    ok: true,
    userToken,
    ownership: r.d.ownership,
    reconnectAccountId: r.d.reconnectAccountId ?? null,
    grantedPermissions: r.d.grantedPermissions ?? [],
    page: { id: r.page.id, name: r.page.name },
  }
}
