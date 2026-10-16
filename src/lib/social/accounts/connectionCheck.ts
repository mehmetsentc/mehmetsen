/**
 * Read-only connection check («Bağlantıyı kontrol et») and the shared rule for
 * a platform-rejected token.
 *
 * - The check makes ONE read call with the account's own stored token
 *   (Instagram Login: graph.instagram.com/me, Threads: graph.threads.net/me,
 *   Facebook Page: graph.facebook.com/{pageId}). Nothing is published.
 * - Meta 190 / 102 (invalid / expired / revoked token) → `needs_reauth`. The
 *   account document keeps its id, owner, rules, history and ledger; only the
 *   status changes, and only a new platform login («Platform girişiyle yeniden
 *   bağla») can make it active again.
 * - Token values never reach logs, audit or the response.
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FACEBOOK_GRAPH_BASE, INSTAGRAM_LOGIN_GRAPH_BASE, THREADS_GRAPH_BASE } from '../graphConfig'
import { metaRequest, query } from './connect/metaHttp'
import { decryptAccessToken, readSecretRecord } from './secretStore'
import { loadSocialAccount } from './accountStore'
import { writeSocialAudit } from './audit'
import type { SocialAccount } from './types'
import { youtubeClientCredentials } from './connect/oauthConfig'
import { fetchMyYouTubeChannels, GoogleRefreshRejectedError, refreshGoogleAccessToken } from './connect/googleOAuth'
import { MetaCallError } from './connect/metaHttp'

/** Meta: access token invalid / expired / revoked / session invalidated. */
export const TOKEN_REJECTED_CODES = new Set([190, 102])

export const REAUTH_REASON = 'Platform erişim anahtarını reddetti — «Platform girişiyle yeniden bağla» gerekli'

/**
 * Mark an OAuth account `needs_reauth` after the platform rejected its token.
 * Transactional; idempotent; never touches legacy or already-disabled records,
 * ownership, rules, history or the publish ledger.
 */
export async function markTokenRejected(accountId: string, input: { by: string; now: number; source: string; code: number; subcode: number | null }): Promise<boolean> {
  const db = getAdminFirestore()
  const ref = db.collection(Collections.SOCIAL_ACCOUNTS).doc(accountId)
  const changed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return false
    const d = snap.data() as Partial<SocialAccount>
    if (d.connectionMethod === 'legacy' || d.status === 'disabled' || d.status === 'needs_reauth') return false
    tx.update(ref, { status: 'needs_reauth', statusReason: REAUTH_REASON, updatedAt: input.now, updatedBy: input.by })
    return true
  })
  if (changed) {
    await writeSocialAudit({
      actorId: input.by,
      action: 'social.account.status',
      entityType: 'socialAccount',
      entityId: accountId,
      before: null,
      after: { status: 'needs_reauth' },
      meta: { source: input.source, metaCode: input.code, metaSubcode: input.subcode },
    })
  }
  return changed
}

export type ConnectionCheck =
  | { state: 'ok'; checkedAt: number }
  | { state: 'token_rejected'; code: number; subcode: number | null; statusChanged: boolean }
  | { state: 'unavailable'; reason: 'legacy' | 'no_secret' | 'network' | 'platform_error'; httpStatus?: number; code?: number | null }

function checkUrl(a: SocialAccount, token: string): string | null {
  if (a.platform === 'instagram' && a.connectionMethod === 'instagram_login') return query(`${INSTAGRAM_LOGIN_GRAPH_BASE}/me`, { fields: 'id', access_token: token })
  if (a.platform === 'threads') return query(`${THREADS_GRAPH_BASE}/me`, { fields: 'id', access_token: token })
  if (a.platform === 'facebook' && a.connectionMethod === 'facebook_login') return query(`${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(a.facebook.pageId)}`, { fields: 'id', access_token: token })
  return null
}

export async function checkAccountConnection(accountId: string, input: { by: string; now: number }): Promise<ConnectionCheck> {
  const loaded = await loadSocialAccount(accountId)
  if (loaded.state !== 'ok') return { state: 'unavailable', reason: 'no_secret' }
  const a = loaded.account
  if (a.connectionMethod === 'legacy') return { state: 'unavailable', reason: 'legacy' }
  const sec = await readSecretRecord(accountId).catch(() => null)
  if (!sec || sec.kind !== 'encrypted') return { state: 'unavailable', reason: 'no_secret' }
  let token: string | null = null
  try {
    token = await decryptAccessToken(sec)
  } catch {
    token = null
  }
  if (!token) return { state: 'unavailable', reason: 'no_secret' }
  if (a.platform === 'youtube') return checkYouTube(accountId, a.youtube.channelId, token, input)
  const url = checkUrl(a, token)
  if (!url) return { state: 'unavailable', reason: 'legacy' }
  const r = await metaRequest<{ id?: string }>(`${a.platform}.connection_check`, url)
  if (r.ok) {
    await getAdminFirestore().collection(Collections.SOCIAL_ACCOUNTS).doc(accountId).update({ connectionCheckedAt: input.now }).catch(() => undefined)
    return { state: 'ok', checkedAt: input.now }
  }
  if (r.error.code !== null && TOKEN_REJECTED_CODES.has(r.error.code)) {
    const statusChanged = await markTokenRejected(accountId, { by: input.by, now: input.now, source: 'connection_check', code: r.error.code, subcode: r.error.subcode })
    return { state: 'token_rejected', code: r.error.code, subcode: r.error.subcode, statusChanged }
  }
  if (r.error.status === 0) return { state: 'unavailable', reason: 'network' }
  return { state: 'unavailable', reason: 'platform_error', httpStatus: r.error.status, code: r.error.code }
}

/**
 * YouTube: refresh token → access token → `channels?mine=true` must still be
 * the connected channel. invalid_grant (revoked / expired) → needs_reauth.
 */
async function checkYouTube(
  accountId: string,
  channelId: string,
  refreshToken: string,
  input: { by: string; now: number },
): Promise<ConnectionCheck> {
  const creds = youtubeClientCredentials()
  if (!creds) return { state: 'unavailable', reason: 'platform_error' }
  try {
    const { accessToken } = await refreshGoogleAccessToken(creds, refreshToken)
    const channels = await fetchMyYouTubeChannels(accessToken)
    if (!channels.some((c) => c.channelId === channelId)) return { state: 'unavailable', reason: 'platform_error' }
  } catch (err) {
    if (err instanceof GoogleRefreshRejectedError) {
      const statusChanged = await markTokenRejected(accountId, { by: input.by, now: input.now, source: 'connection_check', code: 401, subcode: null })
      return { state: 'token_rejected', code: 401, subcode: null, statusChanged }
    }
    if (err instanceof MetaCallError && err.info.status === 0) return { state: 'unavailable', reason: 'network' }
    return { state: 'unavailable', reason: 'platform_error', httpStatus: err instanceof MetaCallError ? err.info.status : undefined }
  }
  await getAdminFirestore().collection(Collections.SOCIAL_ACCOUNTS).doc(accountId).update({ connectionCheckedAt: input.now }).catch(() => undefined)
  return { state: 'ok', checkedAt: input.now }
}
