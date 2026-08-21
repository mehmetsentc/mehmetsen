import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import {
  isCrawlerAiDispatchDryRun,
  isCrawlerAiDispatchEnabled,
  crawlerAiDispatchDryRunStatus,
} from '@/services/crawler/dispatch'
import { crawlerAiDispatchConfig, getCrawlerAiProviderReadiness } from '@/services/crawler/aiDispatch/flags'
import { periodKeys } from '@/services/crawler/aiDispatch/budget'
import { emptyCircuit } from '@/services/crawler/aiDispatch/circuit'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { estimateDispatchCost } from '@/services/crawler/aiDispatch/cost'
import { crawlerAiModeStatus } from '@/services/crawler/aiMode'
import { autoDraftBudgetLimits } from '@/services/crawler/autoDraft/budgetLimits'
import {
  buildCostCmsPayload,
  costCmsUnavailablePayload,
} from '@/services/crawler/autoDraft/costAggregates'
import { aggregateUniqueEconomicMetrics } from '@/services/crawler/autoDraft/shadowUniqueEconomics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cfg = crawlerAiDispatchConfig()
  const limits = autoDraftBudgetLimits()
  const modeStatus = crawlerAiModeStatus()
  const providerReadiness = getCrawlerAiProviderReadiness()
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
  const modeLabelTr =
    modeStatus.mode === 'CONTROLLED_AUTO_DRAFT'
      ? 'KONTROLLÜ OTOMATİK TASLAK'
      : modeStatus.mode === 'FULL_AUTO_DRAFT'
        ? 'TAM OTOMATİK TASLAK'
        : modeStatus.mode === 'SHADOW_AUTO_DRAFT'
          ? 'GÖLGE OTOMATİK TASLAK'
          : modeStatus.mode === 'MANUAL_CANARY'
            ? 'MANUEL CANARY'
            : 'KAPALI'
  const payload = {
    automaticAi: dispatchEnabled ? 'AÇIK' : 'KAPALI',
    dispatchStatus: dispatchEnabled ? 'AÇIK' : 'KAPALI',
    dispatchMode: modeStatus.mode,
    aiModeLabelTr: modeLabelTr,
    providerStatusLabelTr: providerReadiness.statusLabelTr,
    providerReady: providerReadiness.ready,
    providerReason: providerReadiness.reason,
    providerNotes: providerReadiness.notesTr,
    providerCredentialPresent: providerReadiness.credentialPresent,
    providerModel: providerReadiness.model,
    gateStatus: modeStatus.autoDraftEnabled ? 'AUTO_DRAFT_ARMED' : 'CLOSED',
    modeNotes: modeStatus.notesTr,
    autoPublish: false as const,
    dryRun: dryRunStatus,
    observationMode: !dispatchEnabled || dryRun ? 'SHADOW' : 'REAL',
    actualAiRequests: null as number | null,
    actualAiCostUsd: null as number | null,
    estimatedCostLabel: pricingProbe.known ? 'KNOWN' : 'COST_UNKNOWN',
    pricingState: pricingProbe.known ? 'TANIMLI' : 'FİYATLANDIRMA TANIMSIZ',
    pricingReason: pricingProbe.known ? null : 'COST_UNKNOWN',
    runningJobs: null as number | null,
    approvedBacklog: null as number | null,
    aiWaiting: null as number | null,
    costBlocked: 0,
    circuit: emptyCircuit(cfg.provider),
    config: {
      dailyBudgetUsd: limits.maxDailyCostUsd,
      hourlyBudgetUsd: limits.maxHourlyCostUsd,
      monthlyBudgetUsd: limits.maxMonthlyCostUsd,
      maxRequestsPerHour: limits.maxDraftsPerHour,
      maxRequestsPerDay: limits.maxDraftsPerDay,
      maxEventsPerTick: cfg.maxEventsPerTick,
      maxConcurrentJobs: cfg.maxConcurrentJobs,
      maxCostUsdPerEvent: limits.maxCostPerEventUsd,
      maxInputTokensPerEvent: cfg.maxInputTokensPerEvent,
      provider: cfg.provider,
      model: cfg.model,
      mode: modeStatus.mode,
    },
    today: {
      periodKey: keys.day,
      budget: limits.maxDailyCostUsd,
      reserved: 0,
      spent: 0,
      remaining: limits.maxDailyCostUsd,
      requests: 0,
      requestLimit: limits.maxDraftsPerDay,
    },
    hour: {
      periodKey: keys.hour,
      budget: limits.maxHourlyCostUsd,
      reserved: 0,
      spent: 0,
      remaining: limits.maxHourlyCostUsd,
      requests: 0,
      requestLimit: limits.maxDraftsPerHour,
    },
    month: {
      periodKey: keys.month,
      budget: limits.maxMonthlyCostUsd,
      reserved: 0,
      spent: 0,
      remaining: limits.maxMonthlyCostUsd,
      requests: 0,
    },
    counts: { eligible: 0, ready: 0, blocked: 0, watching: 0, processed: 0 },
    ready: [] as unknown[],
    blocked: [] as unknown[],
    watching: [] as unknown[],
    completed: [] as unknown[],
    failed: [] as unknown[],
    jobs: [] as unknown[],
    costAggregates: null as
      | ReturnType<typeof buildCostCmsPayload>
      | ReturnType<typeof costCmsUnavailablePayload>
      | null,
    shadowEconomics: null as
      | {
          available: true
          evaluated: number
          uniqueEventRevisions: number
          wouldDispatch: number
          wouldBlock: number
          uniqueWouldDispatch: number
          uniqueWouldBlock: number
          estimatedSpendUsd: number | null
          estimatedPreventedUsd: number | null
          byPrespend: Record<string, number>
          byTier: Record<string, number>
          helpTr: string
        }
      | { available: false; displayTr: 'Veri alınamadı' }
      | null,
    alert: null as string | null,
    dataUnavailable: false,
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json({
      ...payload,
      postgres: false,
      dataUnavailable: true,
      alert: 'Veri kaynağına ulaşılamıyor',
      costAggregates: costCmsUnavailablePayload(),
    })
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
    const monthW = await store.getBudgetWindow('crawler_automatic', 'month', keys.month)
    const funnel = await crawler.countClusterFunnel()
    const ledger = await store.listLedger({
      since: new Date(now.getTime() - 30 * 86_400_000),
    })

    let shadowEconomics: {
      available: true
      evaluated: number
      uniqueEventRevisions: number
      wouldDispatch: number
      wouldBlock: number
      uniqueWouldDispatch: number
      uniqueWouldBlock: number
      estimatedSpendUsd: number | null
      estimatedPreventedUsd: number | null
      byPrespend: Record<string, number>
      byTier: Record<string, number>
      helpTr: string
    } | { available: false; displayTr: 'Veri alınamadı' } = {
      available: false,
      displayTr: 'Veri alınamadı',
    }
    try {
      const since = new Date(now.getTime() - 24 * 86_400_000)
      const evaluations = store.listShadowDecisions
        ? await store.listShadowDecisions({ limit: 2000, since })
        : []
      const economic = store.listShadowEconomicDecisions
        ? await store.listShadowEconomicDecisions({ limit: 2000, since })
        : []
      const byPrespend: Record<string, number> = {}
      let wouldDispatch = 0
      let wouldBlock = 0
      for (const d of evaluations) {
        byPrespend[d.prespendOutcome] = (byPrespend[d.prespendOutcome] || 0) + 1
        if (d.action === 'WOULD_DISPATCH') wouldDispatch += 1
        else wouldBlock += 1
      }
      const uniqueRows =
        economic.length > 0
          ? economic.map((e) => ({
              clusterId: e.clusterId,
              contentFingerprint: e.contentFingerprint,
              prespendGateVersion: e.prespendGateVersion,
              action: e.action,
              blockReason: e.blockReason,
              economicTier: e.economicTier,
              estimatedCostUsd: e.estimatedCostUsd,
              costKnown: e.costKnown,
              prespendOutcome: e.prespendOutcome,
            }))
          : evaluations.map((d) => ({
              clusterId: d.clusterId,
              contentFingerprint: d.contentFingerprint ?? null,
              prespendGateVersion: d.prespendGateVersion ?? null,
              action: d.action,
              blockReason: d.blockReason,
              economicTier: d.economicTier,
              estimatedCostUsd: d.estimatedCostUsd,
              costKnown: d.costKnown,
              prespendOutcome: d.prespendOutcome,
            }))
      const unique = aggregateUniqueEconomicMetrics(uniqueRows, {
        legacyClusterOnly: economic.length === 0,
      })
      shadowEconomics = {
        available: true,
        evaluated: evaluations.length,
        uniqueEventRevisions: unique.uniqueEventRevisions,
        wouldDispatch,
        wouldBlock,
        uniqueWouldDispatch: unique.uniqueWouldDispatch,
        uniqueWouldBlock: unique.uniqueWouldBlock,
        estimatedSpendUsd: unique.estimatedSpendAfterGateUsd,
        estimatedPreventedUsd: unique.estimatedSpendPreventedUsd,
        byPrespend,
        byTier: unique.byTier,
        helpTr: 'Gölge değerlendirmeleri gerçek AI çağrısı değildir.',
      }
    } catch {
      shadowEconomics = { available: false, displayTr: 'Veri alınamadı' }
    }

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
    payload.today.remaining = Math.max(
      0,
      limits.maxDailyCostUsd - dayW.reservedUsd - dayW.spentUsd
    )
    payload.today.requests = dayW.requestCount
    payload.hour.reserved = hourW.reservedUsd
    payload.hour.spent = hourW.spentUsd
    payload.hour.remaining = Math.max(
      0,
      limits.maxHourlyCostUsd - hourW.reservedUsd - hourW.spentUsd
    )
    payload.hour.requests = hourW.requestCount
    payload.month.reserved = monthW.reservedUsd
    payload.month.spent = monthW.spentUsd
    payload.month.remaining = Math.max(
      0,
      limits.maxMonthlyCostUsd - monthW.reservedUsd - monthW.spentUsd
    )
    payload.month.requests = monthW.requestCount
    payload.ready = shadow.filter((s) => s.wouldDispatch).map(mapShadow)
    payload.blocked = shadow
      .filter((s) => !s.wouldDispatch && s.blockedReason && s.blockedReason !== 'WATCHING')
      .map(mapShadow)
    payload.costBlocked = shadow.filter((s) =>
      [
        'COST_UNKNOWN',
        'EVENT_COST_LIMIT_EXCEEDED',
        'HOURLY_BUDGET_EXCEEDED',
        'DAILY_BUDGET_EXCEEDED',
        'MONTHLY_BUDGET_EXCEEDED',
      ].includes(String(s.blockedReason || ''))
    ).length
    payload.jobs = jobs.map((j) => ({
      clusterId: j.clusterId,
      eventKey: j.eventKey,
      status: j.status,
      provider: j.provider,
      model: j.model,
      estimatedCostUsd: j.estimatedCostUsd,
      actualCostUsd: j.actualCostUsd,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      failure: j.failureReason || j.blockedReason,
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
      eligible: funnel.eligible + funnel.highPriority,
      ready: payload.ready.length,
      blocked: payload.blocked.length,
      watching: funnel.watching,
      processed: payload.completed.length,
    }
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const todayLedger = ledger.filter((r) => r.timestamp >= dayStart)
    payload.actualAiRequests = todayLedger.length
    payload.actualAiCostUsd = todayLedger.reduce((s, r) => s + (r.actualCostUsd || 0), 0)
    payload.runningJobs = jobs.filter(
      (j) => j.status === 'PROCESSING' || j.status === 'RESERVED'
    ).length
    payload.approvedBacklog = funnel.approvedForAi
    payload.aiWaiting = funnel.approvedForAi
    payload.costAggregates = buildCostCmsPayload(ledger, now)
    payload.shadowEconomics = shadowEconomics
    if (circuit.state === 'OPEN' && circuit.reason === 'insufficient_balance') {
      payload.alert =
        'DeepSeek bakiyesi yetersiz (HTTP 402). Otomatik AI durdu; crawler devam ediyor.'
    } else if (circuit.state === 'OPEN') {
      payload.alert = `Sağlayıcı devre açık: ${circuit.reason || 'unknown'}`
    }
    return NextResponse.json({ ...payload, postgres: true })
  } catch (err) {
    return NextResponse.json({
      ...payload,
      postgres: true,
      dataUnavailable: true,
      actualAiRequests: null,
      actualAiCostUsd: null,
      runningJobs: null,
      approvedBacklog: null,
      aiWaiting: null,
      costAggregates: costCmsUnavailablePayload(
        err instanceof Error ? err.message : 'dispatch_admin_unavailable'
      ),
      alert: 'Veri kaynağına ulaşılamıyor',
      error: err instanceof Error ? err.message : 'dispatch_admin_unavailable',
    })
  }
}
