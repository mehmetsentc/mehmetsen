/**
 * Gmail OAuth Integration — Type Definitions
 * bilgi@nahaber.com newsroom inbox
 */
import type { GmailAttachmentMeta } from './mime'

export type { GmailAttachmentMeta }

export interface GmailTokens {
  accessToken: string
  refreshToken: string // stored encrypted in Firestore
  expiresAt: number   // unix ms
  scope: string
  tokenType: string
}

export interface GmailIntegration {
  connectedAt: number           // unix ms
  connectedBy: string           // CMS user uid
  accountEmail: string          // must equal GMAIL_MAILBOX
  encryptedRefreshToken: string
  encryptedAccessToken?: string // new: AES-GCM encrypted
  accessToken?: string          // legacy: plaintext — used on first load until reconnect
  expiresAt: number
  scope: string
}

export interface GmailMessageSummary {
  id: string
  threadId: string
  subject: string
  from: string
  date: string         // RFC 2822 header value
  snippet: string
  hasAttachments: boolean
  labelIds: string[]
  unread: boolean
}

export interface GmailMessageDetail extends GmailMessageSummary {
  body: string                       // plain-text body (sanitized)
  htmlBody?: string                  // sanitized HTML body when available
  toRecipients: string[]
  attachments: GmailAttachmentMeta[] // metadata only — binary never fetched here
}
