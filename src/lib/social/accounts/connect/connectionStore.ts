/**
 * Persist a completed OAuth connection: account metadata + encrypted secret
 * in ONE Firestore transaction.
 *
 * - Token encryption happens BEFORE the transaction; a missing key or any
 *   failure leaves the existing account and its secret untouched.
 * - Deterministic id `${platform}_${externalId}` → no duplicates.
 * - Reconnect must match the existing account's external id; ownership of an
 *   existing account is always kept (never reassigned from the request/state).
 * - A legacy (Onyeditivi) record is never overwritten by an OAuth connection.
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { buildEncryptedSecretRecord, SecretEncryptionUnavailableError, type SocialTokenType } from '../secretStore'
import {
  accountIdFor,
  parseSocialAccount,
  publishPermissionState,
  type SocialAccount,
  type SocialAccountOwnership,
  type SocialAccountPlatform,
  type SocialAccountStatus,
} from '../types'
import type { OAuthConnectionMethod } from '../oauthState'

export interface ConnectedAccountInput {
  platform: SocialAccountPlatform
  connectionMethod: OAuthConnectionMethod
  externalId: string
  displayName: string
  username: string | null
  platformAccountType: string | null
  accessToken: string
  tokenType: SocialTokenType
  tokenExpiresAt: number | null
  tokenExpiryVerified: boolean
  grantedPermissions: string[] | null
  permissionsVerifiedAt: number | null
  /** Ownership chosen when the flow started (used only for NEW accounts). */
  ownership: SocialAccountOwnership
  reconnectAccountId: string | null
  actorUid: string
  now: number
}

export type SaveConnectionResult =
  | { ok: true; accountId: string; created: boolean; status: SocialAccountStatus; ownership: SocialAccountOwnership }
  | {
      ok: false
      code:
        | 'account_mismatch'
        | 'reconnect_target_missing'
        | 'owned_elsewhere'
        | 'legacy_account_exists'
        | 'encryption_unavailable'
        | 'invalid_input'
        | 'write_failed'
    }

function sameOwnership(a: SocialAccountOwnership, b: SocialAccountOwnership): boolean {
  return (a.citySlug ?? null) === (b.citySlug ?? null) && (a.publisherId ?? null) === (b.publisherId ?? null)
}

/** Status after (re)connection: only a verified, unexpired connection is `active`. */
export function statusAfterConnect(
  input: Pick<ConnectedAccountInput, 'platform' | 'connectionMethod' | 'grantedPermissions' | 'permissionsVerifiedAt' | 'tokenExpiresAt' | 'now'>,
): { status: SocialAccountStatus; reason: string | null } {
  if (input.tokenExpiresAt !== null && input.tokenExpiresAt <= input.now) {
    return { status: 'needs_reauth', reason: 'Erişim anahtarının süresi dolmuş' }
  }
  const perm = publishPermissionState(input)
  if (perm === 'missing') return { status: 'needs_reauth', reason: 'Yayın izni verilmedi' }
  if (perm === 'unverified') return { status: 'needs_reauth', reason: 'Yayın izni doğrulanamadı' }
  return { status: 'active', reason: null }
}

export async function saveConnectedAccount(input: ConnectedAccountInput): Promise<SaveConnectionResult> {
  let accountId: string
  try {
    accountId = accountIdFor(input.platform, input.externalId)
  } catch {
    return { ok: false, code: 'invalid_input' }
  }
  if (input.reconnectAccountId && input.reconnectAccountId !== accountId) {
    // Logged in with a different account than the one being reconnected.
    return { ok: false, code: 'account_mismatch' }
  }

  let secret
  try {
    secret = await buildEncryptedSecretRecord(input.accessToken, input.tokenType, input.now)
  } catch (err) {
    if (err instanceof SecretEncryptionUnavailableError) return { ok: false, code: 'encryption_unavailable' }
    return { ok: false, code: 'invalid_input' }
  }

  const db = getAdminFirestore()
  const accountRef = db.collection(Collections.SOCIAL_ACCOUNTS).doc(accountId)
  const secretRef = db.collection(Collections.SOCIAL_ACCOUNT_SECRETS).doc(accountId)
  const { status, reason } = statusAfterConnect(input)

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(accountRef)
      const existing = snap.exists ? parseSocialAccount(accountId, snap.data()) : null
      if (snap.exists && !existing) return { ok: false as const, code: 'write_failed' as const }
      if (input.reconnectAccountId && !existing) return { ok: false as const, code: 'reconnect_target_missing' as const }
      if (existing?.connectionMethod === 'legacy') return { ok: false as const, code: 'legacy_account_exists' as const }
      if (existing && !input.reconnectAccountId && !sameOwnership(existing.ownership, input.ownership)) {
        return { ok: false as const, code: 'owned_elsewhere' as const }
      }

      const ownership = existing ? existing.ownership : input.ownership
      const common = {
        id: accountId,
        externalId: input.externalId,
        displayName: input.displayName.slice(0, 200) || input.externalId,
        username: input.username,
        ownership: { citySlug: ownership.citySlug, publisherId: ownership.publisherId },
        status,
        statusReason: reason,
        connectedBy: input.actorUid,
        connectedAt: input.now,
        createdAt: existing?.createdAt ?? input.now,
        updatedAt: input.now,
        updatedBy: input.actorUid,
        tokenExpiresAt: input.tokenExpiresAt,
        tokenExpiryVerified: input.tokenExpiryVerified,
        grantedPermissions: input.grantedPermissions ? [...input.grantedPermissions] : null,
        permissionsVerifiedAt: input.permissionsVerifiedAt,
        platformAccountType: input.platformAccountType,
      }
      let account: SocialAccount
      if (input.platform === 'facebook' && input.connectionMethod === 'facebook_login') {
        account = { ...common, platform: 'facebook', connectionMethod: 'facebook_login', facebook: { pageId: input.externalId } }
      } else if (input.platform === 'instagram' && input.connectionMethod === 'instagram_login') {
        account = { ...common, platform: 'instagram', connectionMethod: 'instagram_login', instagram: { igUserId: input.externalId, linkedFacebookPageId: null } }
      } else if (input.platform === 'threads' && input.connectionMethod === 'threads_oauth') {
        account = { ...common, platform: 'threads', connectionMethod: 'threads_oauth', threads: { threadsUserId: input.externalId } }
      } else {
        return { ok: false as const, code: 'invalid_input' as const }
      }
      if (!parseSocialAccount(accountId, account)) return { ok: false as const, code: 'invalid_input' as const }

      tx.set(secretRef, { ...secret })
      tx.set(accountRef, { ...account })
      return { ok: true as const, accountId, created: !existing, status, ownership: account.ownership }
    })
  } catch {
    return { ok: false, code: 'write_failed' }
  }
}
