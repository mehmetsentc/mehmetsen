import { NextRequest, NextResponse } from 'next/server'
import {
  getStandings,
  CURRENT_SEASON,
  hasFootballApiKey,
} from '@/services/footballService.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const league = parseInt(req.nextUrl.searchParams.get('league') ?? '203')
  const season = parseInt(req.nextUrl.searchParams.get('season') ?? String(CURRENT_SEASON))

  if (!hasFootballApiKey()) {
    return NextResponse.json({
      standings: [],
      error: 'missing_api_key',
      hint: 'Set FOOTBALL_API_KEY on Vercel (Production) and redeploy',
    })
  }

  try {
    const standings = await getStandings(league, season)
    return NextResponse.json(
      { standings },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } }
    )
  } catch (err) {
    console.error('[api/football/standings]', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      standings: [],
      error: message.includes('FOOTBALL_API_KEY') ? 'missing_api_key' : 'upstream_error',
    })
  }
}
