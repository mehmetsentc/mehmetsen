/**
 * Multi-account social model — metadata types (no secrets).
 *
 * Firestore:
 *   socialAccounts/{accountId}        → SocialAccount (metadata, this file)
 *   socialAccountSecrets/{accountId}  → server-only secret record (secretTypes.ts)
 *   socialOAuthStates/{stateHash}     → server-only OAuth state (oauthState.ts)
 *
 * All three collections are closed to clients in firestore.rules; only the
 * Admin SDK reads/writes them. The `socialAccounts` collection name is the one
 * already reserved in `Collections.SOCIAL_ACCOUNTS` (Newsroom OS shell).
 */

export const SOCIAL_ACCOUNT_PLATFORMS = ['facebook', 'instagram', 'threads'] as const
export type SocialAccountPlatform = (typeof SOCIAL_ACCOUNT_PLATFORMS)[number]

export const SOCIAL_CONNECTION_METHODS = [
  'legacy',
  'facebook_login',
  'instagram_login',
  'threads_oauth',
] as const
export type SocialConnectionMethod = (typeof SOCIAL_CONNECTION_METHODS)[number]

/** Which connection methods are valid per platform. */
export const ALLOWED_CONNECTION_METHODS: Record<SocialAccountPlatform, readonly SocialConnectionMethod[]> = {
  facebook: ['legacy', 'facebook_login'],
  // Instagram API with Facebook Login (page-linked) OR Instagram API with Instagram Login.
  instagram: ['legacy', 'facebook_login', 'instagram_login'],
  threads: ['legacy', 'threads_oauth'],
}

export const SOCIAL_ACCOUNT_STATUSES = ['active', 'paused', 'needs_reauth', 'disabled'] as const
export type SocialAccountStatus = (typeof SOCIAL_ACCOUNT_STATUSES)[number]

/** Province and/or publisher that owns the account. At least one must be set. */
export interface SocialAccountOwnership {
  /** Canonical province slug (e.g. `antalya`). */
  citySlug: string | null
  /** Publisher platform id, when a publisher (not a province desk) owns it. */
  publisherId: string | null
}

interface SocialAccountCommon {
  /** Deterministic: `${platform}_${externalId}` (see accountIdFor). */
  id: string
  /** Page id / IG user id / Threads user id — the platform-side identity. */
  externalId: string
  displayName: string
  username: string | null
  ownership: SocialAccountOwnership
  status: SocialAccountStatus
  /** Human-readable reason for paused / needs_reauth / disabled. */
  statusReason: string | null
  connectedBy: string | null
  connectedAt: number | null
  createdAt: number
  updatedAt: number
  updatedBy: string | null
  /** Access token expiry (ms). null = non-expiring or unknown (see tokenExpiryVerified). */
  tokenExpiresAt: number | null
  /** true when tokenExpiresAt came from a platform response (expires_in / debug_token). */
  tokenExpiryVerified: boolean
  /** Permissions the platform reported as granted, as last verified. null = not verified. */
  grantedPermissions: string[] | null
  permissionsVerifiedAt: number | null
  /** Platform-reported account type when available (e.g. IG `Business` / `Media_Creator`). */
  platformAccountType: string | null
}

export interface FacebookPageAccount extends SocialAccountCommon {
  platform: 'facebook'
  connectionMethod: 'legacy' | 'facebook_login'
  facebook: { pageId: string }
}

/** Instagram via Facebook Login: IG professional account linked to a Facebook Page. */
export interface InstagramFacebookLoginAccount extends SocialAccountCommon {
  platform: 'instagram'
  connectionMethod: 'legacy' | 'facebook_login'
  instagram: { igUserId: string; linkedFacebookPageId: string | null }
}

/** Instagram via Instagram Login: graph.instagram.com, no Facebook Page involved. */
export interface InstagramLoginAccount extends SocialAccountCommon {
  platform: 'instagram'
  connectionMethod: 'instagram_login'
  instagram: { igUserId: string; linkedFacebookPageId: null }
}

export interface ThreadsAccount extends SocialAccountCommon {
  platform: 'threads'
  connectionMethod: 'legacy' | 'threads_oauth'
  threads: { threadsUserId: string }
}

export type SocialAccount =
  | FacebookPageAccount
  | InstagramFacebookLoginAccount
  | InstagramLoginAccount
  | ThreadsAccount

/**
 * Shape safe to return to the browser. Built by whitelisting fields — never by
 * spreading a stored document — so a stray secret field can't leak.
 */
export interface SocialAccountPublic {
  id: string
  platform: SocialAccountPlatform
  externalId: string
  displayName: string
  username: string | null
  ownership: SocialAccountOwnership
  connectionMethod: SocialConnectionMethod
  status: SocialAccountStatus
  statusReason: string | null
  connectedBy: string | null
  connectedAt: number | null
  updatedAt: number
  tokenExpiresAt: number | null
  tokenExpiryVerified: boolean
  grantedPermissions: string[] | null
  permissionsVerifiedAt: number | null
  platformAccountType: string | null
  /** Derived: publish permission state for the panel. */
  publishPermission: PublishPermissionState
  /** Permissions this connection needs to publish. */
  requiredPermissions: readonly string[]
}

export type PublishPermissionState = 'verified' | 'missing' | 'unverified' | 'legacy'

/**
 * Permissions each connection method needs before an account may publish.
 * Source: Meta docs (Pages API / Instagram API with Instagram Login / Threads API).
 */
export const REQUIRED_PUBLISH_PERMISSIONS: Record<SocialConnectionMethod, readonly string[]> = {
  legacy: [],
  facebook_login: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
  instagram_login: ['instagram_business_basic', 'instagram_business_content_publish'],
  threads_oauth: ['threads_basic', 'threads_content_publish'],
}

/** Required permissions for an account (Instagram via Facebook Login uses the IG FB-Login set). */
export function requiredPermissionsFor(
  platform: SocialAccountPlatform,
  method: SocialConnectionMethod,
): readonly string[] {
  if (platform === 'instagram' && method === 'facebook_login') {
    return ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement']
  }
  return REQUIRED_PUBLISH_PERMISSIONS[method]
}

/** Never infers "granted" from what was requested — only from a verified platform response. */
export function publishPermissionState(a: Pick<SocialAccount, 'platform' | 'connectionMethod' | 'grantedPermissions' | 'permissionsVerifiedAt'>): PublishPermissionState {
  if (a.connectionMethod === 'legacy') return 'legacy'
  if (!a.grantedPermissions || !a.permissionsVerifiedAt) return 'unverified'
  const granted = new Set(a.grantedPermissions)
  return requiredPermissionsFor(a.platform, a.connectionMethod).every((p) => granted.has(p)) ? 'verified' : 'missing'
}

const EXTERNAL_ID_RE = /^[0-9A-Za-z_-]{1,64}$/

export function isValidExternalId(v: unknown): v is string {
  return typeof v === 'string' && EXTERNAL_ID_RE.test(v)
}

/** Deterministic account id → re-running a migration/connection never duplicates. */
export function accountIdFor(platform: SocialAccountPlatform, externalId: string): string {
  if (!isValidExternalId(externalId)) throw new Error('invalid external id')
  return `${platform}_${externalId}`
}

export function isSocialAccountPlatform(v: unknown): v is SocialAccountPlatform {
  return typeof v === 'string' && (SOCIAL_ACCOUNT_PLATFORMS as readonly string[]).includes(v)
}

export function isSocialConnectionMethod(v: unknown): v is SocialConnectionMethod {
  return typeof v === 'string' && (SOCIAL_CONNECTION_METHODS as readonly string[]).includes(v)
}

export function isSocialAccountStatus(v: unknown): v is SocialAccountStatus {
  return typeof v === 'string' && (SOCIAL_ACCOUNT_STATUSES as readonly string[]).includes(v)
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const strList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? [...(v as string[])] : null

/**
 * Parse a stored document into a SocialAccount. Returns null for anything
 * malformed (unknown platform, method not allowed for platform, missing or
 * inconsistent platform id, no owner). Callers treat null as "do not publish".
 */
export function parseSocialAccount(id: string, raw: unknown): SocialAccount | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const platform = r.platform
  const method = r.connectionMethod
  if (!isSocialAccountPlatform(platform) || !isSocialConnectionMethod(method)) return null
  if (!ALLOWED_CONNECTION_METHODS[platform].includes(method)) return null
  const externalId = str(r.externalId)
  if (!externalId || !isValidExternalId(externalId)) return null
  if (id !== accountIdFor(platform, externalId)) return null
  if (!isSocialAccountStatus(r.status)) return null

  const own = (r.ownership && typeof r.ownership === 'object' ? r.ownership : {}) as Record<string, unknown>
  const ownership: SocialAccountOwnership = { citySlug: str(own.citySlug), publisherId: str(own.publisherId) }
  if (!ownership.citySlug && !ownership.publisherId) return null

  const common: SocialAccountCommon = {
    id,
    externalId,
    displayName: str(r.displayName) ?? externalId,
    username: str(r.username),
    ownership,
    status: r.status,
    statusReason: str(r.statusReason),
    connectedBy: str(r.connectedBy),
    connectedAt: num(r.connectedAt),
    createdAt: num(r.createdAt) ?? 0,
    updatedAt: num(r.updatedAt) ?? 0,
    updatedBy: str(r.updatedBy),
    tokenExpiresAt: num(r.tokenExpiresAt),
    tokenExpiryVerified: r.tokenExpiryVerified === true,
    grantedPermissions: strList(r.grantedPermissions),
    permissionsVerifiedAt: num(r.permissionsVerifiedAt),
    platformAccountType: str(r.platformAccountType),
  }

  if (platform === 'facebook') {
    const fb = (r.facebook ?? {}) as Record<string, unknown>
    if (str(fb.pageId) !== externalId) return null
    return { ...common, platform, connectionMethod: method as FacebookPageAccount['connectionMethod'], facebook: { pageId: externalId } }
  }
  if (platform === 'instagram') {
    const ig = (r.instagram ?? {}) as Record<string, unknown>
    if (str(ig.igUserId) !== externalId) return null
    if (method === 'instagram_login') {
      return { ...common, platform, connectionMethod: 'instagram_login', instagram: { igUserId: externalId, linkedFacebookPageId: null } }
    }
    return {
      ...common,
      platform,
      connectionMethod: method as InstagramFacebookLoginAccount['connectionMethod'],
      instagram: { igUserId: externalId, linkedFacebookPageId: str(ig.linkedFacebookPageId) },
    }
  }
  const th = (r.threads ?? {}) as Record<string, unknown>
  if (str(th.threadsUserId) !== externalId) return null
  return { ...common, platform, connectionMethod: method as ThreadsAccount['connectionMethod'], threads: { threadsUserId: externalId } }
}

export function toPublicSocialAccount(a: SocialAccount): SocialAccountPublic {
  return {
    id: a.id,
    platform: a.platform,
    externalId: a.externalId,
    displayName: a.displayName,
    username: a.username,
    ownership: { citySlug: a.ownership.citySlug, publisherId: a.ownership.publisherId },
    connectionMethod: a.connectionMethod,
    status: a.status,
    statusReason: a.statusReason,
    connectedBy: a.connectedBy,
    connectedAt: a.connectedAt,
    updatedAt: a.updatedAt,
    tokenExpiresAt: a.tokenExpiresAt,
    tokenExpiryVerified: a.tokenExpiryVerified,
    grantedPermissions: a.grantedPermissions ? [...a.grantedPermissions] : null,
    permissionsVerifiedAt: a.permissionsVerifiedAt,
    platformAccountType: a.platformAccountType,
    publishPermission: publishPermissionState(a),
    requiredPermissions: [...requiredPermissionsFor(a.platform, a.connectionMethod)],
  }
}
