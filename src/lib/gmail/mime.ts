/**
 * Gmail MIME helpers — base64url decode, body extraction, attachment metadata, HTML sanitize.
 */

export interface GmailPayloadPart {
  mimeType?: string
  filename?: string
  headers?: Array<{ name?: string; value?: string }>
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: GmailPayloadPart[]
}

export interface GmailAttachmentMeta {
  filename: string
  mimeType: string
  size: number
  attachmentId: string
}

export function decodeBase64Url(data: string): string {
  const pad = data.length % 4 === 0 ? '' : '='.repeat(4 - (data.length % 4))
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/') + pad
  return Buffer.from(base64, 'base64').toString('utf-8')
}

export function getHeader(headers: Array<{ name?: string; value?: string }> | undefined, name: string): string {
  return headers?.find((h) => (h.name ?? '').toLowerCase() === name.toLowerCase())?.value ?? ''
}

function walkParts(payload: GmailPayloadPart | undefined, visit: (part: GmailPayloadPart) => void): void {
  if (!payload) return
  visit(payload)
  for (const part of payload.parts ?? []) walkParts(part, visit)
}

function findPart(payload: GmailPayloadPart | undefined, mimeType: string): GmailPayloadPart | null {
  if (!payload) return null
  if ((payload.mimeType ?? '').toLowerCase() === mimeType && payload.body?.data) return payload
  for (const part of payload.parts ?? []) {
    const found = findPart(part, mimeType)
    if (found) return found
  }
  return null
}

export function extractAttachmentMeta(payload: GmailPayloadPart | undefined): GmailAttachmentMeta[] {
  const out: GmailAttachmentMeta[] = []
  walkParts(payload, (part) => {
    const filename = (part.filename ?? '').trim()
    const attachmentId = part.body?.attachmentId
    if (!filename || !attachmentId) return
    out.push({
      filename,
      mimeType: part.mimeType || 'application/octet-stream',
      size: Number(part.body?.size ?? 0) || 0,
      attachmentId,
    })
  })
  return out
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** Conservative sanitizer — no DOMPurify dependency. */
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/<link[\s\S]*?>/gi, '')
    .replace(/<meta[\s\S]*?>/gi, '')
    .replace(/<base[\s\S]*?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/data:text\/html/gi, '')
}

export function extractMessageBodies(payload: GmailPayloadPart | undefined): {
  text: string
  html: string
} {
  const htmlPart = findPart(payload, 'text/html')
  const plainPart = findPart(payload, 'text/plain')
  const html = htmlPart?.body?.data ? sanitizeEmailHtml(decodeBase64Url(htmlPart.body.data)) : ''
  let text = plainPart?.body?.data ? decodeBase64Url(plainPart.body.data) : ''
  if (!text && html) text = htmlToPlainText(html)
  if (!text && payload?.body?.data && (payload.mimeType === 'text/plain' || payload.mimeType === 'text/html')) {
    const decoded = decodeBase64Url(payload.body.data)
    if (payload.mimeType === 'text/html') {
      return { html: sanitizeEmailHtml(decoded), text: htmlToPlainText(decoded) }
    }
    return { html: '', text: decoded }
  }
  return { text, html }
}
