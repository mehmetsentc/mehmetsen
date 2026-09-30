import { NextRequest, NextResponse } from 'next/server'
import { fetchWeather } from '@/lib/weatherApi'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = searchParams.get('city') || 'Istanbul'
  const days = Math.min(Number(searchParams.get('days') || 7), 7)

  try {
    const data = await fetchWeather(city, days)
    return NextResponse.json(data, {
      headers: {
        // FinOps: one shared CDN copy per city for 10 min instead of an edge call +
        // WeatherAPI request on every widget mount. is_day/fetchedAt are computed at
        // fetch time, so a card can lag sunset by at most ~10–20 min.
        'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=600',
        'CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=600',
      },
    })
  } catch (err) {
    console.error('[WeatherAPI]', err)
    return NextResponse.json(
      { error: 'Hava durumu alınamadı' },
      { status: 502 }
    )
  }
}
