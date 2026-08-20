import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { dispatchCrawlerArticleToNewsroom } from '@/services/crawler/dispatch'
import { parseClusterListQuery } from '@/services/crawler/editorial/query'
import { toEventDeskRow } from '@/services/crawler/editorial/eventDesk'
import { databaseUnavailableResponse } from '@/lib/adminApiError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ clusters: null, total: null }), { status: 503 })
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
    clusters: page.clusters.map((c) => {
      const desk = toEventDeskRow(c)
      return {
        id: desk.id,
        canonicalTitle: desk.title,
        status: desk.status,
        statusLabel: desk.statusLabel,
        countryCode: c.countryCode,
        city: c.city,
        location: desk.location,
        category: desk.category,
        firstSeenAt: desk.firstSeenAt,
        lastSeenAt: desk.lastSeenAt,
        lastUpdateAt: desk.lastUpdateAt,
        articleCount: desk.articleCount,
        uniqueSourceCount: desk.independentSourceCount,
        independentSourceCount: desk.independentSourceCount,
        sourceDiversity: desk.sourceDiversity,
        clusterConfidence: desk.confidence,
        importanceScore: desk.quality,
        aiEligibility: desk.aiEligibility,
        aiEligibilityLabel: desk.aiEligibilityLabel,
        aiEligibilityReason: c.aiEligibilityReason,
        editorialDecision: desk.editorialDecision,
        editorialDecisionLabel: desk.editorialDecisionLabel,
        editorialDecisionReason: c.editorialDecisionReason,
        editorialPriority: desk.priority,
        editorialPriorityLabel: desk.priorityLabel,
        hasMaterialUpdate: desk.hasMaterialUpdate,
        primarySourceName: desk.primarySourceName,
        primaryArticleId: desk.primaryArticleId,
        primaryImageUrl: desk.bestMediaUrl,
        supportingSourceCount: desk.supportingSourceCount,
        ageHours: desk.ageHours,
        futureAiJobs: desk.futureAiJobs,
      }
    }),
  })
}
