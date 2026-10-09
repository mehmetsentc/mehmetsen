/**
 * resolvePublishTarget(accountId) — the only way to turn an account id into
 * publish credentials.
 *
 * Fail-closed rules:
 *   - unknown / malformed / disabled / paused / needs_reauth / expired → no target
 *   - an explicitly requested account that cannot be resolved NEVER falls back
 *     to Onyeditivi or any other account
 *   - legacy references must still point at the same platform identity
 *     (current env / BYO config) — a mismatch is an error, not a redirect
 *   - the API host comes from the connection method (apiHosts.ts)
 *
 * The returned target carries `accessToken` as a non-enumerable property.
 */
import 'server-only'
import { isWellFormedAccountId, loadSocialAccount } from './accountStore'
import { decryptAccessToken, LEGACY_CREDENTIAL_SOURCES, readSecretRecord, type SocialTokenType } from './secretStore'
import { apiBaseFor } from './apiHosts'
import { publishPermissionState, type SocialAccount, type SocialAccountPlatform } from './types'
import type { PublishTarget } from './targetTypes'
import { resolveFacebookCredentials } from '../facebookCredentials'
import { PRIMARY_FACEBOOK_SITE_ID } from '../facebookAppStore'
import { getSocialTokens } from '../tokenStore'

export type ResolveTargetErrorCode =
  | 'invalid_account_id'
  | 'not_found'
  | 'invalid_record'
  | 'platform_mismatch'
  | 'paused'
  | 'needs_reauth'
  | 'disabled'
  | 'token_expired'
  | 'secret_missing'
  | 'secret_invalid'
  | 'secret_decrypt_failed'
  | 'legacy_unavailable'
  | 'legacy_mismatch'
  | 'publish_permission_missing'
  | 'publish_permission_unverified'

export type ResolvePublishTargetResult =
  | { ok: true; target: PublishTarget }
  | { ok: false; accountId: string; code: ResolveTargetErrorCode; message: string }

const MESSAGES: Record<ResolveTargetErrorCode, string> = {
  invalid_account_id: 'Hesap kimliği geçersiz',
  not_found: 'Hesap bulunamadı',
  invalid_record: 'Hesap kaydı tutarsız',
  platform_mismatch: 'Hesap bu platforma ait değil',
  paused: 'Hesap duraklatılmış',
  needs_reauth: 'Hesabın yeniden bağlanması gerekiyor',
  disabled: 'Hesap devre dışı',
  token_expired: 'Erişim anahtarının süresi dolmuş — yeniden bağlantı gerekli',
  secret_missing: 'Hesabın bağlantı bilgisi yok',
  secret_invalid: 'Hesabın bağlantı bilgisi tutarsız',
  secret_decrypt_failed: 'Bağlantı bilgisi çözülemedi',
  legacy_unavailable: 'Legacy bağlantı yapılandırması eksik',
  legacy_mismatch: 'Legacy bağlantı bu hesabı göstermiyor',
  publish_permission_missing: 'Yayın izni verilmemiş — yeniden bağlantı gerekli',
  publish_permission_unverified: 'Yayın izni doğrulanmadı — yeniden bağlantı gerekli',
}

function fail(accountId: string, code: ResolveTargetErrorCode): ResolvePublishTargetResult {
  return { ok: false, accountId, code, message: MESSAGES[code] }
}

/** Attach the token so it is invisible to JSON.stringify, spread and console inspection of keys. */
function withToken<T extends object>(target: T, accessToken: string): T & { readonly accessToken: string } {
  Object.defineProperty(target, 'accessToken', {
    value: accessToken,
    enumerable: false,
    writable: false,
    configurable: false,
  })
  return target as T & { readonly accessToken: string }
}

interface LegacyCredentials {
  externalId: string
  accessToken: string
  legacyCredentialMode?: 'custom' | 'global'
  appId?: string | null
  appName?: string | null
}

export async function resolveLegacyCredentials(platform: SocialAccountPlatform): Promise<LegacyCredentials | null> {
  if (platform === 'facebook') {
    const creds = await resolveFacebookCredentials(PRIMARY_FACEBOOK_SITE_ID)
    if (!creds.pageId || !creds.accessToken) return null
    return {
      externalId: creds.pageId,
      accessToken: creds.accessToken,
      legacyCredentialMode: creds.mode,
      appId: creds.appId,
      appName: creds.appName,
    }
  }
  if (platform === 'instagram') {
    const igUserId = process.env.INSTAGRAM_BUSINESS_ID?.trim() || ''
    const { igToken } = await getSocialTokens()
    if (!igUserId || !igToken) return null
    return { externalId: igUserId, accessToken: igToken }
  }
  const threadsUserId = process.env.THREADS_USER_ID?.trim() || ''
  const threadsToken = process.env.THREADS_ACCESS_TOKEN?.trim() || ''
  if (!threadsUserId || !threadsToken) return null
  return { externalId: threadsUserId, accessToken: threadsToken }
}

function buildTarget(
  account: SocialAccount,
  apiBase: string,
  accessToken: string,
  legacy?: LegacyCredentials,
): PublishTarget {
  const base = { accountId: account.id, connectionMethod: account.connectionMethod, apiBase }
  if (account.platform === 'facebook') {
    return withToken(
      {
        ...base,
        platform: 'facebook' as const,
        pageId: account.facebook.pageId,
        legacyCredentialMode: legacy?.legacyCredentialMode ?? null,
        appId: legacy?.appId ?? null,
        appName: legacy?.appName ?? null,
      },
      accessToken,
    )
  }
  if (account.platform === 'instagram') {
    return withToken({ ...base, platform: 'instagram' as const, igUserId: account.instagram.igUserId }, accessToken)
  }
  return withToken({ ...base, platform: 'threads' as const, threadsUserId: account.threads.threadsUserId }, accessToken)
}

/** Token type each connection must hold. Instagram Login tokens are never Facebook tokens. */
export function expectedTokenType(account: SocialAccount): SocialTokenType {
  if (account.platform === 'facebook') return 'facebook_page'
  if (account.platform === 'threads') return 'threads_user'
  return account.connectionMethod === 'instagram_login' ? 'instagram_user' : 'facebook_page'
}

export async function resolvePublishTarget(
  accountId: string,
  options: { expectedPlatform?: SocialAccountPlatform; now?: number } = {},
): Promise<ResolvePublishTargetResult> {
  const id = typeof accountId === 'string' ? accountId : ''
  if (!isWellFormedAccountId(id)) return fail(id, 'invalid_account_id')

  let loaded: Awaited<ReturnType<typeof loadSocialAccount>>
  try {
    loaded = await loadSocialAccount(id)
  } catch {
    return fail(id, 'not_found')
  }
  if (loaded.state === 'missing') return fail(id, 'not_found')
  if (loaded.state === 'invalid') return fail(id, 'invalid_record')
  const account: SocialAccount = loaded.account
  if (options.expectedPlatform && account.platform !== options.expectedPlatform) {
    return fail(id, 'platform_mismatch')
  }
  if (account.status !== 'active') return fail(id, account.status)

  const now = options.now ?? Date.now()
  if (account.tokenExpiresAt !== null && account.tokenExpiresAt <= now) return fail(id, 'token_expired')

  const apiBase = apiBaseFor(account.platform, account.connectionMethod)
  if (!apiBase) return fail(id, 'invalid_record')

  const permission = publishPermissionState(account)
  if (permission === 'missing') return fail(id, 'publish_permission_missing')
  if (permission === 'unverified') return fail(id, 'publish_permission_unverified')

  const secret = await readSecretRecord(id).catch(() => null)
  if (!secret) return fail(id, 'secret_missing')

  if (secret.kind === 'legacy') {
    if (account.connectionMethod !== 'legacy') return fail(id, 'secret_invalid')
    if (secret.legacySource !== LEGACY_CREDENTIAL_SOURCES[account.platform]) return fail(id, 'secret_invalid')
    const legacy = await resolveLegacyCredentials(account.platform).catch(() => null)
    if (!legacy) return fail(id, 'legacy_unavailable')
    if (legacy.externalId !== account.externalId) return fail(id, 'legacy_mismatch')
    return { ok: true, target: buildTarget(account, apiBase, legacy.accessToken, legacy) }
  }

  if (account.connectionMethod === 'legacy') return fail(id, 'secret_invalid')
  if (secret.tokenType !== expectedTokenType(account)) return fail(id, 'secret_invalid')
  const token = await decryptAccessToken(secret)
  if (!token) return fail(id, 'secret_decrypt_failed')
  return { ok: true, target: buildTarget(account, apiBase, token) }
}
