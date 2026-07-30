import { NextRequest, NextResponse } from 'next/server'
import { getSkorBoard, parseSkorSport, parseSkorTab } from '@/lib/skor/board'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const sport = parseSkorSport(req.nextUrl.searchParams.get('sport'))
  const tab = parseSkorTab(req.nextUrl.searchParams.get('tab'))
  const date = req.nextUrl.searchParams.get('date') ?? undefined

  try {
    const data = await getSkorBoard({ sport, tab, date })
    return NextResponse.json(data, {
      headers: {
        'Cache-Control':
          tab === 'live'
            ? 'public, s-maxage=20, stale-while-revalidate=40'
            : 'public, s-maxage=45, stale-while-revalidate=90',
      },
    })
  } catch (err) {
    console.error('[api/skor/board]', err)
    return NextResponse.json({
      sport,
      tab,
      date: date ?? null,
      groups: [],
      liveCount: 0,
      emptyReason: 'error',
      updatedAt: Date.now(),
    })
  }
}
