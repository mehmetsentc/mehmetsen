/**
 * GET /api/admin/gmail/messages/[id]
 * Returns full message detail (body, headers).
 * Requires: news:read permission
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getMessageById } from '@/services/gmailService'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyCmsToken(request, 'news:read')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const message = await getMessageById(id)
    return NextResponse.json(message)
  } catch (err) {
    console.error('[gmail/messages/:id]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
