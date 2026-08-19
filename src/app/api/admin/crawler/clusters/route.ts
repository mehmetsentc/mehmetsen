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
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'DATABASE_URL missing', clusters: [] }, { status: 503 })
  }
  const url = new URL(request.url)
  const store = new DrizzleCrawlerStore()
  const sinceHours = Number(url.searchParams.get('hours') || '24')
  const since = new Date(Date.now() - Math.max(1, sinceHours) * 3600 * 1000)
  const clusters = await store.listClusters({
    since,
    countryCode: url.searchParams.get('country') || null,
    city: url.searchParams.get('city') || null,
    eligibility: url.searchParams.get('eligibility') || null,
    minSources: url.searchParams.get('minSources') ? Number(url.searchParams.get('minSources')) : undefined,
    limit: 120,
  })
  return NextResponse.json({
    aiCalls: dispatchCrawlerArticleToNewsroom().aiRequests,
    clusters: clusters.map((c) => ({
      id: c.id,
      canonicalTitle: c.canonicalTitle || c.normalizedTopic,
      status: c.eventStatus,
      countryCode: c.countryCode,
      city: c.city,
      firstSeenAt: c.firstSeenAt,
      lastSeenAt: c.lastSeenAt,
      articleCount: c.articleCount,
      uniqueSourceCount: c.uniqueSourceCount,
      clusterConfidence: c.clusterConfidence,
      importanceScore: c.importanceScore,
      aiEligibility: c.aiEligibility,
      aiEligibilityReason: c.aiEligibilityReason,
      hasMaterialUpdate: c.hasMaterialUpdate,
    })),
  })
}
