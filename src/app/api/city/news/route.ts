import { NextRequest, NextResponse } from 'next/server'
import { getCityNews, getCityNewsByCategory } from '@/services/cityNewsService.server'
import { getCitySlugFromHost } from '@/lib/cityHost'
import { TENANT_PROVINCE_HEADER } from '@/lib/tenant'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  let city = searchParams.get('city')?.trim().toLowerCase()
  const category = searchParams.get('category')?.trim().toLowerCase()
  const limit = Math.min(Number(searchParams.get('limit')) || 30, 50)

  const hostCity =
    request.headers.get(TENANT_PROVINCE_HEADER)?.trim().toLowerCase() ||
    getCitySlugFromHost(request.headers.get('x-forwarded-host') || request.headers.get('host') || '')

  if (hostCity) {
    city = hostCity
  }

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
