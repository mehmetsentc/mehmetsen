/**
 * POST /api/admin/gmail/messages/[id]/to-draft
 * Converts a Gmail message into a newsDraft (status: pending_review).
 * NEVER auto-publishes. Requires: news:create permission.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getMessageById } from '@/services/gmailService'
import { gmailJsonError } from '@/lib/gmail/http'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyCmsToken(request, 'news:create')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const message = await getMessageById(id)

    const db = getAdminFirestore()
    const draft = {
      title: message.subject,
      content: message.body,
      summary: message.snippet,
      sourceType: 'gmail_inbox',
      sourceEmail: message.from,
      sourceMessageId: message.id,
      sourceDate: message.date,
      draftStatus: 'pending_review',
      createdAt: Date.now(),
      createdBy: user.uid,
      updatedAt: Date.now(),
    }
    const ref = await db.collection(Collections.NEWS_DRAFTS).add(draft)
    return NextResponse.json({ ok: true, draftId: ref.id })
  } catch (err) {
    return gmailJsonError(err)
  }
}
