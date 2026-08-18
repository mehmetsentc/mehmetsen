/**
 * POST /api/admin/gmail/messages/[id]/star
 * Adds or removes STARRED label. Requires gmail.modify scope.
 * Body: { starred: boolean }
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { setGmailStarred } from '@/services/gmailService'
import { gmailJsonError } from '@/lib/gmail/http'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyCmsToken(request, 'news:read')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let starred = false
  try {
    const body = await request.json() as { starred?: boolean }
    starred = Boolean(body.starred)
  } catch {
    // default to false (unstar) if body unreadable
  }

  try {
    await setGmailStarred(id, starred)
    return NextResponse.json({ ok: true, starred })
  } catch (err) {
    return gmailJsonError(err)
  }
}
