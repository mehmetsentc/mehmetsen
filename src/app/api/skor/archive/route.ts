import { NextRequest, NextResponse } from 'next/server'
import { CURRENT_SEASON } from '@/services/footballService.server'
import { getSkorArchive } from '@/lib/skor/board'
import { listLeagues } from '@/lib/skor/store'
import { parseSkorSport } from '@/lib/skor/board'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const leagueId = req.nextUrl.searchParams.get('leagueId')?.trim()
  const seasonRaw = req.nextUrl.searchParams.get('season')
  const season = seasonRaw ? Number(seasonRaw) || seasonRaw : CURRENT_SEASON
  const sport = parseSkorSport(req.nextUrl.searchParams.get('sport'))

  try {
    if (!leagueId) {
      const leagues = await listLeagues(sport)
      return NextResponse.json({ leagues, season, updatedAt: Date.now() })
    }

    const data = await getSkorArchive(leagueId, season)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    })
  } catch (err) {
    console.error('[api/skor/archive]', err)
    return NextResponse.json({
      leagueId: leagueId ?? null,
      season,
      seasons: [],
      standings: null,
      matches: [],
      updatedAt: Date.now(),
    })
  }
}
