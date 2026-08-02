import { NextRequest, NextResponse } from 'next/server'
import { getHomeFeedMore } from '@/services/newsService.server'
import { addTurkeyDays, isTurkeyYmd, turkeyYmdNow } from '@/lib/turkeyCalendar'

export const runtime = 'nodejs'
export const revalidate = 120

/**
 * GET /api/feed/more?beforeDay=YYYY-MM-DD
 * Returns published news for that Turkey calendar day (skips empty days up to 7).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('beforeDay')?.trim() || ''
  const beforeDay = isTurkeyYmd(raw) ? raw : addTurkeyDays(turkeyYmdNow(), -1)

  try {
    const result = await getHomeFeedMore(beforeDay)
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    })
  } catch (err) {
    console.error('[api/feed/more]', err)
    return NextResponse.json({ error: 'Akış yüklenemedi' }, { status: 502 })
  }
}
