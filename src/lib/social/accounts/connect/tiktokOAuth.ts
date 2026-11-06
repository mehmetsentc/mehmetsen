/**
 * TIKTOK-1 — TikTok Login Kit (web, OAuth v2) + the read calls the connection
 * and the post dialog need.
 *
 * - Scopes: user.info.basic + video.publish (Direct Post) + video.upload (inbox
 *   draft). Granted scopes come from the token response `scope` field (comma
 *   separated) — never inferred from what was requested.
 * - Access tokens live 24 h; refresh tokens 365 days and MAY ROTATE on refresh
 *   (TikTok docs: "may be different" → the caller must store the new one).
 *   NaHaber stores only the refresh token (encrypted, tokenType `tiktok_refresh`).
 * - Error bodies are reduced to TikTok's short `error.code` (`access_token_invalid`,
 *   `scope_not_authorized` …). Messages, tokens, log ids and secrets are never logged.
 *
 * Docs: developers.tiktok.com/doc/login-kit-web, oauth-user-access-token-management,
 * tiktok-api-v2-get-user-info, content-posting-api-reference-query-creator-info.
 */
import 'server-only'
import { TIKTOK_API_BASE, TIKTOK_OAUTH_AUTHORIZE_URL, TIKTOK_OAUTH_TOKEN_URL } from '../../graphConfig'
import { MetaCallError, query } from './metaHttp'
import type { PlatformOAuthConfig } from './oauthConfig'

/** Scopes requested at connect. Publishing needs user.info.basic + video.publish (types.ts). */
export const TIKTOK_SCOPES = ['user.info.basic', 'video.publish', 'video.upload'] as const

/** TikTok open_id: per-app user id (letters, digits, `-`, `_`, `.`). */
export const TIKTOK_OPEN_ID_RE = /^[0-9A-Za-z_.-]{6,64}$/

const CODE_RE = /^[a-z_]{1,64}$/

export interface TikTokErrorInfo {
  status: number
  /** TikTok `error.code` / OAuth `error` (short machine code) or null. */
  code: string | null
}

export type TikTokResult<T> = { ok: true; data: T } | { ok: false; error: TikTokErrorInfo }

/** Refresh token revoked / expired / app access removed → reconnect. */
export class TikTokRefreshRejectedError extends Error {
  readonly code = 'refresh_rejected'
  constructor() {
    super('tiktok_refresh_rejected')
  }
}

/** Reduce a TikTok error body to its short code (never the message / log id). */
export function tiktokErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  // OAuth endpoint: { error: 'invalid_grant', error_description, log_id }
  if (typeof b.error === 'string') return CODE_RE.test(b.error) ? b.error : null
  // Open API: { data, error: { code: 'ok' | 'access_token_invalid', message, log_id } }
  if (b.error && typeof b.error === 'object') {
    const c = (b.error as Record<string, unknown>).code
    return typeof c === 'string' && CODE_RE.test(c) ? c : null
  }
  return null
}

type FetchFn = typeof fetch

export async function tiktokRequest<T>(
  step: string,
  url: string,
  init: { method?: 'GET' | 'POST'; form?: Record<string, string>; json?: unknown; bearer?: string; fetch?: FetchFn; timeoutMs?: number } = {},
): Promise<TikTokResult<T>> {
  const fetchFn = init.fetch ?? fetch
  let res: Response
  try {
    const headers: Record<string, string> = {}
    if (init.form) headers['Content-Type'] = 'application/x-www-form-urlencoded'
    if (init.json !== undefined) headers['Content-Type'] = 'application/json; charset=UTF-8'
    if (init.bearer) headers.Authorization = `Bearer ${init.bearer}`
    res = await fetchFn(url, {
      method: init.method ?? (init.form || init.json !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.form ? new URLSearchParams(init.form).toString() : init.json !== undefined ? JSON.stringify(init.json) : undefined,
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
    })
  } catch {
    console.warn(`[social-tiktok] ${step} network_error`)
    return { ok: false, error: { status: 0, code: 'network' } }
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  const code = tiktokErrorCode(body)
  if (!res.ok || (code && code !== 'ok')) {
    console.warn(`[social-tiktok] ${step} failed status=${res.status} code=${code ?? '-'}`)
    return { ok: false, error: { status: res.status, code } }
  }
  const b = (body ?? {}) as Record<string, unknown>
  // OAuth token responses are flat; Open API responses wrap the payload in `data`.
  return { ok: true, data: ('data' in b ? b.data : b) as T }
}

function required<T>(step: string, r: TikTokResult<T>): T {
  if (!r.ok) throw new MetaCallError(step, { status: r.error.status, code: null, subcode: null, type: r.error.code })
  return r.data
}

export function buildTikTokAuthorizeUrl(cfg: PlatformOAuthConfig, state: string): string {
  return query(TIKTOK_OAUTH_AUTHORIZE_URL, {
    client_key: cfg.appId,
    scope: TIKTOK_SCOPES.join(','),
    response_type: 'code',
    redirect_uri: cfg.redirectUri,
    state,
    // Let the editor pick the right TikTok account (not a stale web session).
    disable_auto_auth: '1',
  })
}

/** Comma-separated `scope` from a token response → list (null when absent). */
export function parseTikTokScopes(scope: unknown): string[] | null {
  if (typeof scope !== 'string' || !scope.trim()) return null
  return [...new Set(scope.split(',').map((s) => s.trim()).filter(Boolean))]
}

export interface TikTokTokenSet {
  accessToken: string
  /** Access token expiry (ms). */
  accessExpiresAt: number | null
  refreshToken: string
  /** Refresh token expiry (ms) — TikTok returns refresh_expires_in. */
  refreshExpiresAt: number | null
  openId: string
  scopes: string[] | null
}

type TokenBody = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  refresh_expires_in?: number
  open_id?: string
  scope?: string
}

function tokenSet(r: TokenBody, now: number): TikTokTokenSet {
  const accessToken = r.access_token?.trim() || ''
  const refreshToken = r.refresh_token?.trim() || ''
  const openId = r.open_id?.trim() || ''
  if (!accessToken || !refreshToken) throw new Error('tiktok_no_token')
  if (!TIKTOK_OPEN_ID_RE.test(openId)) throw new Error('tiktok_no_open_id')
  const sec = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? now + v * 1000 : null)
  return {
    accessToken,
    accessExpiresAt: sec(r.expires_in),
    refreshToken,
    refreshExpiresAt: sec(r.refresh_expires_in),
    openId,
    scopes: parseTikTokScopes(r.scope),
  }
}

export async function exchangeTikTokCode(cfg: PlatformOAuthConfig, code: string, now = Date.now(), fetchFn?: FetchFn): Promise<TikTokTokenSet> {
  const r = required(
    'tiktok.code_exchange',
    await tiktokRequest<TokenBody>('tiktok.code_exchange', TIKTOK_OAUTH_TOKEN_URL, {
      form: { client_key: cfg.appId, client_secret: cfg.appSecret, code, grant_type: 'authorization_code', redirect_uri: cfg.redirectUri },
      fetch: fetchFn,
    }),
  )
  return tokenSet(r, now)
}

/**
 * Mint a 24-hour access token from the stored refresh token. The response may
 * carry a NEW refresh token — the caller stores it when it differs.
 * `invalid_grant` / `access_token_invalid` → TikTokRefreshRejectedError (reconnect).
 */
export async function refreshTikTokToken(
  cfg: Pick<PlatformOAuthConfig, 'appId' | 'appSecret'>,
  refreshToken: string,
  now = Date.now(),
  fetchFn?: FetchFn,
): Promise<TikTokTokenSet> {
  const r = await tiktokRequest<TokenBody>('tiktok.refresh_token', TIKTOK_OAUTH_TOKEN_URL, {
    form: { client_key: cfg.appId, client_secret: cfg.appSecret, grant_type: 'refresh_token', refresh_token: refreshToken },
    fetch: fetchFn,
  })
  if (!r.ok) {
    if (r.error.code === 'invalid_grant' || r.error.code === 'access_token_invalid' || r.error.status === 401) throw new TikTokRefreshRejectedError()
    throw new MetaCallError('tiktok.refresh_token', { status: r.error.status, code: null, subcode: null, type: r.error.code })
  }
  return tokenSet(r.data, now)
}

export interface TikTokUserIdentity {
  openId: string
  displayName: string
  avatarUrl: string | null
}

export async function fetchTikTokUser(accessToken: string, fetchFn?: FetchFn): Promise<TikTokUserIdentity> {
  const r = required(
    'tiktok.user_info',
    await tiktokRequest<{ user?: { open_id?: string; display_name?: string; avatar_url?: string } }>(
      'tiktok.user_info',
      query(`${TIKTOK_API_BASE}/user/info/`, { fields: 'open_id,display_name,avatar_url' }),
      { bearer: accessToken, fetch: fetchFn },
    ),
  )
  const u = r.user ?? {}
  const openId = u.open_id?.trim() || ''
  if (!TIKTOK_OPEN_ID_RE.test(openId)) throw new Error('tiktok_no_open_id')
  const avatar = typeof u.avatar_url === 'string' && u.avatar_url.startsWith('https://') ? u.avatar_url : null
  return { openId, displayName: (u.display_name ?? '').trim().slice(0, 200) || 'TikTok', avatarUrl: avatar }
}

export const TIKTOK_PRIVACY_LEVELS = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'] as const
export type TikTokPrivacyLevel = (typeof TIKTOK_PRIVACY_LEVELS)[number]

export function isTikTokPrivacyLevel(v: unknown): v is TikTokPrivacyLevel {
  return typeof v === 'string' && (TIKTOK_PRIVACY_LEVELS as readonly string[]).includes(v)
}

/** Creator info the post dialog MUST show / respect (TikTok Content Sharing Guidelines). */
export interface TikTokCreatorInfo {
  nickname: string
  username: string | null
  avatarUrl: string | null
  privacyLevelOptions: TikTokPrivacyLevel[]
  commentDisabled: boolean
  duetDisabled: boolean
  stitchDisabled: boolean
  maxVideoPostDurationSec: number | null
}

/**
 * Creator info for the post dialog. TikTok returns `spam_risk_*` /
 * `reached_active_user_cap` here when the creator can't post right now — those
 * come back as `{ ok: false, code }` so the dialog can say so and stop.
 */
export async function queryTikTokCreatorInfo(
  accessToken: string,
  fetchFn?: FetchFn,
): Promise<{ ok: true; info: TikTokCreatorInfo } | { ok: false; code: string }> {
  const r = await tiktokRequest<{
    creator_nickname?: string
    creator_username?: string
    creator_avatar_url?: string
    privacy_level_options?: unknown[]
    comment_disabled?: boolean
    duet_disabled?: boolean
    stitch_disabled?: boolean
    max_video_post_duration_sec?: number
  }>('tiktok.creator_info', `${TIKTOK_API_BASE}/post/publish/creator_info/query/`, { json: {}, bearer: accessToken, fetch: fetchFn })
  if (!r.ok) return { ok: false, code: r.error.code ?? `http_${r.error.status}` }
  const d = r.data ?? {}
  const avatar = typeof d.creator_avatar_url === 'string' && d.creator_avatar_url.startsWith('https://') ? d.creator_avatar_url : null
  const max = typeof d.max_video_post_duration_sec === 'number' && d.max_video_post_duration_sec > 0 ? Math.floor(d.max_video_post_duration_sec) : null
  return {
    ok: true,
    info: {
      nickname: (d.creator_nickname ?? '').trim().slice(0, 200) || 'TikTok',
      username: (d.creator_username ?? '').trim().slice(0, 100) || null,
      avatarUrl: avatar,
      privacyLevelOptions: (Array.isArray(d.privacy_level_options) ? d.privacy_level_options : []).filter(isTikTokPrivacyLevel),
      commentDisabled: d.comment_disabled === true,
      duetDisabled: d.duet_disabled === true,
      stitchDisabled: d.stitch_disabled === true,
      maxVideoPostDurationSec: max,
    },
  }
}

/**
 * Refresh + persist: mint an access token from the stored refresh token and,
 * when TikTok rotated it, store the new refresh token (encrypted) and its
 * expiry. Used by the publish resolver and «Bağlantıyı kontrol et».
 */
export async function refreshAndStoreTikTokToken(
  accountId: string,
  expectedOpenId: string,
  storedRefreshToken: string,
  cfg: Pick<PlatformOAuthConfig, 'appId' | 'appSecret'>,
  now = Date.now(),
): Promise<TikTokTokenSet> {
  const t = await refreshTikTokToken(cfg, storedRefreshToken, now)
  if (t.openId !== expectedOpenId) throw new Error('tiktok_open_id_mismatch')
  if (t.refreshToken !== storedRefreshToken) {
    const [{ saveEncryptedAccessToken }, { getAdminFirestore }, { Collections }] = await Promise.all([
      import('../secretStore'),
      import('@/lib/firebase/admin'),
      import('@/lib/firebase/collections'),
    ])
    await saveEncryptedAccessToken(accountId, t.refreshToken, 'tiktok_refresh')
    await getAdminFirestore()
      .collection(Collections.SOCIAL_ACCOUNTS)
      .doc(accountId)
      .update({ tokenExpiresAt: t.refreshExpiresAt, tokenExpiryVerified: t.refreshExpiresAt !== null, tokenRefreshedAt: now })
      .catch(() => undefined)
  }
  return t
}
