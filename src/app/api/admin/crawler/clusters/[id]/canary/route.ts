import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { runCanaryStage } from '@/services/crawler/canary/execute'
import { DrizzleCanaryStore } from '@/services/crawler/canary/drizzleStore'
import { createDeepSeekCanaryProvider } from '@/services/crawler/canary/provider'
import { isAuthorizedPaidCanaryEvent } from '@/services/crawler/canary/authorizedEvent'
import type { CanaryClusterInput, CanaryMemberInput } from '@/services/crawler/canary/types'
import { APPROVED_FOR_REAL_CANARY_EXECUTION } from '@/services/crawler/canary/types'
import { isCrawlerAiDispatchEnabled } from '@/services/crawler/dispatch'
import { isLegacyDirectAiEnabled } from '@/services/crawler/legacyFlags'
import {
  estimateBalanceRunway,
  projectCostLadder,
  recommendAutomationLimits,
} from '@/services/crawler/canary/measurement'
import { probeCanaryPricing } from '@/services/crawler/canary/preflight'
import { canaryConfig } from '@/services/crawler/canary/flags'

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

function serializeJob(job: NonNullable<Awaited<ReturnType<typeof runCanaryStage>>['job']>) {
  return {
    id: job.id,
    state: job.state,
    blockedReason: job.blockedReason,
    failureReason: job.failureReason,
    estimatedCostUsd: job.estimatedCostUsd,
    actualCostUsd: job.actualCostUsd,
    actualInputTokens: job.actualInputTokens,
    actualOutputTokens: job.actualOutputTokens,
    requestCount: job.requestCount,
    model: job.model,
    provider: job.provider,
    lane: job.lane,
    outputTarget: job.outputTarget,
    draftStatus: job.draftStatus,
    editorialDraftId: job.editorialDraftId,
    autoPublish: false,
    draft: job.draft,
    validation: job.validation
      ? { ok: job.validation.ok, issues: job.validation.issues }
      : null,
    factFlags: job.factFlags,
  }
}

/**
 * Preflight (and read back existing canary job). Never spends on GET.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })
  const { id } = await context.params
  const loaded = await loadEvent(id)
  if (!loaded) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await runCanaryStage({
    cluster: loaded.cluster,
    members: loaded.members,
    store: new DrizzleCanaryStore(),
    executePaid: false,
  })

  const pricing = probeCanaryPricing()
  const costPerReq =
    pricing.known && pricing.inputCostPer1M != null && pricing.outputCostPer1M != null
      ? (800 / 1_000_000) * pricing.inputCostPer1M + (1600 / 1_000_000) * pricing.outputCostPer1M
      : null

  return NextResponse.json({
    stage: 'phase4c_canary',
    paidCallExecuted: false,
    autoPublish: false,
    autoPublishLabelTr: 'KAPALI',
    crawlerAiDispatchEnabled: isCrawlerAiDispatchEnabled(),
    legacyDirectAiEnabled: isLegacyDirectAiEnabled(),
    canaryPaidExecutionEnabled: canaryConfig().paidExecutionEnabled,
    authorizedEvent: isAuthorizedPaidCanaryEvent(id),
    preflight: result.preflight,
    job: result.job ? serializeJob(result.job) : null,
    messageTr: result.messageTr,
    projections: {
      ladder: projectCostLadder(costPerReq),
      balance5usd: estimateBalanceRunway({ balanceUsd: 5, costPerEventUsd: costPerReq }),
      automationRecommendation: recommendAutomationLimits(costPerReq),
    },
    confirmationNoteTr:
      'APPROVED_FOR_AI ücretli canary yetkisi vermez. Ücretli çağrı için APPROVED_FOR_REAL_CANARY_EXECUTION + yetkili event + CANARY_PAID_EXECUTION_ENABLED gerekir.',
  })
}

/**
 * Phase 4C.1: paid path only for the single authorized event when all gates pass.
 * Never enables CRAWLER_AI_DISPATCH_ENABLED. Never auto-publishes.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })
  const { id } = await context.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const loaded = await loadEvent(id)
  if (!loaded) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const confirmation = typeof body.confirmation === 'string' ? body.confirmation : null
  const wantPaid = body.executePaid === true
  const authorizedEvent = isAuthorizedPaidCanaryEvent(id)
  const confirmationOk = confirmation === APPROVED_FOR_REAL_CANARY_EXECUTION
  const paidEnabled = canaryConfig().paidExecutionEnabled

  // Fail-closed: wrong event / missing confirmation / flag off → preflight only
  const executePaid = wantPaid && authorizedEvent && confirmationOk && paidEnabled

  if (wantPaid && !authorizedEvent) {
    return NextResponse.json(
      {
        stage: 'phase4c_canary',
        paidCallExecuted: false,
        executePaidHonored: false,
        autoPublish: false,
        blockedReason: 'EVENT_NOT_AUTHORIZED',
        messageTr: 'Ücretli canary yalnızca yetkili tek olay için izinli.',
        crawlerAiDispatchEnabled: isCrawlerAiDispatchEnabled(),
        legacyDirectAiEnabled: isLegacyDirectAiEnabled(),
      },
      { status: 403 }
    )
  }

  const result = await runCanaryStage({
    cluster: loaded.cluster,
    members: loaded.members,
    store: new DrizzleCanaryStore(),
    executePaid,
    confirmation,
    provider: executePaid ? createDeepSeekCanaryProvider() : undefined,
  })

  return NextResponse.json({
    stage: 'phase4c_canary',
    paidCallExecuted: result.paidCallExecuted,
    executePaidHonored: executePaid,
    autoPublish: false,
    autoPublishLabelTr: 'KAPALI',
    crawlerAiDispatchEnabled: isCrawlerAiDispatchEnabled(),
    legacyDirectAiEnabled: isLegacyDirectAiEnabled(),
    canaryPaidExecutionEnabled: paidEnabled,
    authorizedEvent,
    preflight: result.preflight,
    job: result.job ? serializeJob(result.job) : null,
    idempotentReuse: result.idempotentReuse,
    messageTr: result.messageTr,
  })
}
