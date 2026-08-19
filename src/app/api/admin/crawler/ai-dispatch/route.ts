import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { isCrawlerAiDispatchDryRun, isCrawlerAiDispatchEnabled, crawlerAiDispatchDryRunStatus } from '@/services/crawler/dispatch'
import { crawlerAiDispatchConfig } from '@/services/crawler/aiDispatch/flags'
import { periodKeys } from '@/services/crawler/aiDispatch/budget'
import { emptyCircuit } from '@/services/crawler/aiDispatch/circuit'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { estimateDispatchCost } from '@/services/crawler/aiDispatch/cost'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cfg = crawlerAiDispatchConfig()
  const now = new Date()
  const keys = periodKeys(now)
  const dispatchEnabled = isCrawlerAiDispatchEnabled()
  const dryRunStatus = crawlerAiDispatchDryRunStatus()
  const dryRun = isCrawlerAiDispatchDryRun()
  const pricingProbe = estimateDispatchCost({
    estimatedInputTokens: 800,
    estimatedOutputTokens: 200,
    estimatedTotalTokens: 1000,
  })
  const payload = {
    automaticAi: dispatchEnabled ? 'AÇIK' : 'KAPALI',
    dispatchStatus: dispatchEnabled ? 'AÇIK' : 'KAPALI',
    dryRun: dryRunStatus,
    observationMode: !dispatchEnabled || dryRun ? 'SHADOW' : 'REAL',
    actualAiRequests: 0,
    actualAiCostUsd: 0,
    estimatedCostLabel: pricingProbe.known ? 'KNOWN' : 'COST_UNKNOWN',
    pricingState: pricingProbe.known ? 'TANIMLI' : 'FİYATLANDIRMA TANIMSIZ',
    pricingReason: pricingProbe.known ? null : 'COST_UNKNOWN',
    runningJobs: 0,
    approvedBacklog: 0,
    aiWaiting: 0,
    circuit: emptyCircuit(cfg.provider),
    config: {
      dailyBudgetUsd: cfg.dailyBudgetUsd,
      hourlyBudgetUsd: cfg.hourlyBudgetUsd,
      maxRequestsPerHour: cfg.maxRequestsPerHour,
      maxRequestsPerDay: cfg.maxRequestsPerDay,
      maxEventsPerTick: cfg.maxEventsPerTick,
      maxConcurrentJobs: cfg.maxConcurrentJobs,
      maxCostUsdPerEvent: cfg.maxCostUsdPerEvent,
      maxInputTokensPerEvent: cfg.maxInputTokensPerEvent,
      provider: cfg.provider,
      model: cfg.model,
    },
    today: {
      periodKey: keys.day,
      budget: cfg.dailyBudgetUsd,
      reserved: 0,
      spent: 0,
      remaining: cfg.dailyBudgetUsd,
      requests: 0,
      requestLimit: cfg.maxRequestsPerDay,
    },
    hour: {
      periodKey: keys.hour,
      budget: cfg.hourlyBudgetUsd,
      reserved: 0,
      spent: 0,
      remaining: cfg.hourlyBudgetUsd,
      requests: 0,
      requestLimit: cfg.maxRequestsPerHour,
    },
    counts: { eligible: 0, ready: 0, blocked: 0, watching: 0, processed: 0 },
    ready: [] as unknown[],
    blocked: [] as unknown[],
    watching: [] as unknown[],
    completed: [] as unknown[],
    failed: [] as unknown[],
    alert: null as string | null,
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ...payload, postgres: false })
  }

  try {
    const { DrizzleAiDispatchStore } = await import('@/services/crawler/aiDispatch/drizzleStore')
    const store = new DrizzleAiDispatchStore()
    const crawler = new DrizzleCrawlerStore()
    const shadow = await store.listShadow({ limit: 120 })
    const jobs = await store.listJobs({ limit: 80 })
    const circuit = await store.getCircuit(cfg.provider)
    const dayW = await store.getBudgetWindow('crawler_automatic', 'day', keys.day)
    const hourW = await store.getBudgetWindow('crawler_automatic', 'hour', keys.hour)
    const funnel = await crawler.countClusterFunnel()

    const mapShadow = (row: (typeof shadow)[number]) => ({
      clusterId: row.clusterId,
      title: row.canonicalTitle,
      sources: row.selectedSourceNames,
      sourceCount: row.selectedSourceCount,
      importance: row.importanceScore,
      localImportance: row.localImportance,
      eligibility: row.eligibility,
      estimatedTokens: row.estimatedInputTokens,
      estimatedCostUsd: row.estimatedCostUsd,
      estimatedCostKnown: row.estimatedCostUsd != null,
      blockedReason: row.blockedReason,
      dispatchType: row.dispatchType,
      wouldDispatch: row.wouldDispatch,
    })

    payload.circuit = circuit
    payload.today.reserved = dayW.reservedUsd
    payload.today.spent = dayW.spentUsd
    payload.today.remaining = Math.max(0, cfg.dailyBudgetUsd - dayW.reservedUsd - dayW.spentUsd)
    payload.today.requests = dayW.requestCount
    payload.hour.reserved = hourW.reservedUsd
    payload.hour.spent = hourW.spentUsd
    payload.hour.remaining = Math.max(0, cfg.hourlyBudgetUsd - hourW.reservedUsd - hourW.spentUsd)
    payload.hour.requests = hourW.requestCount
    payload.ready = shadow.filter((s) => s.wouldDispatch).map(mapShadow)
    payload.blocked = shadow.filter((s) => !s.wouldDispatch && s.blockedReason && s.blockedReason !== 'WATCHING').map(mapShadow)
    payload.watching = []
    payload.completed = jobs
      .filter((j) => j.status === 'COMPLETED')
      .map((j) => ({
        clusterId: j.clusterId,
        title: j.eventKey,
        sources: [] as string[],
        sourceCount: j.selectedSourceCount,
        importance: j.priority,
        localImportance: 0,
        eligibility: j.eligibilityStatus,
        estimatedTokens: j.estimatedInputTokens,
        estimatedCostUsd: j.actualCostUsd ?? j.estimatedCostUsd,
        blockedReason: j.blockedReason,
        dispatchType: j.dispatchType,
        wouldDispatch: false,
      }))
    payload.failed = jobs
      .filter((j) => j.status === 'FAILED' || j.status === 'BLOCKED')
      .map((j) => ({
        clusterId: j.clusterId,
        title: j.eventKey,
        sources: [] as string[],
        sourceCount: j.selectedSourceCount,
        importance: j.priority,
        localImportance: 0,
        eligibility: j.eligibilityStatus,
        estimatedTokens: j.estimatedInputTokens,
        estimatedCostUsd: j.estimatedCostUsd,
        blockedReason: j.blockedReason || j.failureReason,
        dispatchType: j.dispatchType,
        wouldDispatch: false,
      }))
    payload.counts = {
      eligible: funnel.eligible + funnel.highPriority,
      ready: payload.ready.length,
      blocked: payload.blocked.length,
      watching: funnel.watching,
      processed: payload.completed.length,
    }
    payload.actualAiRequests = 0
    payload.actualAiCostUsd = 0
    payload.runningJobs = jobs.filter((j) => j.status === 'PROCESSING' || j.status === 'RESERVED').length
    payload.approvedBacklog = funnel.approvedForAi
    payload.aiWaiting = funnel.approvedForAi
    if (circuit.state === 'OPEN' && circuit.reason === 'insufficient_balance') {
      payload.alert = 'DeepSeek bakiyesi yetersiz (HTTP 402). Otomatik AI durdu; crawler devam ediyor.'
    } else if (circuit.state === 'OPEN') {
      payload.alert = `Sağlayıcı devre açık: ${circuit.reason || 'unknown'}`
    }
    return NextResponse.json({ ...payload, postgres: true })
  } catch (err) {
    return NextResponse.json({
      ...payload,
      postgres: true,
      error: err instanceof Error ? err.message : 'dispatch_admin_unavailable',
    })
  }
}
