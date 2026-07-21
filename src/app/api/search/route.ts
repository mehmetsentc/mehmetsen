import { NextRequest, NextResponse } from 'next/server'
import { normalizeSearchTerm, runServerSearch } from '@/lib/search/serverSearch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMPTY = { posts: [], videos: [], users: [], categories: [] }

/** GET /api/search?q=...&tag=1&limit=12 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const tagOnly = searchParams.get('tag') === '1'
  const limit = Math.min(20, Math.max(4, Number(searchParams.get('limit') || 12)))

  const term = normalizeSearchTerm(q)
  if (term.length < 2) {
    return NextResponse.json(EMPTY, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    })
  }

  try {
    const results = await runServerSearch(term, { maxPerType: limit, tagOnly })
    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    })
  } catch (err) {
    console.error('[api/search]', err)
    return NextResponse.json({ error: 'Arama başarısız', ...EMPTY }, { status: 502 })
  }
}
