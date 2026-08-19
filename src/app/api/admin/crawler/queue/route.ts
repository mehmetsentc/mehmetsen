import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { dispatchCrawlerArticleToNewsroom } from '@/services/crawler/dispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing', clusters: [] }, { status: 503 })
  const eligibility = new URL(request.url).searchParams.get('eligibility')
  const store = new DrizzleCrawlerStore()
  const clusters = await store.listClusters({
    since: new Date(Date.now() - 24 * 3600 * 1000),
    eligibility,
    limit: 120,
  })
  const queue = clusters
    .filter((c) => ['WATCHING', 'ELIGIBLE', 'HIGH_PRIORITY', 'REJECTED'].includes(c.aiEligibility))
    .sort((a, b) => b.importanceScore - a.importanceScore)
  return NextResponse.json({
    aiCalls: dispatchCrawlerArticleToNewsroom().aiRequests,
    dispatchEnabled: false,
    clusters: queue.map((c) => ({
      id: c.id,
      canonicalTitle: c.canonicalTitle || c.normalizedTopic,
      aiEligibility: c.aiEligibility,
      aiEligibilityReason: c.aiEligibilityReason,
      uniqueSourceCount: c.uniqueSourceCount,
      articleCount: c.articleCount,
      importanceScore: c.importanceScore,
      freshnessScore: c.freshnessScore,
      lastSeenAt: c.lastSeenAt,
      ageMinutes: Math.round((Date.now() - c.firstSeenAt.getTime()) / 60000),
    })),
  })
}
