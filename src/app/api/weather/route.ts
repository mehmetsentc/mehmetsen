import { NextRequest, NextResponse } from 'next/server'
import { fetchWeather } from '@/lib/weatherApi'

export const runtime = 'edge'
/** Keep edge revalidation short so day/night icons flip soon after sunrise/sunset. */
export const revalidate = 300

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = searchParams.get('city') || 'Istanbul'
  const days = Math.min(Number(searchParams.get('days') || 7), 7)

  try {
    const data = await fetchWeather(city, days)
    return NextResponse.json(data, {
      headers: {
        // 5 min CDN cache — longer TTLs kept night icons past sunrise.
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
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
