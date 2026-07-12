import { NextResponse } from 'next/server'
import { getStandings } from '@/services/footballService.server'

export const runtime = 'nodejs'
export const revalidate = 3600

export async function GET() {
  try {
    const standings = await getStandings()
    return NextResponse.json(
      { standings },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } }
    )
  } catch (err) {
    console.error('[api/football/standings]', err)
    return NextResponse.json({ standings: [] })
  }
}
