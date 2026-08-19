import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { dispatchCrawlerArticleToNewsroom, isCrawlerAiDispatchEnabled } from '@/services/crawler/dispatch'
import { parseClusterListQuery } from '@/services/crawler/editorial/query'
import { approvedAiStatus, eventAgeHours, sourceDiversityLabel } from '@/services/crawler/editorial/controlPlane'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing', clusters: [] }, { status: 503 })
  const url = new URL(request.url)
  const query = parseClusterListQuery(url)
  const store = new DrizzleCrawlerStore()
  const page = await store.listClustersPage(query)
  const tabs = await store.countClusterTabs(query)
  const funnel = await store.countClusterFunnel()
  const dispatchEnabled = isCrawlerAiDispatchEnabled()
  const approvedForAi = funnel.approvedForAi
  return NextResponse.json({
    aiCalls: dispatchCrawlerArticleToNewsroom().aiRequests,
    dispatchEnabled,
    approvedForAi,
    editorRejected: funnel.rejected,
    archived: funnel.archived,
    tabs,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
    clusters: page.clusters.map((c) => ({
      id: c.id,
      canonicalTitle: c.canonicalTitle || c.normalizedTopic,
      countryCode: c.countryCode,
      city: c.city,
      region: c.region,
      aiEligibility: c.aiEligibility,
      aiEligibilityReason: c.aiEligibilityReason,
      editorialDecision: c.editorialDecision,
      editorialPriority: c.editorialPriority,
      approvalSource: c.approvalSource,
      approvedBy: c.editorialDecision === 'APPROVED_FOR_AI' ? c.editorialDecidedBy : null,
      approvedAt: c.editorialDecision === 'APPROVED_FOR_AI' ? c.editorialDecidedAt : null,
      uniqueSourceCount: c.uniqueSourceCount,
      articleCount: c.articleCount,
      sourceDiversity: sourceDiversityLabel(c.articleCount, c.uniqueSourceCount),
      importanceScore: c.importanceScore,
      clusterConfidence: c.clusterConfidence,
      freshnessScore: c.freshnessScore,
      lastSeenAt: c.lastSeenAt,
      firstSeenAt: c.firstSeenAt,
      ageHours: Number(eventAgeHours(c).toFixed(1)),
      ageMinutes: Math.round(eventAgeHours(c) * 60),
      aiStatus:
        c.editorialDecision === 'APPROVED_FOR_AI'
          ? approvedAiStatus({ dispatchEnabled })
          : null,
    })),
  })
}
