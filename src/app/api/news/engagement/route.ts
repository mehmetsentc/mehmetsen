import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'
import {
  clampEngagementDwellMs,
  shouldCountEngagementView,
  type ArticleEngagementSource,
} from '@/lib/feed/articleEngagement'
import { recordArticleEngagement } from '@/services/feed/articleEngagement.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SOURCES = new Set<ArticleEngagementSource>(['feed', 'story', 'open'])

/**
 * Feed 2 / story / article-open view + read-time writer.
 * Client applies the 3s gate and per-session view dedupe; this persists counters.
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

  try {
    const result = await recordArticleEngagement({
      articleKey: id,
      source,
      dwellMs,
      countView,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[news/engagement]', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
