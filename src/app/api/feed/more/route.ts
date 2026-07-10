import { NextRequest, NextResponse } from 'next/server'
import { getHomeFeedMore } from '@/services/newsService.server'

export const runtime = 'nodejs'
export const revalidate = 60

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor') || undefined
  const limit = Math.min(Number(searchParams.get('limit') || 8), 16)

  try {
    const result = await getHomeFeedMore(cursor, limit)
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  } catch (err) {
    console.error('[api/feed/more]', err)
    return NextResponse.json({ error: 'Akış yüklenemedi' }, { status: 502 })
  }
}
