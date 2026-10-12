/**
 * Long-lived token renewal (runs inside the shared 5-minute automation tick).
 *
 * Official refresh endpoints (Meta docs):
 *   Instagram API with Instagram Login: GET graph.instagram.com/refresh_access_token
 *     ?grant_type=ig_refresh_token — token ≥ 24 h old, unexpired,
 *     instagram_business_basic; new token valid 60 days.
 *   Threads: GET graph.threads.net/refresh_access_token?grant_type=th_refresh_token
 *     — token ≥ 24 h old, unexpired, threads_basic; valid 60 days.
 *   Facebook Page tokens from a long-lived user token have no fixed expiry →
 *     nothing to refresh (an expiring page token needs a reconnect).
 *
 * Safety: one account at a time under a transactional lease; the new token is
 * encrypted before the write and stored with the expiry in ONE transaction;
 * token values never reach logs, audit or the browser. 190 → needs_reauth.
 * Failures back off 6 h and leave a reconnect warning; an expired token turns
 * the account to needs_reauth (the panel shows "yeniden bağlayın").
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { INSTAGRAM_REFRESH_TOKEN_URL, THREADS_REFRESH_TOKEN_URL } from '../graphConfig'
import { metaRequest, query } from './connect/metaHttp'
import { buildEncryptedSecretRecord, decryptAccessToken, readSecretRecord } from './secretStore'
import { parseSocialAccount, type SocialAccount } from './types'
import { writeSocialAudit } from './audit'

export const REFRESH_WINDOW_MS = 15 * 86_400_000
export const MIN_TOKEN_AGE_MS = 24 * 3_600_000
export const RETRY_BACKOFF_MS = 6 * 3_600_000
const LEASE_MS = 2 * 60_000
const MAX_PER_TICK = 3

export interface RefreshReport {
  refreshed: number
  failed: number
  expired: number
  skipped: number
  /** Accounts the bounded queries found (observability; no token values). */
  expiredFound?: number
  dueFound?: number
}

type RefreshDoc = SocialAccount & {
  tokenRefreshedAt?: number | null
  lastRefreshAttemptAt?: number | null
  refreshLeaseUntil?: number | null
}

function refreshUrl(a: SocialAccount): { url: string; grant: string } | null {
  if (a.connectionMethod === 'instagram_login') return { url: INSTAGRAM_REFRESH_TOKEN_URL, grant: 'ig_refresh_token' }
  if (a.connectionMethod === 'threads_oauth') return { url: THREADS_REFRESH_TOKEN_URL, grant: 'th_refresh_token' }
  return null
}

function col() {
  return getAdminFirestore().collection(Collections.SOCIAL_ACCOUNTS)
}

export async function refreshDueTokens(now: number): Promise<RefreshReport> {
  const report: RefreshReport = { refreshed: 0, failed: 0, expired: 0, skipped: 0, expiredFound: 0, dueFound: 0 }
  const db = getAdminFirestore()

  // 1) Already expired but still marked active → needs_reauth (bounded).
  const expired = await col().where('tokenExpiresAt', '<=', now).limit(10).get()
  report.expiredFound = expired.docs.length
  for (const d of expired.docs) {
    const a = parseSocialAccount(d.id, d.data())
    if (!a || a.status !== 'active') continue
    await col().doc(d.id).update({ status: 'needs_reauth', statusReason: 'Erişim anahtarının süresi doldu — yeniden bağlayın', updatedAt: now, updatedBy: 'system:token-refresh' })
    report.expired++
  }

  // 2) Expiring within the window → refresh (≤ MAX_PER_TICK per tick).
  const due = await col().where('tokenExpiresAt', '>', now).where('tokenExpiresAt', '<=', now + REFRESH_WINDOW_MS).limit(20).get()
  report.dueFound = due.docs.length
  let done = 0
  for (const d of due.docs) {
    if (done >= MAX_PER_TICK) break
    const raw = d.data() as RefreshDoc
    const a = parseSocialAccount(d.id, raw)
    if (!a || a.status !== 'active' || !refreshUrl(a)) continue
    const issuedAt = Math.max(raw.tokenRefreshedAt ?? 0, a.connectedAt ?? 0)
    if (now - issuedAt < MIN_TOKEN_AGE_MS || (raw.lastRefreshAttemptAt ?? 0) > now - RETRY_BACKOFF_MS) {
      report.skipped++
      continue
    }
    // Lease: only one worker refreshes an account at a time.
    const ref = col().doc(d.id)
    const leased = await db.runTransaction(async (tx) => {
      const s = await tx.get(ref)
      const cur = s.data() as RefreshDoc | undefined
      if (!cur || (cur.refreshLeaseUntil ?? 0) > now) return false
      tx.update(ref, { refreshLeaseUntil: now + LEASE_MS, lastRefreshAttemptAt: now })
      return true
    })
    if (!leased) {
      report.skipped++
      continue
    }
    done++
    const ok = await refreshOne(a, now)
    if (ok) report.refreshed++
    else report.failed++
  }
  return report
}

async function refreshOne(a: SocialAccount, now: number): Promise<boolean> {
  const ref = col().doc(a.id)
  const target = refreshUrl(a)!
  const secret = await readSecretRecord(a.id).catch(() => null)
  const token = secret && secret.kind === 'encrypted' ? await decryptAccessToken(secret) : null
  if (!secret || secret.kind !== 'encrypted' || !token) {
    await ref.update({ refreshLeaseUntil: null, tokenWarning: 'Erişim anahtarı okunamadı — yeniden bağlayın' })
    await audit(a.id, 'secret_unreadable')
    return false
  }
  const r = await metaRequest<{ access_token?: string; expires_in?: number }>(
    `${a.platform}.refresh_token`,
    query(target.url, { grant_type: target.grant, access_token: token }),
  )
  if (!r.ok || !r.data.access_token || typeof r.data.expires_in !== 'number' || r.data.expires_in <= 0) {
    const code = r.ok ? 'bad_response' : String(r.error.code ?? r.error.type ?? r.error.status)
    const revoked = !r.ok && r.error.code === 190
    await ref.update({
      refreshLeaseUntil: null,
      tokenWarning: revoked ? null : 'Erişim anahtarı yenilenemedi — süre dolmadan yeniden bağlayın',
      ...(revoked ? { status: 'needs_reauth', statusReason: 'Platform erişimi iptal etti — yeniden bağlayın', updatedAt: now, updatedBy: 'system:token-refresh' } : {}),
    })
    await audit(a.id, revoked ? 'revoked' : `failed:${code}`)
    return false
  }
  const newSecret = await buildEncryptedSecretRecord(r.data.access_token, secret.tokenType, now)
  const expiresAt = now + r.data.expires_in * 1000
  const db = getAdminFirestore()
  await db.runTransaction(async (tx) => {
    tx.set(db.collection(Collections.SOCIAL_ACCOUNT_SECRETS).doc(a.id), { ...newSecret })
    tx.update(ref, { tokenExpiresAt: expiresAt, tokenExpiryVerified: true, tokenRefreshedAt: now, refreshLeaseUntil: null, tokenWarning: null, updatedAt: now })
  })
  await audit(a.id, 'refreshed', expiresAt)
  return true
}

async function audit(accountId: string, result: string, expiresAt?: number) {
  await writeSocialAudit({
    actorId: 'system:token-refresh',
    actorType: 'SYSTEM',
    action: 'social.token.refresh',
    entityType: 'socialAccount',
    entityId: accountId,
    meta: { result, ...(expiresAt ? { tokenExpiresAt: expiresAt } : {}) },
  })
}
