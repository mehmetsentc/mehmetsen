import { NextRequest, NextResponse } from 'next/server'
import { getStandings, CURRENT_SEASON } from '@/services/footballService.server'

export const runtime   = 'nodejs'
export const revalidate = 3600

export async function GET(req: NextRequest) {
  const league = parseInt(req.nextUrl.searchParams.get('league') ?? '203')
  const season = parseInt(req.nextUrl.searchParams.get('season') ?? String(CURRENT_SEASON))

  try {
    const standings = await getStandings(league, season)
    return NextResponse.json(
      { standings },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } }
    )
  } catch (err) {
    console.error('[api/football/standings]', err)
    return NextResponse.json({ standings: [] })
  }
}
