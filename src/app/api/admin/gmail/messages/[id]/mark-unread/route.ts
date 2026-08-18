/**
 * POST /api/admin/gmail/messages/[id]/mark-unread
 * Adds UNREAD label. Requires gmail.modify scope.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { markAsUnread } from '@/services/gmailService'
import { gmailJsonError } from '@/lib/gmail/http'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyCmsToken(request, 'news:read')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    await markAsUnread(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return gmailJsonError(err)
  }
}
