/**
 * Gmail OAuth scopes — server + tests.
 * Mail Kutusu is read-only. Do not add modify/send unless the UI needs it.
 */
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

/** OpenID claims so we can verify the connected account is GMAIL_MAILBOX. */
export const GMAIL_IDENTITY_SCOPES = ['openid', 'email'] as const

export const GMAIL_OAUTH_SCOPES = [GMAIL_READONLY_SCOPE, ...GMAIL_IDENTITY_SCOPES] as const

export function hasGmailReadonlyScope(scope: string | undefined | null): boolean {
  const s = (scope ?? '').toLowerCase()
  return s.includes('gmail.readonly')
}
