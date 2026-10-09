/**
 * Instagram API with Instagram Login — uses the Instagram App ID/secret and
 * graph.instagram.com (never the Facebook Graph host).
 */
import 'server-only'
import {
  INSTAGRAM_LOGIN_GRAPH_BASE,
  INSTAGRAM_LONG_LIVED_TOKEN_URL,
  INSTAGRAM_OAUTH_AUTHORIZE_URL,
  INSTAGRAM_OAUTH_TOKEN_URL,
} from '../../graphConfig'
import { REQUIRED_PUBLISH_PERMISSIONS } from '../types'
import { metaRequired, query } from './metaHttp'
import type { PlatformOAuthConfig } from './oauthConfig'

export const INSTAGRAM_LOGIN_SCOPES = REQUIRED_PUBLISH_PERMISSIONS.instagram_login
/** Professional account types that can publish via the API. */
export const INSTAGRAM_PROFESSIONAL_TYPES = ['BUSINESS', 'MEDIA_CREATOR'] as const

export function buildInstagramAuthorizeUrl(cfg: PlatformOAuthConfig, state: string): string {
  return query(INSTAGRAM_OAUTH_AUTHORIZE_URL, {
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: INSTAGRAM_LOGIN_SCOPES.join(','),
    state,
  })
}

/** Short-lived exchange. Response may be `{data:[{…}]}` or flat; permissions is a comma string. */
export async function exchangeInstagramCode(
  cfg: PlatformOAuthConfig,
  code: string,
): Promise<{ shortToken: string; permissions: string[] | null }> {
  const r = await metaRequired<Record<string, unknown>>('instagram.code_exchange', INSTAGRAM_OAUTH_TOKEN_URL, {
    method: 'POST',
    form: {
      client_id: cfg.appId,
      client_secret: cfg.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: cfg.redirectUri,
      code,
    },
  })
  const row = (Array.isArray(r.data) ? r.data[0] : r) as Record<string, unknown> | undefined
  const shortToken = typeof row?.access_token === 'string' ? row.access_token : ''
  if (!shortToken) throw new Error('instagram_no_token')
  const perms = row?.permissions
  const permissions =
    typeof perms === 'string'
      ? perms.split(',').map((p) => p.trim()).filter(Boolean)
      : Array.isArray(perms)
        ? perms.filter((p): p is string => typeof p === 'string')
        : null
  return { shortToken, permissions }
}

export async function exchangeInstagramLongLived(
  cfg: PlatformOAuthConfig,
  shortToken: string,
  now: number,
): Promise<{ token: string; expiresAt: number | null }> {
  const r = await metaRequired<{ access_token?: string; expires_in?: number }>(
    'instagram.long_lived',
    query(INSTAGRAM_LONG_LIVED_TOKEN_URL, {
      grant_type: 'ig_exchange_token',
      client_secret: cfg.appSecret,
      access_token: shortToken,
    }),
  )
  if (!r.access_token) throw new Error('instagram_no_token')
  return {
    token: r.access_token,
    expiresAt: typeof r.expires_in === 'number' && r.expires_in > 0 ? now + r.expires_in * 1000 : null,
  }
}

export async function fetchInstagramProfile(token: string): Promise<{
  igUserId: string
  username: string | null
  name: string | null
  accountType: string | null
}> {
  const r = await metaRequired<{ user_id?: string | number; username?: string; name?: string; account_type?: string }>(
    'instagram.me',
    query(`${INSTAGRAM_LOGIN_GRAPH_BASE}/me`, { fields: 'user_id,username,name,account_type', access_token: token }),
  )
  const igUserId = r.user_id != null ? String(r.user_id) : ''
  if (!/^[0-9]{1,40}$/.test(igUserId)) throw new Error('instagram_no_user_id')
  return {
    igUserId,
    username: r.username ?? null,
    name: r.name ?? null,
    accountType: r.account_type ? String(r.account_type).toUpperCase() : null,
  }
}

export function isInstagramProfessional(accountType: string | null): boolean {
  return !!accountType && (INSTAGRAM_PROFESSIONAL_TYPES as readonly string[]).includes(accountType)
}
