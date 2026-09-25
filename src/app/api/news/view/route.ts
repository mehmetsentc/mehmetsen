import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
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

  let body: { id?: unknown; sessionId?: unknown } = {}
  try {
    body = (await request.json()) as { id?: unknown; sessionId?: unknown }
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id || id.length > 128 || !/^[\w-]+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const auth = await verifyFirebaseIdToken(request).catch(() => null)
  const sessionRaw =
    (typeof body.sessionId === 'string' ? body.sessionId.trim() : '') ||
    request.headers.get('x-feed-session')?.trim() ||
    ''
  const sessionId =
    sessionRaw && sessionRaw.length >= 8 && sessionRaw.length <= 80 && /^[\w-]+$/.test(sessionRaw)
      ? sessionRaw
      : null

  try {
    const result = await recordArticleEngagement({
      articleKey: id,
      source: 'open',
      dwellMs: 0,
      countView: true,
      userId: auth?.uid ?? null,
      sessionId,
      clientIp: ip,
      userAgent: request.headers.get('user-agent'),
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[news/view]', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
