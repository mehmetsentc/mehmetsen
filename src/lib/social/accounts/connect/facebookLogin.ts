/**
 * Facebook Login (Pages) connection — central Meta app.
 * Authorize → code → short user token → long-lived user token →
 * /me/permissions (real grant check) → /me/accounts (paged) → user selects a page
 * → page token fetched server-side and verified with /debug_token.
 */
import 'server-only'
import { FACEBOOK_GRAPH_BASE, FACEBOOK_OAUTH_DIALOG_BASE } from '../../graphConfig'
import { REQUIRED_PUBLISH_PERMISSIONS } from '../types'
import { metaRequired, metaRequest, query } from './metaHttp'
import type { PlatformOAuthConfig } from './oauthConfig'

/**
 * Requested in the login dialog (scope flow). `business_management` is NOT a
 * publish requirement and is never checked as required: it is requested only
 * because Pages a person manages through a business portfolio (Meta Business
 * Suite, task-based access) are left out of /me/accounts without it — the API
 * then answers 200 with an empty list. Pages with a direct role are listed
 * either way, so declining it does not block the connection.
 */
export const FACEBOOK_OPTIONAL_LOGIN_SCOPES = ['business_management'] as const
export const FACEBOOK_LOGIN_SCOPES = [...REQUIRED_PUBLISH_PERMISSIONS.facebook_login, ...FACEBOOK_OPTIONAL_LOGIN_SCOPES]
/** Page task required to publish (Pages API). */
export const FACEBOOK_REQUIRED_PAGE_TASK = 'CREATE_CONTENT'
export const FACEBOOK_PAGES_PER_REQUEST = 100
export const FACEBOOK_MAX_PAGE_REQUESTS = 10

export function buildFacebookAuthorizeUrl(cfg: PlatformOAuthConfig, state: string, rerequest = false): string {
  const params: Record<string, string> = {
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    state,
    response_type: 'code',
  }
  if (cfg.facebookLoginConfigId) {
    // Facebook Login for Business: permissions come from the configuration.
    // Server-side code flow → force response_type=code over the config default.
    params.config_id = cfg.facebookLoginConfigId
    params.override_default_response_type = 'true'
  } else {
    params.scope = FACEBOOK_LOGIN_SCOPES.join(',')
    if (rerequest) params.auth_type = 'rerequest'
  }
  return query(FACEBOOK_OAUTH_DIALOG_BASE, params)
}

export async function exchangeFacebookCode(
  cfg: PlatformOAuthConfig,
  code: string,
  now: number,
): Promise<{ userToken: string; expiresAt: number | null }> {
  const short = await metaRequired<{ access_token?: string }>(
    'facebook.code_exchange',
    query(`${FACEBOOK_GRAPH_BASE}/oauth/access_token`, {
      client_id: cfg.appId,
      client_secret: cfg.appSecret,
      redirect_uri: cfg.redirectUri,
      code,
    }),
  )
  if (!short.access_token) throw new Error('facebook_no_token')
  const long = await metaRequired<{ access_token?: string; expires_in?: number }>(
    'facebook.long_lived',
    query(`${FACEBOOK_GRAPH_BASE}/oauth/access_token`, {
      grant_type: 'fb_exchange_token',
      client_id: cfg.appId,
      client_secret: cfg.appSecret,
      fb_exchange_token: short.access_token,
    }),
  )
  if (!long.access_token) throw new Error('facebook_no_token')
  return {
    userToken: long.access_token,
    expiresAt: typeof long.expires_in === 'number' && long.expires_in > 0 ? now + long.expires_in * 1000 : null,
  }
}

export async function fetchFacebookPermissions(
  userToken: string,
): Promise<{ granted: string[]; declined: string[] }> {
  const r = await metaRequired<{ data?: Array<{ permission?: string; status?: string }> }>(
    'facebook.permissions',
    query(`${FACEBOOK_GRAPH_BASE}/me/permissions`, { access_token: userToken }),
  )
  const granted: string[] = []
  const declined: string[] = []
  for (const p of r.data ?? []) {
    if (!p.permission) continue
    if (p.status === 'granted') granted.push(p.permission)
    else declined.push(p.permission)
  }
  return { granted, declined }
}

export interface FacebookPageCandidate {
  id: string
  name: string
  tasks: string[]
  eligible: boolean
}

/** All pages the user can manage, following cursor pagination (bounded). */
export async function listFacebookPages(userToken: string): Promise<{ pages: FacebookPageCandidate[]; truncated: boolean }> {
  const pages: FacebookPageCandidate[] = []
  let after: string | null = null
  for (let i = 0; i < FACEBOOK_MAX_PAGE_REQUESTS; i++) {
    const params: Record<string, string> = {
      fields: 'id,name,tasks',
      limit: String(FACEBOOK_PAGES_PER_REQUEST),
      access_token: userToken,
    }
    if (after) params.after = after
    const r = await metaRequired<{
      data?: Array<{ id?: string; name?: string; tasks?: string[] }>
      paging?: { cursors?: { after?: string }; next?: string }
    }>('facebook.accounts', query(`${FACEBOOK_GRAPH_BASE}/me/accounts`, params))
    for (const p of r.data ?? []) {
      if (!p.id || !/^[0-9]{1,30}$/.test(p.id)) continue
      const tasks = Array.isArray(p.tasks) ? p.tasks.filter((t) => typeof t === 'string') : []
      pages.push({ id: p.id, name: (p.name ?? p.id).slice(0, 200), tasks, eligible: tasks.includes(FACEBOOK_REQUIRED_PAGE_TASK) })
    }
    // Rebuild the next request from the cursor — never follow `paging.next` (it embeds the token).
    const nextAfter = r.paging?.next ? r.paging?.cursors?.after : undefined
    if (!nextAfter) return { pages, truncated: false }
    after = nextAfter
  }
  return { pages, truncated: true }
}

/** Fetch the page token for a page the user selected, using the user token. */
export async function fetchFacebookPageToken(
  userToken: string,
  pageId: string,
): Promise<{ id: string; name: string; accessToken: string; tasks: string[] }> {
  const r = await metaRequired<{ id?: string; name?: string; access_token?: string; tasks?: string[] }>(
    'facebook.page',
    query(`${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(pageId)}`, { fields: 'id,name,access_token,tasks', access_token: userToken }),
  )
  if (r.id !== pageId || !r.access_token) throw new Error('facebook_page_mismatch')
  return { id: r.id, name: r.name ?? r.id, accessToken: r.access_token, tasks: Array.isArray(r.tasks) ? r.tasks : [] }
}

/**
 * Verify a page token with /debug_token (app access token). Returns the real
 * expiry (null = never expires) or null when it could not be verified.
 */
export async function debugFacebookPageToken(
  cfg: PlatformOAuthConfig,
  pageToken: string,
  pageId: string,
  now: number,
): Promise<{ valid: boolean; expiresAt: number | null; verified: boolean }> {
  const r = await metaRequest<{
    data?: { is_valid?: boolean; type?: string; profile_id?: string; expires_at?: number; app_id?: string }
  }>(
    'facebook.debug_token',
    query(`${FACEBOOK_GRAPH_BASE}/debug_token`, { input_token: pageToken, access_token: `${cfg.appId}|${cfg.appSecret}` }),
  )
  if (!r.ok || !r.data.data) return { valid: true, expiresAt: null, verified: false }
  const d = r.data.data
  const valid =
    d.is_valid === true &&
    (!d.type || d.type.toUpperCase() === 'PAGE') &&
    (!d.profile_id || d.profile_id === pageId) &&
    (!d.app_id || d.app_id === cfg.appId)
  // expires_at = 0 → the page token does not expire.
  const exp = typeof d.expires_at === 'number' && d.expires_at > 0 ? d.expires_at * 1000 : null
  return { valid: valid && (exp === null || exp > now), expiresAt: exp, verified: true }
}
