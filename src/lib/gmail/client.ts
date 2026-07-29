/**
 * Gmail API client — server-only.
 * Uses raw fetch against Gmail REST API with an OAuth2 access token.
 */
import 'server-only'
import type { GmailMessageSummary, GmailMessageDetail } from './types'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

async function gmailFetch(path: string, accessToken: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`[gmail/client] ${res.status} ${res.statusText}: ${body}`)
  }
  return res.json()
}

/** Decode base64url-encoded Gmail message part */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64').toString('utf-8')
}

/** Extract header value from Gmail message headers array */
function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

/** Recursively find a part with the given mimeType */
function findPart(payload: GmailPayload, mimeType: string): GmailPayload | null {
  if (payload.mimeType === mimeType && payload.body?.data) return payload
  for (const part of payload.parts ?? []) {
    const found = findPart(part, mimeType)
    if (found) return found
  }
  return null
}

interface GmailPayload {
  mimeType?: string
  headers?: Array<{ name: string; value: string }>
  body?: { data?: string; size?: number }
  parts?: GmailPayload[]
  filename?: string
}

/**
 * List inbox messages. Returns lightweight summaries.
 * maxResults: 1-50
 */
export async function listInboxMessages(
  accessToken: string,
  maxResults = 20,
  pageToken?: string,
): Promise<{ messages: GmailMessageSummary[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    labelIds: 'INBOX',
    maxResults: String(Math.min(maxResults, 50)),
  })
  if (pageToken) params.set('pageToken', pageToken)

  const list = await gmailFetch(`/messages?${params}`, accessToken)
  if (!list.messages?.length) return { messages: [] }

  // Fetch metadata for each message (parallel, capped at 20)
  const ids: string[] = list.messages.slice(0, 20).map((m: { id: string }) => m.id)
  const metaResults = await Promise.allSettled(
    ids.map((id) =>
      gmailFetch(`/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, accessToken),
    ),
  )

  const messages: GmailMessageSummary[] = []
  for (const result of metaResults) {
    if (result.status !== 'fulfilled') continue
    const msg = result.value
    const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? []
    messages.push({
      id: msg.id,
      threadId: msg.threadId,
      subject: getHeader(headers, 'Subject') || '(konu yok)',
      from: getHeader(headers, 'From'),
      date: getHeader(headers, 'Date'),
      snippet: msg.snippet ?? '',
      hasAttachments: (msg.payload?.parts ?? []).some(
        (p: GmailPayload) => p.filename && p.filename.length > 0,
      ),
      labelIds: msg.labelIds ?? [],
    })
  }

  return { messages, nextPageToken: list.nextPageToken }
}

/**
 * Fetch a full message (subject, from, date, body text).
 */
export async function getMessage(accessToken: string, messageId: string): Promise<GmailMessageDetail> {
  const msg = await gmailFetch(`/messages/${messageId}?format=full`, accessToken)
  const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? []

  // Extract body: prefer text/plain, fall back to text/html
  let body = ''
  const plainPart = findPart(msg.payload, 'text/plain')
  const htmlPart = findPart(msg.payload, 'text/html')
  const part = plainPart ?? htmlPart
  if (part?.body?.data) {
    body = decodeBase64Url(part.body.data)
    // Strip HTML tags if using HTML fallback
    if (!plainPart) {
      body = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    }
  }

  const toHeader = getHeader(headers, 'To')
  const toRecipients = toHeader ? [toHeader] : []

  return {
    id: msg.id,
    threadId: msg.threadId,
    subject: getHeader(headers, 'Subject') || '(konu yok)',
    from: getHeader(headers, 'From'),
    date: getHeader(headers, 'Date'),
    snippet: msg.snippet ?? '',
    hasAttachments: (msg.payload?.parts ?? []).some(
      (p: GmailPayload) => p.filename && p.filename.length > 0,
    ),
    labelIds: msg.labelIds ?? [],
    body,
    toRecipients,
  }
}
