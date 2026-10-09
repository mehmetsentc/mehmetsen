/**
 * Connection flows used by the thin API routes. All Meta calls, token
 * handling and Firestore writes happen here (server-only), so they can be
 * tested without Next.js.
 *
 * Callback ↔ NaHaber session binding:
 *   The OAuth callback is a top-level GET without a Bearer token. It is bound
 *   to the initiating NaHaber session by THREE independent checks:
 *     1. HttpOnly binding cookie set at start (state ↔ browser)
 *     2. the signed `cms_session` cookie (HMAC, CMS_SESSION_SECRET): its uid
 *        must equal the uid stored with the state
 *     3. that uid's CURRENT authorization is re-resolved from Firebase Auth +
 *        users/{uid} (recheckSocialAccountManager)
 *   Missing/invalid cms_session → rejected (state still burnt).
 */
import 'server-only'
import { isTurkishProvinceSlug, normalizeCitySlug } from '@/constants/cities'
import type { CmsAuthContext } from '@/lib/cmsAuthServer'
import { verifyCmsSessionToken } from '@/lib/cmsSession'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { canManageSocialAccountOwnership, canManageSocialAccounts, recheckSocialAccountManager } from '../authz'
import { writeSocialAudit } from '../audit'
import { getSocialAccount, isWellFormedAccountId, loadSocialAccount } from '../accountStore'
import {
  consumeSocialOAuthState,
  createSocialOAuthState,
  oauthCookieIsSecure,
  OAUTH_BINDING_COOKIE_DEV,
  OAUTH_BINDING_COOKIE_SECURE,
  type OAuthBindingCookie,
  type OAuthConnectionMethod,
} from '../oauthState'
import { decryptAccessToken, readSecretRecord } from '../secretStore'
import { expectedTokenType, resolveLegacyCredentials } from '../resolvePublishTarget'
import {
  isSocialAccountPlatform,
  parseSocialAccount,
  publishPermissionState,
  requiredPermissionsFor,
  type SocialAccountOwnership,
  type SocialAccountPlatform,
} from '../types'
import { getPlatformConfigStatus, getPlatformOAuthConfig, panelReturnUrl, type PlatformConfigStatus } from './oauthConfig'
import { MetaCallError, cleanAuthCode } from './metaHttp'
import {
  buildFacebookAuthorizeUrl,
  debugFacebookPageToken,
  exchangeFacebookCode,
  fetchFacebookPageToken,
  fetchFacebookPermissions,
  FACEBOOK_REQUIRED_PAGE_TASK,
  listFacebookPages,
} from './facebookLogin'
import {
  buildInstagramAuthorizeUrl,
  exchangeInstagramCode,
  exchangeInstagramLongLived,
  fetchInstagramProfile,
  isInstagramProfessional,
} from './instagramLogin'
import { buildThreadsAuthorizeUrl, exchangeThreadsCode, exchangeThreadsLongLived, fetchThreadsProfile, verifyThreadsScopes } from './threadsOAuth'
import { saveConnectedAccount, type SaveConnectionResult } from './connectionStore'
import {
  consumeFacebookSelectSession,
  createFacebookSelectSession,
  readFacebookSelectSession,
  SELECT_COOKIE_DEV,
  SELECT_COOKIE_SECURE,
  SELECT_SESSION_TTL_MS,
} from './connectSessions'

export const CMS_SESSION_COOKIE = 'cms_session'

export const METHOD_FOR_PLATFORM: Record<SocialAccountPlatform, OAuthConnectionMethod> = {
  facebook: 'facebook_login',
  instagram: 'instagram_login',
  threads: 'threads_oauth',
}

export interface CookieToSet {
  name: string
  value: string
  options: { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/'; maxAge: number }
}

export function clearCookie(name: string, secure = oauthCookieIsSecure()): CookieToSet {
  return { name, value: '', options: { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 } }
}

export function allConfigStatuses(): Record<SocialAccountPlatform, PlatformConfigStatus> {
  return {
    facebook: getPlatformConfigStatus('facebook'),
    instagram: getPlatformConfigStatus('instagram'),
    threads: getPlatformConfigStatus('threads'),
  }
}

/** Canonical province only; anything else from the client is rejected. */
export function parseOwnershipInput(raw: unknown): SocialAccountOwnership | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (r.publisherId !== undefined && r.publisherId !== null) return null // not supported yet
  const city = typeof r.citySlug === 'string' ? r.citySlug.trim() : ''
  if (!city || !isTurkishProvinceSlug(city) || normalizeCitySlug(city) !== city) return null
  return { citySlug: city, publisherId: null }
}

// ── Start ────────────────────────────────────────────────────────────────────

export type StartResult =
  | { ok: true; authorizeUrl: string; cookie: OAuthBindingCookie }
  | { ok: false; status: number; code: string; missing?: string[] }

export async function startConnection(input: {
  ctx: CmsAuthContext
  platform: unknown
  ownership?: unknown
  reconnectAccountId?: string | null
  now?: number
}): Promise<StartResult> {
  const now = input.now ?? Date.now()
  if (!canManageSocialAccounts(input.ctx)) return { ok: false, status: 403, code: 'forbidden' }

  let platform: SocialAccountPlatform
  let ownership: SocialAccountOwnership
  let reconnectAccountId: string | null = null

  if (input.reconnectAccountId) {
    const id = input.reconnectAccountId
    if (!isWellFormedAccountId(id)) return { ok: false, status: 400, code: 'invalid_account_id' }
    const account = await getSocialAccount(id)
    if (!account) return { ok: false, status: 404, code: 'not_found' }
    if (account.connectionMethod === 'legacy') return { ok: false, status: 409, code: 'legacy_account' }
    if (account.connectionMethod !== METHOD_FOR_PLATFORM[account.platform]) {
      return { ok: false, status: 409, code: 'unsupported_connection_method' }
    }
    platform = account.platform
    ownership = account.ownership // from the stored record, never from the request
    reconnectAccountId = id
  } else {
    if (!isSocialAccountPlatform(input.platform)) return { ok: false, status: 400, code: 'invalid_platform' }
    const own = parseOwnershipInput(input.ownership)
    if (!own) return { ok: false, status: 400, code: 'invalid_ownership' }
    platform = input.platform
    ownership = own
  }
  if (!canManageSocialAccountOwnership(input.ctx, ownership)) return { ok: false, status: 403, code: 'forbidden' }

  const status = getPlatformConfigStatus(platform)
  if (!status.ready) return { ok: false, status: 409, code: 'not_configured', missing: status.missing }
  const cfg = getPlatformOAuthConfig(platform)

  const { state, cookie } = await createSocialOAuthState({
    uid: input.ctx.uid,
    platform,
    connectionMethod: METHOD_FOR_PLATFORM[platform],
    ownership,
    reconnectAccountId,
    now,
  })
  const authorizeUrl =
    platform === 'facebook'
      ? buildFacebookAuthorizeUrl(cfg, state, !!reconnectAccountId)
      : platform === 'instagram'
        ? buildInstagramAuthorizeUrl(cfg, state)
        : buildThreadsAuthorizeUrl(cfg, state)

  await writeSocialAudit({
    actorId: input.ctx.uid,
    action: 'social.oauth.start',
    entityType: 'socialOAuth',
    entityId: reconnectAccountId ?? platform,
    meta: { platform, citySlug: ownership.citySlug, reconnect: !!reconnectAccountId },
  })
  return { ok: true, authorizeUrl, cookie }
}

// ── Callback ─────────────────────────────────────────────────────────────────

export interface CallbackOutcome {
  redirect: string
  cookies: CookieToSet[]
  /** Short machine code (also in the redirect); never contains Meta text. */
  result: string
}

function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) {
      try {
        return decodeURIComponent(v.join('='))
      } catch {
        return null
      }
    }
  }
  return null
}

export function readBindingCookie(cookieHeader: string | null): string | null {
  return readCookieValue(cookieHeader, OAUTH_BINDING_COOKIE_SECURE) ?? readCookieValue(cookieHeader, OAUTH_BINDING_COOKIE_DEV)
}

export function readSelectCookie(cookieHeader: string | null): string | null {
  return readCookieValue(cookieHeader, SELECT_COOKIE_SECURE) ?? readCookieValue(cookieHeader, SELECT_COOKIE_DEV)
}

function outcome(result: string, extra: Record<string, string> = {}, cookies: CookieToSet[] = []): CallbackOutcome {
  return {
    result,
    redirect: panelReturnUrl({ social: result, ...extra }),
    cookies: [clearCookie(OAUTH_BINDING_COOKIE_SECURE), clearCookie(OAUTH_BINDING_COOKIE_DEV), ...cookies],
  }
}

const SAVE_RESULT_CODE: Record<Exclude<SaveConnectionResult, { ok: true }>['code'], string> = {
  account_mismatch: 'account_mismatch',
  reconnect_target_missing: 'reconnect_target_missing',
  owned_elsewhere: 'owned_elsewhere',
  legacy_account_exists: 'legacy_account_exists',
  encryption_unavailable: 'encryption_unavailable',
  invalid_input: 'platform_error',
  write_failed: 'write_failed',
}

export async function handleOAuthCallback(input: {
  platform: string
  params: URLSearchParams
  cookieHeader: string | null
  now?: number
}): Promise<CallbackOutcome> {
  const now = input.now ?? Date.now()
  if (!isSocialAccountPlatform(input.platform)) return outcome('state_invalid')
  const platform = input.platform

  const session = await verifyCmsSessionToken(readCookieValue(input.cookieHeader, CMS_SESSION_COOKIE) ?? undefined)
  const consumed = await consumeSocialOAuthState({
    state: input.params.get('state'),
    bindingCookie: readBindingCookie(input.cookieHeader),
    expectedPlatform: platform,
    expectedUid: session?.uid ?? '',
    now,
  })
  const userCancelled = input.params.get('error') === 'access_denied' || !!input.params.get('error')
  if (!consumed.ok) {
    if (consumed.code === 'user_mismatch') return outcome(session ? 'session_mismatch' : 'session_required')
    if (consumed.code === 'expired') return outcome('state_expired')
    return outcome(userCancelled ? 'cancelled' : 'state_invalid')
  }
  if (userCancelled) {
    await writeSocialAudit({ actorId: consumed.uid, action: 'social.oauth.callback', entityType: 'socialOAuth', entityId: platform, meta: { result: 'cancelled' } })
    return outcome('cancelled')
  }

  const ctx = await recheckSocialAccountManager(consumed.uid, consumed.ownership)
  if (!ctx) return outcome('forbidden')

  const status = getPlatformConfigStatus(platform)
  if (!status.ready) return outcome('not_configured')
  const cfg = getPlatformOAuthConfig(platform)
  const code = cleanAuthCode(input.params.get('code'))
  if (!code) return outcome('missing_code')

  let result: CallbackOutcome
  try {
    if (platform === 'facebook') result = await facebookCallback(cfg, code, consumed, now)
    else if (platform === 'instagram') result = await instagramCallback(cfg, code, consumed, now)
    else result = await threadsCallback(cfg, code, consumed, now)
  } catch (err) {
    const step = err instanceof MetaCallError ? err.step : 'internal'
    console.warn(`[social-connect] callback platform=${platform} step=${step} failed`)
    result = outcome('platform_error')
  }
  await writeSocialAudit({
    actorId: consumed.uid,
    action: 'social.oauth.callback',
    entityType: 'socialOAuth',
    entityId: consumed.reconnectAccountId ?? platform,
    meta: { platform, result: result.result, citySlug: consumed.ownership.citySlug },
  })
  return result
}

type Consumed = Extract<Awaited<ReturnType<typeof consumeSocialOAuthState>>, { ok: true }>

async function finishSave(
  save: SaveConnectionResult,
  consumed: Consumed,
): Promise<CallbackOutcome> {
  if (!save.ok) return outcome(SAVE_RESULT_CODE[save.code])
  await writeSocialAudit({
    actorId: consumed.uid,
    action: consumed.reconnectAccountId ? 'social.account.connect' : 'social.account.create',
    entityType: 'socialAccount',
    entityId: save.accountId,
    after: { status: save.status, citySlug: save.ownership.citySlug, created: save.created },
  })
  return outcome(save.status === 'active' ? 'connected' : 'connected_needs_attention', { account: save.accountId })
}

async function facebookCallback(
  cfg: ReturnType<typeof getPlatformOAuthConfig>,
  code: string,
  consumed: Consumed,
  now: number,
): Promise<CallbackOutcome> {
  const { userToken, expiresAt } = await exchangeFacebookCode(cfg, code, now)
  const perms = await fetchFacebookPermissions(userToken)
  const required = requiredPermissionsFor('facebook', 'facebook_login')
  if (required.some((p) => perms.declined.includes(p))) return outcome('permission_declined')
  if (!required.every((p) => perms.granted.includes(p))) return outcome('permission_missing')

  const { pages, truncated } = await listFacebookPages(userToken)
  if (pages.length === 0) return outcome('no_pages')
  if (!pages.some((p) => p.eligible)) return outcome('no_eligible_pages')

  const sess = await createFacebookSelectSession({
    uid: consumed.uid,
    ownership: consumed.ownership,
    reconnectAccountId: consumed.reconnectAccountId,
    userToken,
    userTokenExpiresAt: expiresAt,
    grantedPermissions: perms.granted,
    pages,
    pagesTruncated: truncated,
    now,
  })
  const secure = oauthCookieIsSecure()
  return outcome('facebook_select', { fbSelect: sess.sessionId }, [
    {
      name: secure ? SELECT_COOKIE_SECURE : SELECT_COOKIE_DEV,
      value: sess.binding,
      options: { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: Math.floor(SELECT_SESSION_TTL_MS / 1000) },
    },
  ])
}

async function instagramCallback(
  cfg: ReturnType<typeof getPlatformOAuthConfig>,
  code: string,
  consumed: Consumed,
  now: number,
): Promise<CallbackOutcome> {
  const { shortToken, permissions } = await exchangeInstagramCode(cfg, code)
  const required = requiredPermissionsFor('instagram', 'instagram_login')
  if (permissions && !required.every((p) => permissions.includes(p))) return outcome('permission_missing')
  if (!permissions && consumed.reconnectAccountId) return outcome('permission_unverified')
  const long = await exchangeInstagramLongLived(cfg, shortToken, now)
  const profile = await fetchInstagramProfile(long.token)
  if (!isInstagramProfessional(profile.accountType)) return outcome('not_professional')
  const save = await saveConnectedAccount({
    platform: 'instagram',
    connectionMethod: 'instagram_login',
    externalId: profile.igUserId,
    displayName: profile.name || profile.username || profile.igUserId,
    username: profile.username,
    platformAccountType: profile.accountType,
    accessToken: long.token,
    tokenType: 'instagram_user',
    tokenExpiresAt: long.expiresAt,
    tokenExpiryVerified: long.expiresAt !== null,
    grantedPermissions: permissions,
    permissionsVerifiedAt: permissions ? now : null,
    ownership: consumed.ownership,
    reconnectAccountId: consumed.reconnectAccountId,
    actorUid: consumed.uid,
    now,
  })
  return finishSave(save, consumed)
}

async function threadsCallback(
  cfg: ReturnType<typeof getPlatformOAuthConfig>,
  code: string,
  consumed: Consumed,
  now: number,
): Promise<CallbackOutcome> {
  const { shortToken, userId } = await exchangeThreadsCode(cfg, code)
  const long = await exchangeThreadsLongLived(cfg, shortToken, now)
  const profile = await fetchThreadsProfile(long.token, userId)
  const scopes = await verifyThreadsScopes(long.token, userId)
  const required = requiredPermissionsFor('threads', 'threads_oauth')
  if (scopes && !required.every((p) => scopes.includes(p))) return outcome('permission_missing')
  if (!scopes && consumed.reconnectAccountId) return outcome('permission_unverified')
  const save = await saveConnectedAccount({
    platform: 'threads',
    connectionMethod: 'threads_oauth',
    externalId: userId,
    displayName: profile.name || profile.username || userId,
    username: profile.username,
    platformAccountType: null,
    accessToken: long.token,
    tokenType: 'threads_user',
    tokenExpiresAt: long.expiresAt,
    tokenExpiryVerified: long.expiresAt !== null,
    grantedPermissions: scopes,
    permissionsVerifiedAt: scopes ? now : null,
    ownership: consumed.ownership,
    reconnectAccountId: consumed.reconnectAccountId,
    actorUid: consumed.uid,
    now,
  })
  return finishSave(save, consumed)
}

// ── Facebook page selection ─────────────────────────────────────────────────

export async function listSelectablePages(input: {
  ctx: CmsAuthContext
  sessionId: string | null
  cookieHeader: string | null
  offset: number
  now?: number
}) {
  if (!canManageSocialAccounts(input.ctx)) return { ok: false as const, status: 403, code: 'forbidden' }
  const r = await readFacebookSelectSession({
    sessionId: input.sessionId,
    binding: readSelectCookie(input.cookieHeader),
    uid: input.ctx.uid,
    now: input.now ?? Date.now(),
    offset: input.offset,
    limit: 25,
  })
  if (!r.ok) return { ok: false as const, status: r.code === 'user_mismatch' ? 403 : 410, code: r.code }
  return r
}

export async function selectFacebookPage(input: {
  ctx: CmsAuthContext
  sessionId: unknown
  pageId: unknown
  cookieHeader: string | null
  now?: number
}): Promise<{ ok: true; accountId: string; status: string } | { ok: false; status: number; code: string }> {
  const now = input.now ?? Date.now()
  if (!canManageSocialAccounts(input.ctx)) return { ok: false, status: 403, code: 'forbidden' }
  const pageId = typeof input.pageId === 'string' ? input.pageId.trim() : ''
  const consumed = await consumeFacebookSelectSession({
    sessionId: typeof input.sessionId === 'string' ? input.sessionId : null,
    binding: readSelectCookie(input.cookieHeader),
    uid: input.ctx.uid,
    pageId,
    now,
  })
  if (!consumed.ok) {
    const status = consumed.code === 'user_mismatch' ? 403 : consumed.code.startsWith('page_') ? 400 : 410
    return { ok: false, status, code: consumed.code }
  }
  // Re-check the selecting user's CURRENT authority for the session's ownership.
  if (!canManageSocialAccountOwnership(input.ctx, consumed.ownership)) return { ok: false, status: 403, code: 'forbidden' }
  const cfgStatus = getPlatformConfigStatus('facebook')
  if (!cfgStatus.ready) return { ok: false, status: 409, code: 'not_configured' }
  const cfg = getPlatformOAuthConfig('facebook')

  let page
  try {
    page = await fetchFacebookPageToken(consumed.userToken, pageId)
  } catch {
    return { ok: false, status: 502, code: 'platform_error' }
  }
  if (!page.tasks.includes(FACEBOOK_REQUIRED_PAGE_TASK)) return { ok: false, status: 400, code: 'page_not_eligible' }
  const dbg = await debugFacebookPageToken(cfg, page.accessToken, pageId, now)
  if (!dbg.valid) return { ok: false, status: 400, code: 'page_token_invalid' }

  const save = await saveConnectedAccount({
    platform: 'facebook',
    connectionMethod: 'facebook_login',
    externalId: pageId,
    displayName: page.name,
    username: null,
    platformAccountType: null,
    accessToken: page.accessToken,
    tokenType: 'facebook_page',
    tokenExpiresAt: dbg.expiresAt,
    tokenExpiryVerified: dbg.verified,
    grantedPermissions: consumed.grantedPermissions,
    permissionsVerifiedAt: now,
    ownership: consumed.ownership,
    reconnectAccountId: consumed.reconnectAccountId,
    actorUid: input.ctx.uid,
    now,
  })
  if (!save.ok) return { ok: false, status: 409, code: SAVE_RESULT_CODE[save.code] }
  await writeSocialAudit({
    actorId: input.ctx.uid,
    action: consumed.reconnectAccountId ? 'social.account.connect' : 'social.account.create',
    entityType: 'socialAccount',
    entityId: save.accountId,
    after: { status: save.status, citySlug: save.ownership.citySlug, created: save.created },
  })
  return { ok: true, accountId: save.accountId, status: save.status }
}

// ── Status transitions ──────────────────────────────────────────────────────

export type StatusAction = 'pause' | 'activate'

/** Why an account can't be activated by a status change alone (null = eligible). */
export async function activationBlocker(accountId: string, now: number): Promise<string | null> {
  const loaded = await loadSocialAccount(accountId)
  if (loaded.state !== 'ok') return 'not_found'
  const a = loaded.account
  if (a.connectionMethod === 'legacy') {
    const legacy = await resolveLegacyCredentials(a.platform).catch(() => null)
    if (!legacy) return 'legacy_unavailable'
    return legacy.externalId === a.externalId ? null : 'legacy_mismatch'
  }
  if (a.tokenExpiresAt !== null && a.tokenExpiresAt <= now) return 'token_expired'
  const perm = publishPermissionState(a)
  if (perm !== 'verified') return perm === 'missing' ? 'publish_permission_missing' : 'publish_permission_unverified'
  const secret = await readSecretRecord(accountId).catch(() => null)
  if (!secret || secret.kind !== 'encrypted' || secret.tokenType !== expectedTokenType(a)) return 'secret_missing'
  if (!(await decryptAccessToken(secret))) return 'secret_decrypt_failed'
  return null
}

export async function changeAccountStatus(input: {
  ctx: CmsAuthContext
  accountId: string
  action: unknown
  now?: number
}): Promise<{ ok: true; status: string } | { ok: false; status: number; code: string }> {
  const now = input.now ?? Date.now()
  if (!canManageSocialAccounts(input.ctx)) return { ok: false, status: 403, code: 'forbidden' }
  if (!isWellFormedAccountId(input.accountId)) return { ok: false, status: 400, code: 'invalid_account_id' }
  if (input.action !== 'pause' && input.action !== 'activate') return { ok: false, status: 400, code: 'invalid_action' }
  const action = input.action

  const blocker = action === 'activate' ? await activationBlocker(input.accountId, now) : null
  if (blocker === 'not_found') return { ok: false, status: 404, code: 'not_found' }

  const db = getAdminFirestore()
  const ref = db.collection(Collections.SOCIAL_ACCOUNTS).doc(input.accountId)
  const r = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const a = snap.exists ? parseSocialAccount(input.accountId, snap.data()) : null
    if (!a) return { ok: false as const, status: 404, code: 'not_found' }
    if (!canManageSocialAccountOwnership(input.ctx, a.ownership)) return { ok: false as const, status: 403, code: 'forbidden' }
    if (action === 'pause') {
      if (a.status !== 'active') return { ok: false as const, status: 409, code: `cannot_pause_${a.status}` }
      tx.update(ref, { status: 'paused', statusReason: 'Yönetici tarafından duraklatıldı', updatedAt: now, updatedBy: input.ctx.uid })
      return { ok: true as const, before: a.status, after: 'paused' }
    }
    if (a.status === 'needs_reauth') return { ok: false as const, status: 409, code: 'reconnect_required' }
    if (a.status !== 'paused') return { ok: false as const, status: 409, code: `cannot_activate_${a.status}` }
    if (blocker) return { ok: false as const, status: 409, code: blocker }
    tx.update(ref, { status: 'active', statusReason: null, updatedAt: now, updatedBy: input.ctx.uid })
    return { ok: true as const, before: a.status, after: 'active' }
  })
  if (!r.ok) return r
  await writeSocialAudit({
    actorId: input.ctx.uid,
    action: 'social.account.status',
    entityType: 'socialAccount',
    entityId: input.accountId,
    before: { status: r.before },
    after: { status: r.after },
  })
  return { ok: true, status: r.after }
}

/** Accounts visible to this manager (central admins: all). Metadata only. */
export async function listManagedAccounts(ctx: CmsAuthContext) {
  if (!canManageSocialAccounts(ctx)) return null
  const snap = await getAdminFirestore().collection(Collections.SOCIAL_ACCOUNTS).get()
  return snap.docs
    .map((d) => parseSocialAccount(d.id, d.data()))
    .filter((a): a is NonNullable<typeof a> => !!a && canManageSocialAccountOwnership(ctx, a.ownership))
}
