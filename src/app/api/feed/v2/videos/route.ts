import { NextResponse } from 'next/server'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { feedService } from '@/services/feed/FeedService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const CATEGORY_RE = /^[a-z0-9-]{1,48}$/

/**
 * VIDEO-RANK-1 — /video akışı.
 *   GET ?category=<tab>&limit=12  → sıralanmış ilk sayfa + kalan id kuyruğu
 *   GET ?ids=a,b,c                → kuyruktaki sonraki sayfa (verilen sırayla)
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const auth = await verifyFirebaseIdToken(request).catch(() => null)
  const rawCategory = url.searchParams.get('category')?.trim().toLowerCase() || null
  const category = rawCategory && rawCategory !== 'for-you' && CATEGORY_RE.test(rawCategory) ? rawCategory : null
  const limitRaw = Number(url.searchParams.get('limit'))
  const ids = (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => ID_RE.test(s))
    .slice(0, 24)

  try {
    const page = await feedService.getVideoFeed({
      userId: auth?.uid ?? null,
      category,
      limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
      ids: ids.length ? ids : null,
    })
    return NextResponse.json(page, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('[api/feed/v2/videos]', err)
    return NextResponse.json({ error: 'video_feed_unavailable', items: [], queue: [], total: 0 }, { status: 503 })
  }
}
