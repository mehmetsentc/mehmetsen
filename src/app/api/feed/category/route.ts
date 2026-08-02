import { NextRequest, NextResponse } from 'next/server'
import { getCategoryFeedPage } from '@/services/newsService.server'
import { isTurkeyYmd, turkeyYmdNow } from '@/lib/turkeyCalendar'

/**
 * GET /api/feed/category?id=gundem&beforeDay=YYYY-MM-DD
 *
 * One Turkey calendar day of category articles per request.
 */
export const runtime = 'nodejs'
export const revalidate = 300

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? 'gundem'
  const raw = req.nextUrl.searchParams.get('beforeDay')?.trim() || ''
  // No beforeDay (discover / related): load today. Explicit load-more always passes a day.
  const beforeDay = isTurkeyYmd(raw) ? raw : turkeyYmdNow()

  try {
    const result = await getCategoryFeedPage(id, beforeDay)
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch (err) {
    console.error('[api/feed/category]', err)
    return NextResponse.json(
      { items: [], day: null, prevDay: null, hasMore: false },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
