/**
 * Gmail Service — server-only.
 * Handles Firestore token storage/retrieval and wraps gmail/client.ts.
 *
 * Security: both refresh and access tokens are AES-256-GCM encrypted at rest.
 * On 401 from Gmail API, service force-refreshes once before re-throwing.
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { encrypt, decrypt } from '@/lib/gmail/crypto'
import { refreshAccessToken } from '@/lib/gmail/oauth'
import { listInboxMessages, getMessage, getInboxLabelStats, markMessageRead, markMessageUnread, trashMessage as clientTrash, archiveMessage as clientArchive, setStarred as clientSetStarred, sendEmail, getMessageHeaders, type SendEmailParams } from '@/lib/gmail/client'
import { hasGmailModifyScope } from '@/lib/gmail/scopes'
import { GmailError, normalizeGmailError } from '@/lib/gmail/errors'
import type { GmailIntegration, GmailMessageSummary, GmailMessageDetail } from '@/lib/gmail/types'

const INTEGRATION_DOC = 'gmail_bilgi'
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000 // refresh 5 min before expiry

// ── Firestore helpers ─────────────────────────────────────────────────────

export async function getIntegration(): Promise<GmailIntegration | null> {
  const db = getAdminFirestore()
  const snap = await db.collection(Collections.INTEGRATIONS).doc(INTEGRATION_DOC).get()
  if (!snap.exists) return null
  return snap.data() as GmailIntegration
}

export async function saveIntegration(data: GmailIntegration): Promise<void> {
  const db = getAdminFirestore()
  await db.collection(Collections.INTEGRATIONS).doc(INTEGRATION_DOC).set(data)
}

export async function deleteIntegration(): Promise<void> {
  const db = getAdminFirestore()
  await db.collection(Collections.INTEGRATIONS).doc(INTEGRATION_DOC).delete()
}

// ── Token management ──────────────────────────────────────────────────────

/**
 * Decrypt access token from integration document.
 * Supports new encryptedAccessToken field and legacy plaintext accessToken.
 */
async function decryptAccessToken(integration: GmailIntegration): Promise<string> {
  if (integration.encryptedAccessToken) {
    return decrypt(integration.encryptedAccessToken)
  }
  // Legacy: plaintext access token stored before encryption was added
  if (integration.accessToken) {
    return integration.accessToken
  }
  throw new GmailError('RECONNECT_REQUIRED', { detail: 'no_access_token_field' })
}

/**
 * Force a token refresh using the stored encrypted refresh token.
 * Persists the new encrypted access token to Firestore.
 * Returns the plaintext new access token for immediate use.
 */
async function forceTokenRefresh(integration: GmailIntegration): Promise<string> {
  const refreshToken = await decrypt(integration.encryptedRefreshToken)
  const { accessToken, expiresAt, scope } = await refreshAccessToken(refreshToken)
  const encryptedAccessToken = await encrypt(accessToken)
  const db = getAdminFirestore()
  await db.collection(Collections.INTEGRATIONS).doc(INTEGRATION_DOC).update({
    encryptedAccessToken,
    expiresAt,
    ...(scope ? { scope } : {}),
  })
  return accessToken
}

/**
 * Get a valid plaintext access token, refreshing if within buffer of expiry.
 */
export async function getValidAccessToken(): Promise<string> {
  const integration = await getIntegration()
  if (!integration) throw new GmailError('NOT_CONNECTED')

  const needsRefresh = Date.now() >= integration.expiresAt - TOKEN_REFRESH_BUFFER_MS
  if (!needsRefresh) return decryptAccessToken(integration)

  return forceTokenRefresh(integration)
}

/**
 * Wraps a Gmail API call with one automatic retry on 401/RECONNECT.
 * If the first call returns a reconnect error, forces a token refresh
 * and retries once. Throws on second failure or non-recoverable errors.
 */
async function withRetryOn401<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getValidAccessToken()
  try {
    return await fn(token)
  } catch (err) {
    const normalized = normalizeGmailError(err)
    if (normalized.code === 'RECONNECT_REQUIRED' || normalized.code === 'INVALID_GRANT') {
      // Force a fresh refresh and retry once
      const integration = await getIntegration()
      if (!integration) throw normalized
      try {
        const freshToken = await forceTokenRefresh(integration)
        return await fn(freshToken)
      } catch (refreshErr) {
        throw normalizeGmailError(refreshErr)
      }
    }
    throw normalized
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export async function saveTokens(params: {
  accessToken: string
  refreshToken: string  // plaintext — will be encrypted here
  expiresAt: number
  scope: string
  accountEmail: string
  connectedBy: string
}): Promise<void> {
  const [encryptedRefreshToken, encryptedAccessToken] = await Promise.all([
    encrypt(params.refreshToken),
    encrypt(params.accessToken),
  ])
  const data: GmailIntegration = {
    connectedAt: Date.now(),
    connectedBy: params.connectedBy,
    accountEmail: params.accountEmail,
    encryptedRefreshToken,
    encryptedAccessToken,
    // do NOT store plaintext accessToken
    expiresAt: params.expiresAt,
    scope: params.scope,
  }
  await saveIntegration(data)
}

export async function listMessages(maxResults = 20, pageToken?: string): Promise<{
  messages: GmailMessageSummary[]
  nextPageToken?: string
}> {
  return withRetryOn401((token) => listInboxMessages(token, maxResults, pageToken))
}

export async function getMessageById(id: string): Promise<GmailMessageDetail> {
  return withRetryOn401((token) => getMessage(token, id))
}

/** Unread / total INBOX counts for sidebar badge. Returns zeros if not connected. */
export async function getInboxBadgeCounts(): Promise<{
  connected: boolean
  messagesTotal: number
  messagesUnread: number
}> {
  const integration = await getIntegration()
  if (!integration) {
    return { connected: false, messagesTotal: 0, messagesUnread: 0 }
  }
  try {
    const stats = await withRetryOn401((token) => getInboxLabelStats(token))
    return { connected: true, ...stats }
  } catch (err) {
    console.warn('[gmailService] inbox badge counts failed:', normalizeGmailError(err).code)
    return { connected: true, messagesTotal: 0, messagesUnread: 0 }
  }
}

// ── Send / Mark-read (new) ────────────────────────────────────────────────────

export async function markAsRead(messageId: string): Promise<void> {
  const integration = await getIntegration()
  if (integration && !hasGmailModifyScope(integration.scope)) {
    throw new GmailError('INSUFFICIENT_SCOPE', { detail: 'missing_gmail_modify' })
  }
  await withRetryOn401((token) => markMessageRead(token, messageId))
}

export async function sendGmailMessage(params: {
  to: string
  from: string
  subject: string
  body: string
  threadId?: string
  inReplyTo?: string
  references?: string
}): Promise<{ id: string; threadId: string }> {
  return withRetryOn401((token) => sendEmail(token, params))
}

export async function getMessageHeadersById(messageId: string) {
  return withRetryOn401((token) => getMessageHeaders(token, messageId))
}

export async function markAsUnread(messageId: string): Promise<void> {
  const integration = await getIntegration()
  if (integration && !hasGmailModifyScope(integration.scope)) {
    throw new GmailError('INSUFFICIENT_SCOPE', { detail: 'missing_gmail_modify' })
  }
  await withRetryOn401((token) => markMessageUnread(token, messageId))
}

export async function trashGmailMessage(messageId: string): Promise<void> {
  const integration = await getIntegration()
  if (integration && !hasGmailModifyScope(integration.scope)) {
    throw new GmailError('INSUFFICIENT_SCOPE', { detail: 'missing_gmail_modify' })
  }
  await withRetryOn401((token) => clientTrash(token, messageId))
}

export async function archiveGmailMessage(messageId: string): Promise<void> {
  const integration = await getIntegration()
  if (integration && !hasGmailModifyScope(integration.scope)) {
    throw new GmailError('INSUFFICIENT_SCOPE', { detail: 'missing_gmail_modify' })
  }
  await withRetryOn401((token) => clientArchive(token, messageId))
}

export async function setGmailStarred(messageId: string, starred: boolean): Promise<void> {
  const integration = await getIntegration()
  if (integration && !hasGmailModifyScope(integration.scope)) {
    throw new GmailError('INSUFFICIENT_SCOPE', { detail: 'missing_gmail_modify' })
  }
  await withRetryOn401((token) => clientSetStarred(token, messageId, starred))
}
