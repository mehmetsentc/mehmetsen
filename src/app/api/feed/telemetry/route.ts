import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { isSmartFeedEnabled } from '@/lib/feed/featureFlag'
import { feedSeenService } from '@/services/feed/FeedSeenService'
import { feedTelemetryService } from '@/services/feed/FeedTelemetryService'
import type { FeedTelemetryBatchItem } from '@/types/smartFeed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isSmartFeedEnabled()) {
    return NextResponse.json({ error: 'Smart feed disabled' }, { status: 404 })
  }

  const auth = await verifyFirebaseIdToken(request)
  const sessionId = request.headers.get('x-feed-session')?.trim() || null

  const body = (await request.json().catch(() => ({}))) as {
    events?: FeedTelemetryBatchItem[]
    impressions?: Array<{
      articleId: string
      clusterId?: string | null
      publisherId?: string | null
      feedType?: string
    }>
  }

  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : []
  const impressions = Array.isArray(body.impressions) ? body.impressions.slice(0, 30) : []

  if (auth && impressions.length && hasDatabaseUrl()) {
    const feedType = impressions[0]?.feedType ?? 'personal'
    await feedSeenService.recordImpressions(auth.uid, null, feedType, impressions)
  }

  await feedTelemetryService.recordBatch(auth?.uid ?? null, sessionId, events)

  return NextResponse.json({ ok: true })
}
