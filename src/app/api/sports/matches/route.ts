/**
 * GET /api/sports/matches?sport=futbol|basketbol|voleybol|all
 * ESPN + TheSportsDB — bugün/dün + canlı; yoksa yaklaşan program / son sonuçlar.
 */
import { NextRequest, NextResponse } from 'next/server'
import { collectSportMatches, parseSportParam } from '@/lib/sports/collectMatches'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type { MatchResult } from '@/lib/sports/matchTypes'

export async function GET(req: NextRequest) {
  const sport = parseSportParam(req.nextUrl.searchParams.get('sport'))

  try {
    const { matches, dateLabel, liveCount } = await collectSportMatches(sport)
    return NextResponse.json(
      { matches, dateLabel, liveCount, sport, updatedAt: Date.now() },
      {
        headers: {
          'Cache-Control':
            liveCount > 0
              ? 'public, s-maxage=30, stale-while-revalidate=60'
              : 'public, s-maxage=120, stale-while-revalidate=300',
        },
      }
    )
  } catch (err) {
    console.error('[api/sports/matches]', err)
    return NextResponse.json(
      { matches: [], dateLabel: '', liveCount: 0, sport, error: 'load_failed' },
      { status: 200 }
    )
  }
}
