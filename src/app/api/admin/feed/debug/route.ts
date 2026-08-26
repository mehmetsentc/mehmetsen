import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { isSmartFeedRankingV1Enabled } from '@/lib/feed/featureFlag'
import { hasDatabaseUrl } from '@/db'
import { feedRankingPipeline } from '@/services/feed/FeedRankingPipeline'
import { feedSeenService } from '@/services/feed/FeedSeenService'
import type { FeedMode } from '@/types/smartFeed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODES = new Set<FeedMode>(['personal', 'following', 'breaking', 'local'])

function parseMode(raw: string | null): FeedMode {
  const m = (raw ?? 'personal').trim().toLowerCase()
  if (MODES.has(m as FeedMode)) return m as FeedMode
  return 'personal'
}

/** Admin-only feed ranking debug — score breakdown + candidate counts. */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production' && !isSmartFeedRankingV1Enabled()) {
    return NextResponse.json({ error: 'Ranking debug unavailable' }, { status: 404 })
  }

  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })

  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')?.trim() || null
  const mode = parseMode(url.searchParams.get('mode'))
  const citySlug = url.searchParams.get('city')?.trim() || null

  const { seenArticles, seenClusters } = await feedSeenService.filterSuppressible(userId, null, mode, [])

  const result = await feedRankingPipeline.run({
    userId,
    mode,
    limit: 20,
    refresh: true,
    citySlug,
    seenArticles,
    seenClusters,
  })

  return NextResponse.json({
    mode,
    userId,
    rankingVersion: result.rankingVersion,
    candidateCounts: result.candidateCounts,
    sessionId: result.session.sessionId,
    items: result.ranked.map((r) => ({
      articleId: r.articleId,
      headline: r.headline,
      reason: r.reason,
      score: r.score,
      breakdown: r.breakdown,
      source: r.source,
      publisherId: r.publisherId,
      category: r.category,
    })),
  })
}
