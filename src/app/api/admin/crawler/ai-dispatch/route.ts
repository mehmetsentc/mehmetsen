import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { isCrawlerAiDispatchDryRun, isCrawlerAiDispatchEnabled } from '@/services/crawler/dispatch'
import { crawlerAiDispatchConfig } from '@/services/crawler/aiDispatch/flags'
import { periodKeys } from '@/services/crawler/aiDispatch/budget'
import { emptyCircuit } from '@/services/crawler/aiDispatch/circuit'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cfg = crawlerAiDispatchConfig()
  const now = new Date()
  const keys = periodKeys(now)
  const dispatchEnabled = isCrawlerAiDispatchEnabled()
  const dryRun = isCrawlerAiDispatchDryRun()
  const payload = {
    automaticAi: dispatchEnabled ? 'ON' : 'OFF',
    dryRun: dryRun ? 'ON' : 'OFF',
    observationMode: !dispatchEnabled || dryRun ? 'SHADOW' : 'REAL',
    actualAiRequests: 0,
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
    const clusters = await crawler.listClusters({ since: new Date(Date.now() - 24 * 3600 * 1000), limit: 120 })

    const mapShadow = (row: (typeof shadow)[number]) => ({
      clusterId: row.clusterId,
      title: row.canonicalTitle,
      sources: row.selectedSourceNames,
      sourceCount: row.selectedSourceCount,
      importance: row.importanceScore,
      localImportance: row.localImportance,
      eligibility: row.eligibility,
      estimatedTokens: row.estimatedInputTokens,
      estimatedCostUsd: row.estimatedPipelineCostUsd ?? row.estimatedCostUsd,
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
    payload.watching = clusters
      .filter((c) => c.aiEligibility === 'WATCHING')
      .map((c) => ({
        clusterId: c.id,
        title: c.canonicalTitle || c.normalizedTopic,
        sources: [] as string[],
        sourceCount: c.uniqueSourceCount,
        importance: c.importanceScore,
        localImportance: c.localImportance,
        eligibility: c.aiEligibility,
        estimatedTokens: null,
        estimatedCostUsd: null,
        blockedReason: 'WATCHING',
        dispatchType: 'INITIAL',
        wouldDispatch: false,
      }))
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
      eligible: clusters.filter((c) => c.aiEligibility === 'ELIGIBLE' || c.aiEligibility === 'HIGH_PRIORITY').length,
      ready: payload.ready.length,
      blocked: payload.blocked.length,
      watching: payload.watching.length,
      processed: payload.completed.length,
    }
    payload.actualAiRequests = jobs.filter((j) => j.actualInputTokens != null).length
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
