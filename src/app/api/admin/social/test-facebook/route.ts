/**
 * POST /api/admin/social/test-facebook
 *
 * Manuel Facebook foto paylaşım testi (IG dokunulmaz).
 * Body: { "newsId": "..." }
 * Auth: CMS token veya Bearer CRON_SECRET
 */
import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { testFacebookPost } from '@/lib/social/facebook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let newsId = ''
  try {
    const body = (await request.json()) as { newsId?: string }
    newsId = body.newsId?.trim() || ''
  } catch {
    /* empty */
  }

  if (!newsId) {
    const url = new URL(request.url)
    newsId = url.searchParams.get('newsId')?.trim() || ''
  }

  if (!newsId) {
    return NextResponse.json({ error: 'newsId zorunlu' }, { status: 400 })
  }

  const result = await testFacebookPost(newsId)
  return NextResponse.json(result, {
    status: result.success ? 200 : 502,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(request: Request) {
  return POST(request)
}
