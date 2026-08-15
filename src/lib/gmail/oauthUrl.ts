import { GMAIL_OAUTH_SCOPES } from './scopes'

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'

/** Pure Google authorization URL — no secrets, safe to unit test. */
export function buildGoogleAuthorizationUrl(params: {
  clientId: string
  redirectUri: string
  state: string
  loginHint?: string
  forceConsent?: boolean
}): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: GMAIL_OAUTH_SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'false',
    state: params.state,
  })
  if (params.forceConsent) q.set('prompt', 'consent')
  if (params.loginHint) q.set('login_hint', params.loginHint)
  return `${GOOGLE_AUTH}?${q.toString()}`
}
