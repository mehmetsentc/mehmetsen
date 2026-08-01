import { NextResponse } from 'next/server'
import { getHomeFeedInitialData } from '@/services/newsService.server'

/**
 * GET /api/feed/home — ana sayfa canlı yenileme için hafif JSON.
 * Client poll ile açık /feed sayfasını günceller.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
// CDN caching: 120s fresh, 300s stale-while-revalidate

export async function GET() {
  try {
    const data = await getHomeFeedInitialData()
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    console.warn('[api/feed/home]', error)
    return NextResponse.json(
      { error: 'feed_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
