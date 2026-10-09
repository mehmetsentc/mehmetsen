/**
 * Threads OAuth — uses the Threads App ID/secret (separate from the Meta App ID).
 * Permissions are verified with /debug_token; failure → "unverified", never "granted".
 */
import 'server-only'
import {
  THREADS_GRAPH_BASE,
  THREADS_LONG_LIVED_TOKEN_URL,
  THREADS_OAUTH_AUTHORIZE_URL,
  THREADS_OAUTH_TOKEN_URL,
} from '../../graphConfig'
import { REQUIRED_PUBLISH_PERMISSIONS } from '../types'
import { metaRequest, metaRequired, query } from './metaHttp'
import type { PlatformOAuthConfig } from './oauthConfig'

export const THREADS_SCOPES = REQUIRED_PUBLISH_PERMISSIONS.threads_oauth

export function buildThreadsAuthorizeUrl(cfg: PlatformOAuthConfig, state: string): string {
  return query(THREADS_OAUTH_AUTHORIZE_URL, {
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    scope: THREADS_SCOPES.join(','),
    response_type: 'code',
    state,
  })
}

export async function exchangeThreadsCode(
  cfg: PlatformOAuthConfig,
  code: string,
): Promise<{ shortToken: string; userId: string }> {
  const r = await metaRequired<{ access_token?: string; user_id?: string | number }>('threads.code_exchange', THREADS_OAUTH_TOKEN_URL, {
    method: 'POST',
    form: {
      client_id: cfg.appId,
      client_secret: cfg.appSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: cfg.redirectUri,
    },
  })
  const userId = r.user_id != null ? String(r.user_id) : ''
  if (!r.access_token || !/^[0-9]{1,40}$/.test(userId)) throw new Error('threads_no_token')
  return { shortToken: r.access_token, userId }
}

export async function exchangeThreadsLongLived(
  cfg: PlatformOAuthConfig,
  shortToken: string,
  now: number,
): Promise<{ token: string; expiresAt: number | null }> {
  const r = await metaRequired<{ access_token?: string; expires_in?: number }>(
    'threads.long_lived',
    query(THREADS_LONG_LIVED_TOKEN_URL, { grant_type: 'th_exchange_token', client_secret: cfg.appSecret, access_token: shortToken }),
  )
  if (!r.access_token) throw new Error('threads_no_token')
  return {
    token: r.access_token,
    expiresAt: typeof r.expires_in === 'number' && r.expires_in > 0 ? now + r.expires_in * 1000 : null,
  }
}

export async function fetchThreadsProfile(token: string, userId: string): Promise<{ username: string | null; name: string | null }> {
  const r = await metaRequired<{ id?: string; username?: string; name?: string }>(
    'threads.profile',
    query(`${THREADS_GRAPH_BASE}/${encodeURIComponent(userId)}`, { fields: 'id,username,name', access_token: token }),
  )
  if (String(r.id ?? '') !== userId) throw new Error('threads_profile_mismatch')
  return { username: r.username ?? null, name: r.name ?? null }
}

/** Granted scopes from /debug_token, or null when they could not be verified. */
export async function verifyThreadsScopes(token: string, userId: string): Promise<string[] | null> {
  const r = await metaRequest<{ data?: { is_valid?: boolean; scopes?: string[]; user_id?: string | number } }>(
    'threads.debug_token',
    query(`${THREADS_GRAPH_BASE}/debug_token`, { input_token: token, access_token: token }),
  )
  if (!r.ok || !r.data.data) return null
  const d = r.data.data
  if (d.is_valid !== true) return null
  if (d.user_id != null && String(d.user_id) !== userId) return null
  return Array.isArray(d.scopes) ? d.scopes.filter((s): s is string => typeof s === 'string') : null
}
