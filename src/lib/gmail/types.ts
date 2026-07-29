/**
 * Gmail OAuth Integration — Type Definitions
 * bilgi@nahaber.com newsroom inbox
 */

export interface GmailTokens {
  accessToken: string
  refreshToken: string // stored encrypted in Firestore
  expiresAt: number   // unix ms
  scope: string
  tokenType: string
}

export interface GmailIntegration {
  connectedAt: number          // unix ms
  connectedBy: string          // CMS user uid
  accountEmail: string         // must equal GMAIL_MAILBOX
  encryptedRefreshToken: string
  accessToken: string
  expiresAt: number
  scope: string
}

export interface GmailMessageSummary {
  id: string
  threadId: string
  subject: string
  from: string
  date: string         // ISO string
  snippet: string
  hasAttachments: boolean
  labelIds: string[]
}

export interface GmailMessageDetail extends GmailMessageSummary {
  body: string         // decoded plain-text or HTML body
  toRecipients: string[]
}
