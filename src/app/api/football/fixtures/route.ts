import { NextRequest, NextResponse } from 'next/server'
import { getTodayFixtures, getUpcomingFixtures, getLiveFixtures } from '@/services/footballService.server'

export const runtime = 'nodejs'
export const revalidate = 300

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? 'today' // today | upcoming | live

  try {
    let fixtures
    if (type === 'live') {
      fixtures = await getLiveFixtures()
    } else if (type === 'upcoming') {
      fixtures = await getUpcomingFixtures(5)
    } else {
      fixtures = await getTodayFixtures()
    }

    const maxAge = type === 'live' ? 300 : 1800
    return NextResponse.json(
      { fixtures, type },
      { headers: { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=60` } }
    )
  } catch (err) {
    console.error('[api/football/fixtures]', err)
    return NextResponse.json({ fixtures: [], type })
  }
}
