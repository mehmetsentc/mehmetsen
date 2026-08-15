/**
 * Gmail OAuth 2.0 — server-only.
 * Authorization-code exchange + token refresh via direct fetch to Google.
 * Separate from Firebase "Sign in with Google".
 */
import 'server-only'
import { CANONICAL_PRODUCTION_URL, getSiteUrl } from '@/lib/seo'
import { GMAIL_OAUTH_SCOPES, hasGmailReadonlyScope } from './scopes'
import { GmailError, gmailErrorFromGoogleHttp } from './errors'
import { buildGoogleAuthorizationUrl } from './oauthUrl'

const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke'
const GOOGLE_USERINFO = 'https://www.googleapis.com/oauth2/v2/userinfo'

// ── Config ────────────────────────────────────────────────────────────────

export interface GmailOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  mailbox: string
}

export function getGmailOAuthConfig(): GmailOAuthConfig {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim() ?? ''
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim() ?? ''
  const mailbox = process.env.GMAIL_MAILBOX?.trim() || 'bilgi@nahaber.com'
  const redirectUri =
    process.env.GMAIL_REDIRECT_URI?.trim() ||
    `${process.env.VERCEL_ENV === 'production' ? CANONICAL_PRODUCTION_URL : getSiteUrl()}/api/admin/gmail/callback`

  if (!clientId || !clientSecret || !redirectUri) {
    throw new GmailError('CONFIGURATION_ERROR', { detail: 'missing_client_or_redirect' })
  }
  return { clientId, clientSecret, redirectUri, mailbox }
}

/** Returns true if OAuth client credentials are present in environment. */
export function isGmailOAuthConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_CLIENT_ID?.trim() &&
      process.env.GMAIL_CLIENT_SECRET?.trim() &&
      (process.env.GMAIL_REDIRECT_URI?.trim() || getSiteUrl()),
  )
}

/** Returns true if the AES-256-GCM token encryption key is present and long enough. */
export function isGmailEncryptionConfigured(): boolean {
  const hex = process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim() ?? ''
  return hex.length >= 64
}

// ── Auth URL ──────────────────────────────────────────────────────────────

export function buildAuthUrl(state: string, opts?: { forceConsent?: boolean }): string {
  const cfg = getGmailOAuthConfig()
  return buildGoogleAuthorizationUrl({
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    state,
    loginHint: cfg.mailbox,
    forceConsent: opts?.forceConsent !== false, // default: force consent
  })
}

// ── Token types ───────────────────────────────────────────────────────────

export interface TokenSet {
  accessToken: string
  refreshToken?: string  // absent when Google deems prior grant sufficient (unlikely with prompt=consent)
  expiresAt: number
  scope: string
  tokenType: string
  email?: string
}

// ── Token exchange helpers ────────────────────────────────────────────────

async function readGoogleTokenResponse(res: Response): Promise<Record<string, unknown>> {
  const body = await res.text()
  if (!res.ok) {
    throw gmailErrorFromGoogleHttp(res.status, body)
  }
  try {
    return JSON.parse(body) as Record<string, unknown>
  } catch {
    throw new GmailError('GOOGLE_API_ERROR', { detail: 'token_json_parse' })
  }
}

function emailFromIdToken(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined
  try {
    const segment = idToken.split('.')[1] ?? ''
    const payload = JSON.parse(Buffer.from(segment, 'base64url').toString()) as { email?: string }
    return payload.email
  } catch {
    return undefined
  }
}

async function emailFromUserinfo(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    if (!res.ok) return undefined
    const json = (await res.json()) as { email?: string }
    return json.email
  } catch {
    return undefined
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Exchange an authorization code for tokens.
 * Validates that gmail.readonly scope was granted.
 * refresh_token may be absent if the user previously authorized without prompt=consent.
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const cfg = getGmailOAuthConfig()
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  })

  const json = await readGoogleTokenResponse(res)
  const accessToken = typeof json.access_token === 'string' ? json.access_token : ''
  const refreshToken = typeof json.refresh_token === 'string' ? json.refresh_token : undefined
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600
  const scope = typeof json.scope === 'string' ? json.scope : GMAIL_OAUTH_SCOPES.join(' ')
  const idToken = typeof json.id_token === 'string' ? json.id_token : undefined

  if (!accessToken) {
    throw new GmailError('GOOGLE_API_ERROR', { detail: 'no_access_token' })
  }
  if (!hasGmailReadonlyScope(scope)) {
    throw new GmailError('INSUFFICIENT_SCOPE', { detail: 'missing_gmail_readonly' })
  }

  const email = emailFromIdToken(idToken) ?? (await emailFromUserinfo(accessToken))

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scope,
    tokenType: typeof json.token_type === 'string' ? json.token_type : 'Bearer',
    email,
  }
}

/**
 * Use a stored refresh token to obtain a fresh access token.
 * Propagates INVALID_GRANT so callers can detect expired refresh tokens.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number; scope?: string }> {
  const cfg = getGmailOAuthConfig()
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  })

  try {
    const json = await readGoogleTokenResponse(res)
    const accessToken = typeof json.access_token === 'string' ? json.access_token : ''
    if (!accessToken) {
      throw new GmailError('TOKEN_REFRESH_FAILED', { detail: 'no_access_token' })
    }
    const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600
    return {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
      scope: typeof json.scope === 'string' ? json.scope : undefined,
    }
  } catch (err) {
    if (err instanceof GmailError) {
      // Re-wrap auth errors as INVALID_GRANT so callers can detect reconnect need
      if (err.code === 'RECONNECT_REQUIRED') {
        throw new GmailError('INVALID_GRANT', { cause: err, detail: 'refresh_failed' })
      }
      throw err
    }
    throw new GmailError('TOKEN_REFRESH_FAILED', { cause: err })
  }
}

/**
 * Best-effort token revocation at Google.
 * Call before deleting local credentials; non-fatal if it fails.
 */
export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(GOOGLE_REVOKE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      cache: 'no-store',
    })
  } catch {
    // Non-fatal: local disconnect still proceeds
  }
}
