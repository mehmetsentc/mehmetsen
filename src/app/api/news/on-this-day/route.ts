import { NextRequest, NextResponse } from 'next/server'
import { getOnThisDayNews } from '@/services/newsService.server'

export const runtime = 'nodejs'
export const revalidate = 3600

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = Number(searchParams.get('month') || new Date().getMonth() + 1)
  const day = Number(searchParams.get('day') || new Date().getDate())
  const limit = Math.min(Number(searchParams.get('limit') || 5), 10)

  try {
    const items = await getOnThisDayNews(month, day, limit)
    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    })
  } catch (err) {
    console.error('[api/news/on-this-day]', err)
    return NextResponse.json({ items: [] })
  }
}
