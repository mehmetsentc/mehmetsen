import { NextRequest, NextResponse } from 'next/server'
import { getCategoryFeedPage } from '@/services/newsService.server'

/**
 * GET /api/feed/category?id=gundem&cursor=1754000000000&limit=20
 *
 * Server-side paginated category feed — ISR cached 5 min.
 * Replaces client-side postService.getNewsTimeline() Firestore calls.
 */
export const runtime = 'nodejs'
export const revalidate = 300

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? 'gundem'
  const cursor = req.nextUrl.searchParams.get('cursor') ?? null
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '20'), 30)

  try {
    const result = await getCategoryFeedPage(id, cursor, limit)
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch (err) {
    console.error('[api/feed/category]', err)
    return NextResponse.json(
      { items: [], nextCursor: null, hasMore: false },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
