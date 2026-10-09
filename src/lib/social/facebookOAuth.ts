/**
 * Facebook Login OAuth helpers for BYO (custom) apps.
 * Global app OAuth / manual token paste remains available via /api/admin/social/token.
 */
import 'server-only'
import { platformError } from './safeLog'
import { encryptSecret, decryptSecret } from '@/lib/crypto/secretCrypto'
import { getSiteUrl } from '@/lib/seo'
import { FACEBOOK_GRAPH_BASE, FACEBOOK_OAUTH_DIALOG_BASE } from './graphConfig'

const GRAPH = FACEBOOK_GRAPH_BASE

export const FACEBOOK_BYO_SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_manage_metadata',
  'business_management',
].join(',')

export function facebookAppOAuthRedirectUri(): string {
  return `${getSiteUrl()}/api/admin/social/facebook-app/callback`
}

export async function buildFacebookOAuthState(payload: {
  siteId: string
  uid: string
}): Promise<string> {
  const raw = `${payload.siteId}:${payload.uid}:${Date.now()}`
  return encryptSecret(raw)
}

export async function parseFacebookOAuthState(
  state: string,
): Promise<{ siteId: string; uid: string; ts: number } | null> {
  try {
    const raw = await decryptSecret(state)
    const [siteId, uid, tsStr] = raw.split(':')
    const ts = Number(tsStr)
    if (!siteId || !uid || !Number.isFinite(ts)) return null
    // 30 min window
    if (Date.now() - ts > 30 * 60 * 1000) return null
    return { siteId, uid, ts }
  } catch {
    return null
  }
}

export function buildFacebookLoginUrl(appId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: facebookAppOAuthRedirectUri(),
    state,
    scope: FACEBOOK_BYO_SCOPES,
    response_type: 'code',
  })
  return `${FACEBOOK_OAUTH_DIALOG_BASE}?${params.toString()}`
}

export async function exchangeCodeForUserToken(params: {
  appId: string
  appSecret: string
  code: string
}): Promise<string> {
  const q = new URLSearchParams({
    client_id: params.appId,
    client_secret: params.appSecret,
    redirect_uri: facebookAppOAuthRedirectUri(),
    code: params.code,
  })
  const res = await fetch(`${GRAPH}/oauth/access_token?${q.toString()}`)
  const json = (await res.json()) as { access_token?: string; error?: { message?: string } }
  if (!res.ok || !json.access_token) {
    throw platformError('facebook', 'OAuth kod değişimi', res.status, json)
  }
  return json.access_token
}

export async function exchangeForLongLivedUserToken(params: {
  appId: string
  appSecret: string
  shortLivedToken: string
}): Promise<string> {
  const q = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: params.appId,
    client_secret: params.appSecret,
    fb_exchange_token: params.shortLivedToken,
  })
  const res = await fetch(`${GRAPH}/oauth/access_token?${q.toString()}`)
  const json = (await res.json()) as { access_token?: string; error?: { message?: string } }
  if (!res.ok || !json.access_token) {
    throw platformError('facebook', 'uzun ömürlü token değişimi', res.status, json)
  }
  return json.access_token
}

export async function fetchPageAccessToken(params: {
  userToken: string
  preferredPageId?: string | null
}): Promise<{ pageId: string; pageName: string; accessToken: string }> {
  const res = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(params.userToken)}`,
  )
  const json = (await res.json()) as {
    data?: Array<{ id?: string; name?: string; access_token?: string }>
    error?: { message?: string }
  }
  if (!res.ok || json.error) {
    throw platformError('facebook', 'sayfa listesi', res.status, json)
  }
  const pages = (json.data ?? []).filter((p) => p.id && p.access_token)
  if (pages.length === 0) {
    throw new Error('Bu kullanıcıda yönetilebilir Facebook Sayfası bulunamadı')
  }

  const preferred = params.preferredPageId?.trim()
  const match = preferred
    ? pages.find((p) => p.id === preferred)
    : undefined
  const chosen = match ?? pages[0]
  return {
    pageId: chosen.id!,
    pageName: chosen.name ?? chosen.id!,
    accessToken: chosen.access_token!,
  }
}
