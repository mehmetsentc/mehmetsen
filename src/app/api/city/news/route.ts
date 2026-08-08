import { NextRequest, NextResponse } from 'next/server'
import { getCityNews, getCityNewsByCategory } from '@/services/cityNewsService.server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const city = searchParams.get('city')?.trim().toLowerCase()
  const category = searchParams.get('category')?.trim().toLowerCase()
  const limit = Math.min(Number(searchParams.get('limit')) || 30, 50)

  if (!city) {
    return NextResponse.json(
      { error: 'city parameter required' },
      { status: 400 }
    )
  }

  const items = category
    ? await getCityNewsByCategory(city, category, limit)
    : await getCityNews(city, limit)

  return NextResponse.json(
    { items },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
      },
    }
  )
}
