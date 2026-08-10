import { NextResponse } from 'next/server'
import { boxOfficeWeeklySyncService } from '@/services/boxOfficeWeeklySyncService'

/**
 * GET /api/boxoffice/weekly — public read of cached weekly gişe data.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await boxOfficeWeeklySyncService.getLatest()
    if (!data) {
      return NextResponse.json(
        { error: 'No weekly box office data yet' },
        { status: 404, headers: { 'Cache-Control': 'public, s-maxage=300' } }
      )
    }

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' },
    })
  } catch (error) {
    console.error('[api/boxoffice/weekly] failed:', error)
    const message = error instanceof Error ? error.message : 'Read failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
