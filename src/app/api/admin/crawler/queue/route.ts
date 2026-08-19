import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { dispatchCrawlerArticleToNewsroom, isCrawlerAiDispatchEnabled } from '@/services/crawler/dispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing', clusters: [] }, { status: 503 })
  const url = new URL(request.url)
  const eligibility = url.searchParams.get('eligibility')
  const editorialDecision = url.searchParams.get('editorialDecision')
  const store = new DrizzleCrawlerStore()
  const clusters = await store.listClusters({
    since: new Date(Date.now() - 24 * 3600 * 1000),
    eligibility,
    editorialDecision,
    limit: 400,
  })
  const decisions = await store.countClusterEditorialDecisions()
  const approvedForAi = decisions.APPROVED_FOR_AI || 0
  const dispatchEnabled = isCrawlerAiDispatchEnabled()
  const queue = clusters
    .filter((c) => {
      if (editorialDecision) return c.editorialDecision === editorialDecision
      if (eligibility) return c.aiEligibility === eligibility
      return ['WATCHING', 'ELIGIBLE', 'HIGH_PRIORITY', 'REJECTED'].includes(c.aiEligibility) ||
        c.editorialDecision === 'APPROVED_FOR_AI' ||
        c.editorialDecision === 'ARCHIVED'
    })
    .sort((a, b) => b.importanceScore - a.importanceScore)
    .slice(0, 120)
  return NextResponse.json({
    aiCalls: dispatchCrawlerArticleToNewsroom().aiRequests,
    dispatchEnabled,
    approvedForAi,
    editorRejected: decisions.REJECTED || 0,
    archived: decisions.ARCHIVED || 0,
    clusters: queue.map((c) => ({
      id: c.id,
      canonicalTitle: c.canonicalTitle || c.normalizedTopic,
      aiEligibility: c.aiEligibility,
      aiEligibilityReason: c.aiEligibilityReason,
      editorialDecision: c.editorialDecision,
      uniqueSourceCount: c.uniqueSourceCount,
      articleCount: c.articleCount,
      importanceScore: c.importanceScore,
      freshnessScore: c.freshnessScore,
      lastSeenAt: c.lastSeenAt,
      ageMinutes: Math.round((Date.now() - c.firstSeenAt.getTime()) / 60000),
    })),
  })
}
