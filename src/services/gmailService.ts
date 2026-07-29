/**
 * Gmail Service — server-only.
 * Handles Firestore token storage/retrieval and wraps gmail/client.ts.
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { encrypt, decrypt } from '@/lib/gmail/crypto'
import { refreshAccessToken } from '@/lib/gmail/oauth'
import { listInboxMessages, getMessage } from '@/lib/gmail/client'
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
 * Get a valid access token.
 * Refreshes automatically if within TOKEN_REFRESH_BUFFER_MS of expiry.
 */
export async function getValidAccessToken(): Promise<string> {
  const integration = await getIntegration()
  if (!integration) throw new Error('[gmailService] Gmail not connected')

  const needsRefresh = Date.now() >= integration.expiresAt - TOKEN_REFRESH_BUFFER_MS
  if (!needsRefresh) return integration.accessToken

  // Decrypt stored refresh token
  const refreshToken = await decrypt(integration.encryptedRefreshToken)
  const { accessToken, expiresAt } = await refreshAccessToken(refreshToken)

  // Persist refreshed token
  const db = getAdminFirestore()
  await db.collection(Collections.INTEGRATIONS).doc(INTEGRATION_DOC).update({
    accessToken,
    expiresAt,
  })

  return accessToken
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
  const encryptedRefreshToken = await encrypt(params.refreshToken)
  const data: GmailIntegration = {
    connectedAt: Date.now(),
    connectedBy: params.connectedBy,
    accountEmail: params.accountEmail,
    encryptedRefreshToken,
    accessToken: params.accessToken,
    expiresAt: params.expiresAt,
    scope: params.scope,
  }
  await saveIntegration(data)
}

export async function listMessages(maxResults = 20, pageToken?: string): Promise<{
  messages: GmailMessageSummary[]
  nextPageToken?: string
}> {
  const accessToken = await getValidAccessToken()
  return listInboxMessages(accessToken, maxResults, pageToken)
}

export async function getMessageById(id: string): Promise<GmailMessageDetail> {
  const accessToken = await getValidAccessToken()
  return getMessage(accessToken, id)
}
