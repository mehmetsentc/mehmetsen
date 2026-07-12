import { NextResponse } from 'next/server'
import { getCities } from '@/services/museumService.server'

export const runtime = 'nodejs'
export const revalidate = 86400

export async function GET() {
  try {
    const cities = await getCities()
    return NextResponse.json(
      { cities },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } }
    )
  } catch (err) {
    console.error('[api/museums/cities]', err)
    return NextResponse.json({ cities: [] })
  }
}
