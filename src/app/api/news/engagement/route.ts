import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import {
  clampEngagementDwellMs,
  shouldCountEngagementView,
  type ArticleEngagementSource,
} from '@/lib/feed/articleEngagement'
import { recordArticleEngagement } from '@/services/feed/articleEngagement.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SOURCES = new Set<ArticleEngagementSource>(['feed', 'story', 'open', 'reader', 'page'])

function parseSessionId(value: unknown, header: string | null): string | null {
  const fromBody = typeof value === 'string' ? value.trim() : ''
  const fromHeader = header?.trim() || ''
  const raw = fromBody || fromHeader
  if (!raw || raw.length < 8 || raw.length > 80 || !/^[\w-]+$/.test(raw)) return null
  return raw
}

/**
 * Feed 2 / story / article-open / page view + dwell writer.
 * Client applies the 3s gate; server upserts one watch session per actor+surface.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (!checkRateLimit(`news-engagement:${ip}`, 80, 60_000)) {
    return rateLimitResponse()
  }

  let body: {
    id?: unknown
    source?: unknown
    dwellMs?: unknown
    countView?: unknown
    sessionId?: unknown
  } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id || id.length > 128 || !/^[\w-]+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const source = SOURCES.has(body.source as ArticleEngagementSource)
    ? (body.source as ArticleEngagementSource)
    : null
  if (!source) {
    return NextResponse.json({ error: 'invalid source' }, { status: 400 })
  }

  const dwellMs = clampEngagementDwellMs(body.dwellMs)
  const countView =
    typeof body.countView === 'boolean'
      ? body.countView
      : shouldCountEngagementView(source, dwellMs)

  if (!countView && !dwellMs) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const auth = await verifyFirebaseIdToken(request).catch(() => null)
  const sessionId = parseSessionId(body.sessionId, request.headers.get('x-feed-session'))

  try {
    const result = await recordArticleEngagement({
      articleKey: id,
      source,
      dwellMs,
      countView,
      userId: auth?.uid ?? null,
      sessionId,
      clientIp: ip,
      userAgent: request.headers.get('user-agent'),
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[news/engagement]', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
