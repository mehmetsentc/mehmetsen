import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'
import { recordArticleEngagement } from '@/services/feed/articleEngagement.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Lightweight news view counter (article open).
 * Increments Firestore + PG views_count once; full analytics stays paused.
 * Client should debounce once per browser session per article.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (!checkRateLimit(`news-view:${ip}`, 60, 60_000)) {
    return rateLimitResponse()
  }

  let body: { id?: unknown } = {}
  try {
    body = (await request.json()) as { id?: unknown }
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id || id.length > 128 || !/^[\w-]+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  try {
    const result = await recordArticleEngagement({
      articleKey: id,
      source: 'open',
      dwellMs: 0,
      countView: true,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('[news/view]', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
