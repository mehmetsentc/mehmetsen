/**
 * Gmail OAuth 2.0 helpers — server-only.
 * Uses google-auth-library (already in node_modules).
 */
import 'server-only'
import { OAuth2Client } from 'google-auth-library'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid',
  'email',
  'profile',
]

function getOAuthClient(): OAuth2Client {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const redirectUri = process.env.GMAIL_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('[gmail/oauth] Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REDIRECT_URI')
  }

  return new OAuth2Client({ clientId, clientSecret, redirectUri })
}

/**
 * Build the Google consent-screen URL.
 * state is an opaque CSRF token we'll verify on callback.
 */
export function buildAuthUrl(state: string): string {
  const client = getOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',        // always request refresh_token
    scope: SCOPES,
    state,
    login_hint: process.env.GMAIL_MAILBOX, // pre-fill with bilgi@nahaber.com
  })
}

export interface TokenSet {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scope: string
  tokenType: string
  idToken?: string
  email?: string
}

/**
 * Exchange authorization code for tokens.
 * Returns raw token set (refresh token will be encrypted before storage).
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const client = getOAuthClient()
  const { tokens } = await client.getToken(code)

  if (!tokens.refresh_token) {
    throw new Error('[gmail/oauth] No refresh_token returned — user may have already authorized; revoke access and retry')
  }
  if (!tokens.access_token) {
    throw new Error('[gmail/oauth] No access_token returned')
  }

  let email: string | undefined
  if (tokens.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString())
      email = payload.email
    } catch {
      // non-fatal
    }
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date ?? Date.now() + 3600 * 1000,
    scope: tokens.scope ?? SCOPES.join(' '),
    tokenType: tokens.token_type ?? 'Bearer',
    idToken: tokens.id_token ?? undefined,
    email,
  }
}

/**
 * Use a stored refresh token to get a fresh access token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
  const client = getOAuthClient()
  client.setCredentials({ refresh_token: refreshToken })
  const { credentials } = await client.refreshAccessToken()
  return {
    accessToken: credentials.access_token!,
    expiresAt: credentials.expiry_date ?? Date.now() + 3600 * 1000,
  }
}
