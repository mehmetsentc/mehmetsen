import { NextRequest, NextResponse } from 'next/server'
import { getHomeCategoryRailsLazy } from '@/services/newsService.server'
import type { HomeCategorySlug } from '@/types/newsItem'

export const runtime = 'nodejs'
export const revalidate = 120

/** GET /api/feed/category-rails?cats=magazin,siyaset — pool-cached, no N+1 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('cats') ?? ''
  const cats = raw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean) as HomeCategorySlug[]

  try {
    const rails = await getHomeCategoryRailsLazy(cats.length > 0 ? cats : undefined)
    return NextResponse.json(
      { rails },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
        },
      }
    )
  } catch (err) {
    console.error('[api/feed/category-rails]', err)
    return NextResponse.json({ rails: {} }, { status: 200 })
  }
}
