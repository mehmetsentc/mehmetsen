import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { runCanaryStage } from '@/services/crawler/canary/execute'
import { MemoryCanaryStore } from '@/services/crawler/canary/store'
import type { CanaryClusterInput, CanaryMemberInput } from '@/services/crawler/canary/types'
import { isCrawlerAiDispatchEnabled } from '@/services/crawler/dispatch'
import { isLegacyDirectAiEnabled } from '@/services/crawler/legacyFlags'
import {
  estimateBalanceRunway,
  projectCostLadder,
  recommendAutomationLimits,
} from '@/services/crawler/canary/measurement'
import { probeCanaryPricing } from '@/services/crawler/canary/preflight'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function loadEvent(id: string): Promise<{
  cluster: CanaryClusterInput
  members: CanaryMemberInput[]
} | null> {
  const store = new DrizzleCrawlerStore()
  const cluster = await store.getCluster(id)
  if (!cluster) return null
  const memberships = await store.listMemberships(id)
  const members: CanaryMemberInput[] = []
  for (const m of memberships) {
    const article = await store.getRawArticle(m.articleId)
    const source = article ? await store.getSource(article.sourceId) : null
    const media = article ? await store.listArticleMedia(article.id) : []
    if (!article) continue
    members.push({
      articleId: article.id,
      sourceId: article.sourceId,
      sourceName: source?.name || article.sourceId,
      qualityTier: source?.qualityTier || 'UNTESTED',
      healthScore: source?.healthScore ?? 50,
      extractionConfidence: article.extractionConfidence,
      publishedAt: article.publishedAt,
      fetchedAt: article.fetchedAt,
      title: article.title,
      body: article.articleBodyText,
      description: article.description,
      contentHash: article.contentHash,
      wordCount: article.wordCount,
      isExactDuplicate: article.isExactDuplicate,
      editorialStatus: article.editorialStatus,
      editorialNewsId: article.editorialNewsId,
      sourceStatus: source?.status || 'ACTIVE',
      hasMedia: media.length > 0,
    })
  }
  return {
    cluster: {
      id: cluster.id,
      eventKey: cluster.eventKey,
      canonicalTitle: cluster.canonicalTitle,
      normalizedTopic: cluster.normalizedTopic,
      countryCode: cluster.countryCode,
      region: cluster.region,
      city: cluster.city,
      district: cluster.district,
      editorialDecision: cluster.editorialDecision,
      aiEligibility: cluster.aiEligibility,
      uniqueSourceCount: cluster.uniqueSourceCount,
      importanceScore: cluster.importanceScore,
      publishedNewsId: cluster.publishedNewsId,
      firstSeenAt: cluster.firstSeenAt,
      lastSeenAt: cluster.lastSeenAt,
      hasMaterialUpdate: cluster.hasMaterialUpdate,
    },
    members,
  }
}

/**
 * Stage 1: preflight only. Never executes paid DeepSeek.
 * POST body may include confirmation for future Stage 2 — still no spend here.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })
  const { id } = await context.params
  const loaded = await loadEvent(id)
  if (!loaded) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const memory = new MemoryCanaryStore()
  const result = await runCanaryStage({
    cluster: loaded.cluster,
    members: loaded.members,
    store: memory,
    executePaid: false,
  })

  const pricing = probeCanaryPricing()
  const costPerReq =
    pricing.known && pricing.inputCostPer1M != null && pricing.outputCostPer1M != null
      ? (800 / 1_000_000) * pricing.inputCostPer1M + (1600 / 1_000_000) * pricing.outputCostPer1M
      : null

  return NextResponse.json({
    stage: 'phase4c_stage1_preflight',
    paidCallExecuted: false,
    autoPublish: false,
    autoPublishLabelTr: 'KAPALI',
    crawlerAiDispatchEnabled: isCrawlerAiDispatchEnabled(),
    legacyDirectAiEnabled: isLegacyDirectAiEnabled(),
    preflight: result.preflight,
    job: result.job
      ? {
          id: result.job.id,
          state: result.job.state,
          blockedReason: result.job.blockedReason,
          estimatedCostUsd: result.job.estimatedCostUsd,
          lane: result.job.lane,
          outputTarget: result.job.outputTarget,
        }
      : null,
    messageTr: result.messageTr,
    projections: {
      ladder: projectCostLadder(costPerReq),
      balance5usd: estimateBalanceRunway({ balanceUsd: 5, costPerEventUsd: costPerReq }),
      automationRecommendation: recommendAutomationLimits(costPerReq),
    },
    confirmationNoteTr:
      'APPROVED_FOR_AI ücretli canary yetkisi vermez. Ücretli çağrı için ayrı Stage 2 onayı ve APPROVED_FOR_REAL_CANARY_EXECUTION gerekir.',
  })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })
  const { id } = await context.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const loaded = await loadEvent(id)
  if (!loaded) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Stage 1 hard stop: never honor executePaid from CMS yet
  const result = await runCanaryStage({
    cluster: loaded.cluster,
    members: loaded.members,
    store: new MemoryCanaryStore(),
    executePaid: false,
    confirmation: typeof body.confirmation === 'string' ? body.confirmation : null,
  })

  return NextResponse.json({
    stage: 'phase4c_stage1_preflight',
    paidCallExecuted: false,
    executePaidHonored: false,
    autoPublish: false,
    preflight: result.preflight,
    job: result.job
      ? {
          id: result.job.id,
          state: result.job.state,
          blockedReason: result.job.blockedReason,
          lane: result.job.lane,
        }
      : null,
    messageTr:
      'Stage 1: CANARY yalnızca preflight. Ücretli DeepSeek çağrısı sonraki aşamada, açık onay sonrası.',
  })
}
