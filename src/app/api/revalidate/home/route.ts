/**
 * Manual cache buster for the home feed.
 *
 * Triggers Next.js to invalidate the `home-feed` tag (used by `unstable_cache`
 * inside `newsService.server.ts`) and the `/feed` route. Useful when the
 * underlying Firestore data changes but stale cache is still being served —
 * e.g. recovering after a temporary RESOURCE_EXHAUSTED window.
 *
 * Protected by a shared secret query param to prevent abuse.
 *   GET /api/revalidate/home?secret=<REVALIDATE_SECRET>
 */
import { NextResponse, type NextRequest } from 'next/server'
import { revalidateHomeFeedCaches } from '@/lib/revalidateHome'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const provided = req.nextUrl.searchParams.get('secret')?.trim() ?? ''
  const expected = (process.env.REVALIDATE_SECRET || '').trim()

  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    revalidateHomeFeedCaches()
    return NextResponse.json(
      { ok: true, revalidated: ['home-feed', 'feed-slider', 'feed-timeline', 'breaking-news', '/feed'] },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
