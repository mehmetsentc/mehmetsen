import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { dispatchCrawlerArticleToNewsroom } from '@/services/crawler/dispatch'
import { parseClusterListQuery } from '@/services/crawler/editorial/query'
import { eventAgeHours, sourceDiversityLabel } from '@/services/crawler/editorial/controlPlane'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'DATABASE_URL missing', clusters: [] }, { status: 503 })
  }
  const url = new URL(request.url)
  const hours = url.searchParams.get('hours')
  const query = parseClusterListQuery(url)
  if (hours && !query.maxAgeHours) {
    const n = Number(hours)
    if (Number.isFinite(n) && n > 0) query.maxAgeHours = n
  }
  const store = new DrizzleCrawlerStore()
  const page = await store.listClustersPage(query)
  return NextResponse.json({
    aiCalls: dispatchCrawlerArticleToNewsroom().aiRequests,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
    clusters: page.clusters.map((c) => ({
      id: c.id,
      canonicalTitle: c.canonicalTitle || c.normalizedTopic,
      status: c.eventStatus,
      countryCode: c.countryCode,
      city: c.city,
      firstSeenAt: c.firstSeenAt,
      lastSeenAt: c.lastSeenAt,
      articleCount: c.articleCount,
      uniqueSourceCount: c.uniqueSourceCount,
      sourceDiversity: sourceDiversityLabel(c.articleCount, c.uniqueSourceCount),
      clusterConfidence: c.clusterConfidence,
      importanceScore: c.importanceScore,
      aiEligibility: c.aiEligibility,
      aiEligibilityReason: c.aiEligibilityReason,
      editorialDecision: c.editorialDecision,
      editorialDecisionReason: c.editorialDecisionReason,
      editorialPriority: c.editorialPriority,
      hasMaterialUpdate: c.hasMaterialUpdate,
      ageHours: Number(eventAgeHours(c).toFixed(1)),
    })),
  })
}
