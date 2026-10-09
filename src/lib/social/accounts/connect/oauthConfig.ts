/**
 * Central Meta app configuration for social account connections.
 *
 * Three SEPARATE credential pairs (Meta issues them separately):
 *   - Facebook Login (Pages):  SOCIAL_FB_APP_ID / SOCIAL_FB_APP_SECRET
 *       = Meta App ID / App Secret (App settings → Basic)
 *   - Instagram Login:         SOCIAL_IG_APP_ID / SOCIAL_IG_APP_SECRET
 *       = Instagram App ID / Instagram App Secret
 *         (Instagram → API setup with Instagram login → Business login settings)
 *         — NOT the Meta App ID.
 *   - Threads:                 SOCIAL_THREADS_APP_ID / SOCIAL_THREADS_APP_SECRET
 *       = Threads App ID / Threads App Secret (Threads use case)
 *
 * Callback base: SOCIAL_OAUTH_BASE_URL (optional) → else NEXT_PUBLIC_APP_URL via
 * getSiteUrl(). Never derived from the request Host header. Must be https
 * (http allowed only for localhost outside production).
 *
 * Also required: SECRET_ENCRYPTION_KEY (token encryption) and
 * CMS_SESSION_SECRET (callback ↔ NaHaber session binding).
 *
 * Secrets never leave the server; status reports list env var NAMES only.
 */
import 'server-only'
import { getSiteUrl } from '@/lib/seo'
import { hasSecretEncryptionKey } from '@/lib/crypto/secretCrypto'
import type { SocialAccountPlatform } from '../types'

export type ConnectPlatform = SocialAccountPlatform

export const CALLBACK_PATHS: Record<ConnectPlatform, string> = {
  facebook: '/api/admin/social/oauth/facebook/callback',
  instagram: '/api/admin/social/oauth/instagram/callback',
  threads: '/api/admin/social/oauth/threads/callback',
}

const ENV_NAMES: Record<ConnectPlatform, { id: string; secret: string }> = {
  facebook: { id: 'SOCIAL_FB_APP_ID', secret: 'SOCIAL_FB_APP_SECRET' },
  instagram: { id: 'SOCIAL_IG_APP_ID', secret: 'SOCIAL_IG_APP_SECRET' },
  threads: { id: 'SOCIAL_THREADS_APP_ID', secret: 'SOCIAL_THREADS_APP_SECRET' },
}

export interface PlatformOAuthConfig {
  platform: ConnectPlatform
  appId: string
  appSecret: string
  redirectUri: string
  /**
   * Facebook only — Facebook Login for Business configuration id
   * (SOCIAL_FB_LOGIN_CONFIG_ID). When set, the login dialog uses `config_id`
   * instead of `scope` (Meta: config_id replaces scope for Business-type apps).
   * When unset, classic scope-based Facebook Login is used. Never guessed.
   */
  facebookLoginConfigId?: string | null
}

export interface PlatformConfigStatus {
  ready: boolean
  /** Missing / invalid env var names (never values). */
  missing: string[]
  redirectUri: string | null
}

const APP_ID_RE = /^[0-9]{5,25}$/

/** Trusted origin for callbacks. Returns null when not safe to use. */
export function oauthBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.SOCIAL_OAUTH_BASE_URL?.trim() || getSiteUrl()
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.username || u.password || u.search || u.hash || (u.pathname && u.pathname !== '/')) return null
  const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  if (u.protocol === 'https:') return u.origin
  if (u.protocol === 'http:' && isLocal && env.NODE_ENV !== 'production') return u.origin
  return null
}

export function getPlatformConfigStatus(
  platform: ConnectPlatform,
  env: NodeJS.ProcessEnv = process.env,
): PlatformConfigStatus {
  const names = ENV_NAMES[platform]
  const missing: string[] = []
  if (platform === 'facebook') {
    const cfgId = env.SOCIAL_FB_LOGIN_CONFIG_ID?.trim()
    if (cfgId && !APP_ID_RE.test(cfgId)) missing.push('SOCIAL_FB_LOGIN_CONFIG_ID')
  }
  const id = env[names.id]?.trim() || ''
  if (!APP_ID_RE.test(id)) missing.push(names.id)
  if (!env[names.secret]?.trim()) missing.push(names.secret)
  const base = oauthBaseUrl(env)
  if (!base) missing.push('SOCIAL_OAUTH_BASE_URL')
  if (!hasSecretEncryptionKey()) missing.push('SECRET_ENCRYPTION_KEY')
  if (!env.CMS_SESSION_SECRET?.trim()) missing.push('CMS_SESSION_SECRET')
  return { ready: missing.length === 0, missing, redirectUri: base ? `${base}${CALLBACK_PATHS[platform]}` : null }
}

/** Full config for server-side use. Throws when not ready (callers check status first). */
export function getPlatformOAuthConfig(
  platform: ConnectPlatform,
  env: NodeJS.ProcessEnv = process.env,
): PlatformOAuthConfig {
  const status = getPlatformConfigStatus(platform, env)
  if (!status.ready || !status.redirectUri) throw new Error(`oauth_not_configured:${platform}`)
  const names = ENV_NAMES[platform]
  return {
    platform,
    appId: env[names.id]!.trim(),
    appSecret: env[names.secret]!.trim(),
    redirectUri: status.redirectUri,
    facebookLoginConfigId: platform === 'facebook' ? env.SOCIAL_FB_LOGIN_CONFIG_ID?.trim() || null : null,
  }
}

/** Fixed panel return URL — no caller-provided return URLs are accepted. */
export function panelReturnUrl(params: Record<string, string>): string {
  const base = oauthBaseUrl() ?? getSiteUrl()
  const q = new URLSearchParams({ panel: 'accounts', ...params })
  return `${base}/admin/social?${q.toString()}`
}
