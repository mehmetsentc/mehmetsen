import { NextRequest, NextResponse } from 'next/server'
import {
  getTodayFixtures,
  getUpcomingFixtures,
  getLiveFixtures,
  getPastFixtures,
  CURRENT_SEASON,
} from '@/services/footballService.server'

export const runtime   = 'nodejs'
export const revalidate = 300

export async function GET(req: NextRequest) {
  const type   = req.nextUrl.searchParams.get('type')   ?? 'today'  // today | upcoming | past | live
  const league = parseInt(req.nextUrl.searchParams.get('league') ?? '203')
  const season = parseInt(req.nextUrl.searchParams.get('season') ?? String(CURRENT_SEASON))

  try {
    let fixtures
    if (type === 'live') {
      fixtures = await getLiveFixtures(league)
    } else if (type === 'upcoming') {
      fixtures = await getUpcomingFixtures(league, 10)
    } else if (type === 'past') {
      fixtures = await getPastFixtures(league, season, 20)
    } else {
      fixtures = await getTodayFixtures(league)
    }

    const maxAge = type === 'live' ? 300 : type === 'past' ? 21600 : 1800
    return NextResponse.json(
      { fixtures, type },
      { headers: { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=60` } }
    )
  } catch (err) {
    console.error('[api/football/fixtures]', err)
    return NextResponse.json({ fixtures: [], type })
  }
}
