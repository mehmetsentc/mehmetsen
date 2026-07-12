import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { backfillArticleSeo } from '@/lib/seoBackfill'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let limit = 40
  try {
    const body = (await request.json()) as { limit?: number }
    if (typeof body.limit === 'number' && body.limit > 0) {
      limit = Math.min(body.limit, 100)
    }
  } catch {
    // default limit
  }

  try {
    const result = await backfillArticleSeo(limit)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[seo-backfill]', error)
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 })
  }
}
