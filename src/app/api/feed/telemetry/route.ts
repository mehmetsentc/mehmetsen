import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { isSmartFeedEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { feedSeenService } from '@/services/feed/FeedSeenService'
import { feedTelemetryService } from '@/services/feed/FeedTelemetryService'
import type { FeedTelemetryBatchItem } from '@/types/smartFeed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request)
  const allowed = await isSmartFeedEffectiveForUser(auth?.uid)
  if (!allowed) {
    return NextResponse.json({ error: 'Smart feed disabled' }, { status: 404 })
  }
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

  if (impressions.length && hasDatabaseUrl()) {
    const feedType = impressions[0]?.feedType ?? 'personal'
    // Authenticated: persist by UID. Guest: persist by feed session so refresh
    // can suppress qualified impressions without mixing identities.
    if (auth?.uid) {
      await feedSeenService.recordImpressions(auth.uid, null, feedType, impressions)
    } else if (sessionId) {
      await feedSeenService.recordImpressions(null, sessionId, feedType, impressions)
    }
  }

  // Haberi Oku / article detail = durable consumed (NOT a qualified impression).
  const articleOpens = events.filter(
    (e) => e.eventType === 'article_opened' && typeof e.articleId === 'string' && e.articleId.trim()
  )
  if (articleOpens.length && hasDatabaseUrl()) {
    const opens = articleOpens.map((e) => ({
      articleId: e.articleId!.trim(),
      clusterId:
        typeof e.metadata?.clusterId === 'string'
          ? e.metadata.clusterId
          : typeof e.clusterId === 'string'
            ? e.clusterId
            : null,
      publisherId:
        typeof e.metadata?.publisherId === 'string'
          ? e.metadata.publisherId
          : null,
      feedType: typeof e.feedType === 'string' ? e.feedType : 'personal',
    }))
    const feedType = opens[0]?.feedType ?? 'personal'
    if (auth?.uid) {
      await feedSeenService.recordArticleOpens(auth.uid, null, feedType, opens)
    } else if (sessionId) {
      await feedSeenService.recordArticleOpens(null, sessionId, feedType, opens)
    }
  }

  await feedTelemetryService.recordBatch(auth?.uid ?? null, sessionId, events)

  return NextResponse.json({ ok: true })
}
