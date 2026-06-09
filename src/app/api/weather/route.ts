import { NextRequest, NextResponse } from 'next/server'
import { fetchWeather } from '@/lib/weatherApi'

export const runtime = 'edge'
export const revalidate = 900 // 15 minutes

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = searchParams.get('city') || 'Istanbul'
  const days = Math.min(Number(searchParams.get('days') || 7), 7)

  try {
    const data = await fetchWeather(city, days)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
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
