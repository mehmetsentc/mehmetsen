/**
 * Google OAuth + YouTube channel identity for YouTube connections.
 *
 * - Scopes: youtube.upload + youtube.readonly only (types.ts). Nothing broader.
 * - `access_type=offline` + `prompt=consent` → Google returns a REFRESH token on
 *   every consent; that refresh token is the only thing NaHaber stores
 *   (encrypted, tokenType `youtube_refresh`). Access tokens live ~1 hour and are
 *   minted at publish / check time, never stored.
 * - Granted scopes come from the token response `scope` field (a platform
 *   response) — never inferred from what was requested.
 * - Error bodies are reduced to a short Google reason (`invalid_grant`,
 *   `quotaExceeded` …). URLs, codes, tokens and secrets are never logged.
 */
import 'server-only'
import { GOOGLE_OAUTH_AUTHORIZE_URL, GOOGLE_OAUTH_TOKEN_URL, YOUTUBE_API_BASE } from '../../graphConfig'
import { REQUIRED_PUBLISH_PERMISSIONS } from '../types'
import { MetaCallError, query } from './metaHttp'
import type { PlatformOAuthConfig } from './oauthConfig'

export const YOUTUBE_SCOPES = REQUIRED_PUBLISH_PERMISSIONS.google_oauth

/** YouTube channel id: `UC` + 22 url-safe chars. */
export const YOUTUBE_CHANNEL_ID_RE = /^UC[0-9A-Za-z_-]{22}$/

export interface GoogleErrorInfo {
  status: number
  /** Short machine reason from Google (`invalid_grant`, `quotaExceeded`, `forbidden` …) or null. */
  reason: string | null
}

export type GoogleResult<T> = { ok: true; data: T } | { ok: false; error: GoogleErrorInfo }

/** Refresh token revoked / expired (incl. the 7-day limit of apps in «Testing»). */
export class GoogleRefreshRejectedError extends Error {
  readonly code = 'refresh_rejected'
  constructor() {
    super('google_refresh_rejected')
  }
}

const REASON_RE = /^[A-Za-z_]{1,64}$/

/** Reduce a Google error body to a short safe reason (never the description / message text). */
export function googleErrorReason(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  // OAuth endpoint: { error: 'invalid_grant', error_description: '…' }
  if (typeof b.error === 'string') return REASON_RE.test(b.error) ? b.error : null
  // Data API: { error: { code, message, errors: [{ reason }], status } }
  if (b.error && typeof b.error === 'object') {
    const e = b.error as Record<string, unknown>
    const first = Array.isArray(e.errors) ? (e.errors[0] as Record<string, unknown> | undefined) : undefined
    const reason = typeof first?.reason === 'string' ? first.reason : typeof e.status === 'string' ? e.status : null
    return reason && REASON_RE.test(reason) ? reason : null
  }
  return null
}

export async function googleRequest<T>(
  step: string,
  url: string,
  init?: { method?: 'GET' | 'POST'; form?: Record<string, string>; bearer?: string },
): Promise<GoogleResult<T>> {
  let res: Response
  try {
    const headers: Record<string, string> = {}
    if (init?.form) headers['Content-Type'] = 'application/x-www-form-urlencoded'
    if (init?.bearer) headers.Authorization = `Bearer ${init.bearer}`
    res = await fetch(url, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.form ? new URLSearchParams(init.form).toString() : undefined,
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    console.warn(`[social-connect] ${step} network_error`)
    return { ok: false, error: { status: 0, reason: 'network' } }
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    const reason = googleErrorReason(body)
    console.warn(`[social-connect] ${step} failed status=${res.status} reason=${reason ?? '-'}`)
    return { ok: false, error: { status: res.status, reason } }
  }
  return { ok: true, data: body as T }
}

function required<T>(step: string, r: GoogleResult<T>): T {
  if (!r.ok) throw new MetaCallError(step, { status: r.error.status, code: null, subcode: null, type: r.error.reason })
  return r.data
}

export function buildGoogleAuthorizeUrl(cfg: PlatformOAuthConfig, state: string): string {
  return query(GOOGLE_OAUTH_AUTHORIZE_URL, {
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: YOUTUBE_SCOPES.join(' '),
    // Refresh token on every consent (also on «yeniden bağla»).
    access_type: 'offline',
    // consent: always issue a refresh token; select_account: let the user pick the
    // Google identity / brand account that owns the YouTube channel.
    prompt: 'consent select_account',
    include_granted_scopes: 'false',
    state,
  })
}

/** Space-separated `scope` from a token response → list (null when absent). */
export function parseGrantedScopes(scope: unknown): string[] | null {
  if (typeof scope !== 'string' || !scope.trim()) return null
  return [...new Set(scope.trim().split(/\s+/))]
}

export async function exchangeGoogleCode(
  cfg: PlatformOAuthConfig,
  code: string,
): Promise<{ accessToken: string; refreshToken: string | null; scopes: string[] | null }> {
  const r = required(
    'youtube.code_exchange',
    await googleRequest<{ access_token?: string; refresh_token?: string; scope?: string }>('youtube.code_exchange', GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      form: {
        client_id: cfg.appId,
        client_secret: cfg.appSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: cfg.redirectUri,
      },
    }),
  )
  if (!r.access_token) throw new Error('youtube_no_token')
  return { accessToken: r.access_token, refreshToken: r.refresh_token?.trim() || null, scopes: parseGrantedScopes(r.scope) }
}

/**
 * Mint a short-lived access token from the stored refresh token.
 * `invalid_grant` (revoked, expired, password change, 7-day «Testing» limit)
 * → GoogleRefreshRejectedError so callers can move the account to needs_reauth.
 */
export async function refreshGoogleAccessToken(
  cfg: Pick<PlatformOAuthConfig, 'appId' | 'appSecret'>,
  refreshToken: string,
): Promise<{ accessToken: string; scopes: string[] | null }> {
  const r = await googleRequest<{ access_token?: string; scope?: string }>('youtube.refresh_token', GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    form: { client_id: cfg.appId, client_secret: cfg.appSecret, refresh_token: refreshToken, grant_type: 'refresh_token' },
  })
  if (!r.ok) {
    if (r.error.reason === 'invalid_grant') throw new GoogleRefreshRejectedError()
    throw new MetaCallError('youtube.refresh_token', { status: r.error.status, code: null, subcode: null, type: r.error.reason })
  }
  if (!r.data.access_token) throw new Error('youtube_no_token')
  return { accessToken: r.data.access_token, scopes: parseGrantedScopes(r.data.scope) }
}

export interface YouTubeChannelIdentity {
  channelId: string
  title: string
  /** `@handle` when the channel has one. */
  handle: string | null
}

/** Channels of the authorized identity (`mine=true`). Exactly one is expected. */
export async function fetchMyYouTubeChannels(accessToken: string): Promise<YouTubeChannelIdentity[]> {
  const r = required(
    'youtube.channel',
    await googleRequest<{ items?: Array<{ id?: string; snippet?: { title?: string; customUrl?: string } }> }>(
      'youtube.channel',
      query(`${YOUTUBE_API_BASE}/channels`, { part: 'snippet', mine: 'true', maxResults: '5' }),
      { bearer: accessToken },
    ),
  )
  const out: YouTubeChannelIdentity[] = []
  for (const it of r.items ?? []) {
    const id = typeof it.id === 'string' ? it.id : ''
    if (!YOUTUBE_CHANNEL_ID_RE.test(id)) continue
    const custom = it.snippet?.customUrl?.trim() || ''
    out.push({
      channelId: id,
      title: (it.snippet?.title ?? '').trim().slice(0, 200) || id,
      handle: custom ? (custom.startsWith('@') ? custom : `@${custom}`).slice(0, 100) : null,
    })
  }
  return out
}
