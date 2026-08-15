/**
 * Gmail API client — server-only REST calls with an OAuth2 access token.
 */
import 'server-only'
import type { GmailMessageSummary, GmailMessageDetail } from './types'
import { GmailError, gmailErrorFromGoogleHttp } from './errors'
import {
  extractAttachmentMeta,
  extractMessageBodies,
  getHeader,
  type GmailPayloadPart,
} from './mime'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

export async function gmailFetch(path: string, accessToken: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options?.headers ?? {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw gmailErrorFromGoogleHttp(res.status, body)
  }
  return res.json()
}

export async function listInboxMessages(
  accessToken: string,
  maxResults = 20,
  pageToken?: string,
): Promise<{ messages: GmailMessageSummary[]; nextPageToken?: string }> {
  const limit = Math.min(Math.max(maxResults, 1), 50)
  const params = new URLSearchParams({
    labelIds: 'INBOX',
    maxResults: String(limit),
  })
  if (pageToken) params.set('pageToken', pageToken)

  const list = await gmailFetch(`/messages?${params}`, accessToken)
  if (!list.messages?.length) return { messages: [] }

  const ids: string[] = list.messages.slice(0, limit).map((m: { id: string }) => m.id)
  const metaResults = await Promise.allSettled(
    ids.map((id) =>
      gmailFetch(
        `/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        accessToken,
      ),
    ),
  )

  const messages: GmailMessageSummary[] = []
  for (const result of metaResults) {
    if (result.status !== 'fulfilled') {
      if (result.reason instanceof GmailError && result.reason.code === 'RECONNECT_REQUIRED') {
        throw result.reason
      }
      continue
    }
    const msg = result.value as {
      id: string
      threadId: string
      snippet?: string
      labelIds?: string[]
      payload?: GmailPayloadPart
    }
    const headers = msg.payload?.headers ?? []
    const labelIds = msg.labelIds ?? []
    messages.push({
      id: msg.id,
      threadId: msg.threadId,
      subject: getHeader(headers, 'Subject') || '(konu yok)',
      from: getHeader(headers, 'From'),
      date: getHeader(headers, 'Date'),
      snippet: msg.snippet ?? '',
      hasAttachments: extractAttachmentMeta(msg.payload).length > 0,
      labelIds,
      unread: labelIds.includes('UNREAD'),
    })
  }

  return { messages, nextPageToken: list.nextPageToken }
}

export async function getInboxLabelStats(
  accessToken: string,
): Promise<{ messagesTotal: number; messagesUnread: number }> {
  const label = await gmailFetch('/labels/INBOX', accessToken)
  return {
    messagesTotal: Number(label.messagesTotal ?? 0) || 0,
    messagesUnread: Number(label.messagesUnread ?? 0) || 0,
  }
}

export async function getMessage(accessToken: string, messageId: string): Promise<GmailMessageDetail> {
  if (!/^[a-zA-Z0-9_-]+$/.test(messageId)) {
    throw new GmailError('GOOGLE_API_ERROR', { detail: 'bad_message_id', httpStatus: 400 })
  }
  const msg = await gmailFetch(`/messages/${encodeURIComponent(messageId)}?format=full`, accessToken)
  const headers = msg.payload?.headers ?? []
  const { text, html } = extractMessageBodies(msg.payload)
  const attachments = extractAttachmentMeta(msg.payload)
  const toHeader = getHeader(headers, 'To')
  const labelIds: string[] = msg.labelIds ?? []

  return {
    id: msg.id,
    threadId: msg.threadId,
    subject: getHeader(headers, 'Subject') || '(konu yok)',
    from: getHeader(headers, 'From'),
    date: getHeader(headers, 'Date'),
    snippet: msg.snippet ?? '',
    hasAttachments: attachments.length > 0,
    labelIds,
    unread: labelIds.includes('UNREAD'),
    body: text,
    htmlBody: html || undefined,
    toRecipients: toHeader ? [toHeader] : [],
    attachments,
  }
}
