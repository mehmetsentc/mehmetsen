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
        'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
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
