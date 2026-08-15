/**
 * POST /api/admin/gmail/send
 * Send a new email or reply via bilgi@nahaber.com.
 * Body: { to, subject, body, replyToMessageId? }
 * Requires: news:read permission + gmail.send scope
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { sendGmailMessage, getMessageHeadersById, getIntegration } from '@/services/gmailService'
import { gmailJsonError } from '@/lib/gmail/http'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const user = await verifyCmsToken(request, 'news:read')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { to?: string; subject?: string; body?: string; replyToMessageId?: string }
  try {
    body = await request.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { to, subject, body: text, replyToMessageId } = body
  if (!to || !subject || !text) {
    return NextResponse.json({ error: 'to, subject and body are required' }, { status: 400 })
  }

  try {
    const integration = await getIntegration()
    const from = integration?.accountEmail ?? 'bilgi@nahaber.com'

    let threadId: string | undefined
    let inReplyTo: string | undefined
    let references: string | undefined

    if (replyToMessageId) {
      const headers = await getMessageHeadersById(replyToMessageId)
      threadId = headers.threadId
      inReplyTo = headers.messageId
      references = [headers.references, headers.messageId].filter(Boolean).join(' ')
    }

    const result = await sendGmailMessage({ to, from, subject, body: text, threadId, inReplyTo, references })
    return NextResponse.json({ ok: true, id: result.id, threadId: result.threadId })
  } catch (err) {
    return gmailJsonError(err)
  }
}
