import { NextRequest, NextResponse } from 'next/server'
import { CURRENT_SEASON } from '@/services/footballService.server'
import { getSkorStandings } from '@/lib/skor/board'
import { hydrateStandingsFallback } from '@/lib/skor/standingsFallback'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const leagueId = (req.nextUrl.searchParams.get('leagueId') ?? 'futbol_203').trim()
  const seasonRaw = req.nextUrl.searchParams.get('season')
  const season = seasonRaw ? Number(seasonRaw) || seasonRaw : CURRENT_SEASON

  try {
    let doc = await getSkorStandings(leagueId, season)
    if (!doc || !doc.rows.length) {
      doc = await hydrateStandingsFallback(leagueId, season)
    }
    return NextResponse.json(
      {
        leagueId,
        season,
        leagueName: doc?.leagueName ?? null,
        rows: doc?.rows ?? [],
        updatedAt: doc?.updatedAt ?? Date.now(),
      },
      {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      }
    )
  } catch (err) {
    console.error('[api/skor/standings]', err)
    return NextResponse.json({ leagueId, season, rows: [], updatedAt: Date.now() })
  }
}
