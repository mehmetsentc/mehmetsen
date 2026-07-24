/**
 * GET /api/football/squad?team=85
 */
import { NextRequest, NextResponse } from 'next/server'
import { getTeamSquad } from '@/services/footballService.server'

export const runtime = 'nodejs'
export const revalidate = 3600

export async function GET(req: NextRequest) {
  const team = parseInt(req.nextUrl.searchParams.get('team') ?? '', 10)
  if (!Number.isFinite(team) || team <= 0) {
    return NextResponse.json({ players: [], error: 'team required' }, { status: 400 })
  }
  try {
    const players = await getTeamSquad(team)
    return NextResponse.json(
      { players },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } }
    )
  } catch (err) {
    console.error('[api/football/squad]', err)
    return NextResponse.json({ players: [] })
  }
}
