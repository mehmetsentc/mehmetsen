export const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify'
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
export const GMAIL_IDENTITY_SCOPES = ['openid', 'email'] as const

/** Full scopes requested at OAuth time */
export const GMAIL_OAUTH_SCOPES = [
  GMAIL_MODIFY_SCOPE,
  GMAIL_SEND_SCOPE,
  ...GMAIL_IDENTITY_SCOPES,
] as const

/** Minimum scope needed to read messages */
export function hasGmailReadonlyScope(scope: string | undefined | null): boolean {
  if (!scope) return false
  return (
    scope.includes(GMAIL_MODIFY_SCOPE) ||
    scope.includes(GMAIL_READONLY_SCOPE) ||
    scope.includes('https://mail.google.com/')
  )
}

/** Required to remove UNREAD (mark as read) and move/delete labels */
export function hasGmailModifyScope(scope: string | undefined | null): boolean {
  if (!scope) return false
  return scope.includes(GMAIL_MODIFY_SCOPE) || scope.includes('https://mail.google.com/')
}

export function hasGmailSendScope(scope: string | undefined | null): boolean {
  if (!scope) return false
  return (
    scope.includes(GMAIL_SEND_SCOPE) ||
    scope.includes('https://mail.google.com/')
  )
}
