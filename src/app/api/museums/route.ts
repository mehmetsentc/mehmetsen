import { NextRequest, NextResponse } from 'next/server'
import { getMuseumsByCity } from '@/services/museumService.server'

export const runtime = 'nodejs'
export const revalidate = 86400

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get('city')?.trim()
  if (!city) {
    return NextResponse.json({ error: 'city parametresi zorunlu' }, { status: 400 })
  }
  try {
    const museums = await getMuseumsByCity(city)
    return NextResponse.json(
      { museums, city },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } }
    )
  } catch (err) {
    console.error('[api/museums]', err)
    return NextResponse.json({ museums: [], city })
  }
}
