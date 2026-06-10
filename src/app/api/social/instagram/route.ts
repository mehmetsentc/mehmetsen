/**
 * POST /api/social/instagram
 *
 * Publishes a single news item to Instagram Business (two-step flow).
 * Protected by Bearer CRON_SECRET.
 *
 * Body: SocialPublishPayload (JSON)
 * Returns: SocialPublishResult (JSON)
 */
import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { publishToInstagram } from '@/lib/social/instagram'
import type { SocialPublishPayload } from '@/lib/social/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: SocialPublishPayload

  try {
    payload = (await request.json()) as SocialPublishPayload
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövdesi' }, { status: 400 })
  }

  if (!payload.newsId || !payload.title) {
    return NextResponse.json({ error: 'newsId ve title zorunlu' }, { status: 400 })
  }

  const result = await publishToInstagram(payload)

  return NextResponse.json(result, {
    status: result.success ? 200 : 502,
    headers: { 'Cache-Control': 'no-store' },
  })
}
