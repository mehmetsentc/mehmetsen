import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { describeRescrapePlan } from '@/services/crawler/ops/cleanupDryRun'
import { executeProtectedCleanup, previewProtectedCleanup } from '@/services/crawler/ops/cleanupExecute'
import { readCrawlerOpsState } from '@/services/crawler/ops/opsPersist'
import { isCrawlerAiDispatchEnabled } from '@/services/crawler/dispatch'
import { isLegacyDirectAiEnabled } from '@/services/crawler/legacyFlags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function publicPlan(plan: Awaited<ReturnType<typeof previewProtectedCleanup>>) {
  return {
    dryRun: true,
    executed: false,
    planHash: plan.planHash,
    rawTotal: plan.rawTotal,
    protectedPublishedRaw: plan.protectedPublishedRaw,
    protectedEditorialLinkedRaw: plan.protectedEditorialLinkedRaw,
    protectedManualEditorial: plan.protectedManualEditorial,
    rawEligible: plan.rawEligible,
    urlTotal: plan.urlTotal,
    urlEligible: plan.urlEligible,
    clusterTotal: plan.clusterTotal,
    clusterProtected: plan.clusterProtected,
    clusterEligible: plan.clusterEligible,
    membershipTotal: plan.membershipTotal,
    membershipEligible: plan.membershipEligible,
    mediaTotal: plan.mediaTotal,
    mediaProtected: plan.mediaProtected,
    mediaEligible: plan.mediaEligible,
    auditRows: plan.auditRows,
    provenanceRows: plan.provenanceRows,
    aiJobs: plan.aiJobs,
    ledgerRows: plan.ledgerRows,
    approvedForAi: plan.approvedForAi,
    publishedRaw: plan.publishedRaw,
    publishedNews: plan.publishedNews,
    sourceCount: plan.sourceCount,
    sourceActive: plan.sourceActive,
    sourcePaused: plan.sourcePaused,
    fetchingUrls: plan.fetchingUrls,
    invariants: plan.invariants,
    invariantOk: plan.invariantOk,
    notes: plan.notes,
  }
}

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })

  const execute = new URL(request.url).searchParams.get('execute') === '1'
  if (execute) {
    return NextResponse.json(
      { error: 'Gerçek silme yalnızca süper admin POST execute ile.', executed: false },
      { status: 409 }
    )
  }

  const store = new DrizzleCrawlerStore()
  const plan = await previewProtectedCleanup(store)
  const ops = await readCrawlerOpsState(store)
  return NextResponse.json({
    ...publicPlan(plan),
    ops,
    aiDispatchEnabled: isCrawlerAiDispatchEnabled(),
    legacyDirectAiEnabled: isLegacyDirectAiEnabled(),
    rescrape: describeRescrapePlan(),
  })
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:delete')
  if (!auth || auth.role !== 'super_admin') {
    return NextResponse.json({ error: 'Yalnızca süper admin' }, { status: 403 })
  }
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })

  const body = (await request.json().catch(() => ({}))) as { execute?: boolean; planHash?: string }
  const store = new DrizzleCrawlerStore()
  if (!body.execute) {
    const plan = await previewProtectedCleanup(store)
    return NextResponse.json({ ...publicPlan(plan), rescrape: describeRescrapePlan() })
  }

  if (isCrawlerAiDispatchEnabled() || isLegacyDirectAiEnabled()) {
    return NextResponse.json(
      { error: 'PHASE 4A.5 BLOCKED — AI gate must stay closed during cleanup', executed: false },
      { status: 409 }
    )
  }

  const result = await executeProtectedCleanup(store, {
    actorId: auth.uid,
    actorEmail: auth.email,
    actorRole: auth.role,
    confirmedPlanHash: body.planHash,
  })
  if (result.blocked) {
    return NextResponse.json(result, { status: 409 })
  }
  return NextResponse.json({
    ...result,
    dryRun: publicPlan(result.dryRun),
    livePlan: result.livePlan ? publicPlan(result.livePlan) : undefined,
    aiDispatchEnabled: false,
    legacyDirectAiEnabled: false,
    binaryObjectsDeleted: 0,
  })
}
