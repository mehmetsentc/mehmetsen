/**
 * GET /api/admin/gmail/messages?maxResults=20&pageToken=...
 * Returns inbox message summaries.
 * Requires: news:read permission
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { listMessages } from '@/services/gmailService'
import { gmailJsonError } from '@/lib/gmail/http'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const user = await verifyCmsToken(request, 'news:read')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const maxResults = Math.min(Number(searchParams.get('maxResults') ?? '20'), 50)
  const pageToken = searchParams.get('pageToken') ?? undefined

  try {
    const result = await listMessages(maxResults, pageToken)
    return NextResponse.json(result)
  } catch (err) {
    return gmailJsonError(err)
  }
}
