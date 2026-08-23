import { NextRequest, NextResponse } from 'next/server'
import {
  getStandings,
  CURRENT_SEASON,
  hasFootballApiKey,
  getFootballProvider,
  sanitizeFootballError,
  isFootballAccountError,
  isSeasonAccessError,
} from '@/services/footballService.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const league = parseInt(req.nextUrl.searchParams.get('league') ?? '203')
  const season = parseInt(
    req.nextUrl.searchParams.get('season') ?? String(CURRENT_SEASON)
  )

  if (!hasFootballApiKey()) {
    return NextResponse.json({
      standings: [],
      error: 'missing_api_key',
      provider: getFootballProvider(),
      hint:
        'Vercel Production → FOOTBALL_API_KEY (api-sports dashboard). RapidAPI key ise FOOTBALL_PROVIDER=rapidapi ekleyin.',
    })
  }

  try {
    const standings = await getStandings(league, season)
    return NextResponse.json(
      { standings, season, provider: getFootballProvider() },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
        },
      }
    )
  } catch (err) {
    console.error('[api/football/standings]', err)
    const detail = sanitizeFootballError(err)
    const error = detail.includes('FOOTBALL_API_KEY')
      ? 'missing_api_key'
      : isFootballAccountError(err)
        ? 'account_error'
        : isSeasonAccessError(err)
          ? 'season_blocked'
          : 'upstream_error'
    return NextResponse.json({
      standings: [],
      error,
      detail,
      provider: getFootballProvider(),
      season,
    })
  }
}
