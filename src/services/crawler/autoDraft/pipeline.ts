/**
 * Phase 4D.1 controlled automatic draft pipeline.
 * Creates AI_DRAFT jobs only when mode+gates+providerReady+cutoff pass.
 * Reuses Phase 4C.4 executeEventDraft — never auto-publishes.
 */

import { newCrawlerId } from '../store/types'
import type { AiDispatchStore } from '../aiDispatch/store'
import type { CrawlerStore } from '../store/types'
import type { NewsClusterRecord } from '../types'
import { crawlerAiDispatchConfig, isCrawlerAiProviderWired, getCrawlerAiProviderReadiness } from '../aiDispatch/flags'
import {
  EDITORIAL_OUTPUT_TARGET,
  type CrawlerAiJobRecord,
  type MemberEvidence,
} from '../aiDispatch/types'
import { emptyWindow, periodKeys, settleReservation, tryReserveBudget } from '../aiDispatch/budget'
import { applyProviderStatus } from '../aiDispatch/circuit'
import { isControlledAutoDraftEnabled, getCrawlerAiMode } from '../aiMode'
import {
  canCreateAutoDraftJob,
  evaluateAutoDraftGate,
  type AutoDraftGateResult,
} from './eligibility'
import { autoDraftBudgetLimits } from './budgetLimits'
import {
  decideEventRevision,
  fingerprintFromMembers,
  type RevisionMember,
} from './revision'
import {
  acceptanceHardCaps,
  getAutoDraftEligibleAfter,
  isEventEligibleForAutoDraft,
  jobLeaseTimeoutMs,
} from './activation'
import { buildCanaryEvidencePack } from '../canary/pack'
import { estimateCanaryCostUsd } from '../canary/preflight'
import { canaryConfig } from '../canary/flags'
import { createDeepSeekCanaryProvider } from '../canary/provider'
import { executeEventDraft, eventDraftPublicationAllowed } from '../eventDraft/executeEventDraft'
import type { CanaryClusterInput, CanaryMemberInput, CanaryProvider } from '../canary/types'

export type ControlledAutoDraftTickResult = {
  mode: string
  evaluated: number
  jobsCreated: number
  blocked: number
  updateAvailable: number
  providerBlocked: number
  backlogExcluded: number
  providerCalls: number
  draftsPersisted: number
  published: 0
  leaseRecovered: number
  reasons: Record<string, number>
  providerReady: boolean
  providerReason: string | null
}

function bump(reasons: Record<string, number>, key: string) {
  reasons[key] = (reasons[key] || 0) + 1
}

async function membersFor(crawlerStore: CrawlerStore, clusterId: string): Promise<MemberEvidence[]> {
  const memberships = await crawlerStore.listMemberships(clusterId)
  const out: MemberEvidence[] = []
  for (const m of memberships) {
    const article = await crawlerStore.getRawArticle(m.articleId)
    const source = await crawlerStore.getSource(m.sourceId)
    if (!article) continue
    out.push({
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
    })
  }
  return out
}

function toRevisionMembers(members: MemberEvidence[]): RevisionMember[] {
  return members.map((m) => ({
    articleId: m.articleId,
    sourceId: m.sourceId,
    contentHash: m.contentHash,
    wordCount: m.wordCount,
    title: m.title,
    publishedAt: m.publishedAt,
  }))
}

function toCanaryCluster(cluster: NewsClusterRecord): CanaryClusterInput {
  return {
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
  }
}

function toCanaryMembers(members: MemberEvidence[]): CanaryMemberInput[] {
  return members.map((m) => ({
    articleId: m.articleId,
    sourceId: m.sourceId,
    sourceName: m.sourceName,
    qualityTier: m.qualityTier,
    healthScore: m.healthScore,
    extractionConfidence: m.extractionConfidence,
    publishedAt: m.publishedAt,
    fetchedAt: m.fetchedAt,
    title: m.title,
    body: m.body,
    description: m.description,
    contentHash: m.contentHash,
    wordCount: m.wordCount,
    isExactDuplicate: m.isExactDuplicate,
    editorialStatus: m.editorialStatus,
    editorialNewsId: m.editorialNewsId,
    sourceStatus: m.sourceStatus,
  }))
}

function jobStub(
  cluster: NewsClusterRecord,
  gate: AutoDraftGateResult,
  status: CrawlerAiJobRecord['status'],
  opts: {
    estimatedInputTokens: number | null
    estimatedOutputTokens: number | null
    estimatedCostUsd: number | null
    fingerprint: string
  }
): CrawlerAiJobRecord {
  const now = new Date()
  const cfg = crawlerAiDispatchConfig()
  return {
    id: newCrawlerId('aij'),
    clusterId: cluster.id,
    eventKey: cluster.eventKey,
    status,
    dispatchType: 'INITIAL',
    priority: cluster.importanceScore || 0,
    eligibilityStatus: gate.status,
    estimatedInputTokens: opts.estimatedInputTokens,
    estimatedOutputTokens: opts.estimatedOutputTokens,
    estimatedTotalTokens:
      opts.estimatedInputTokens != null && opts.estimatedOutputTokens != null
        ? opts.estimatedInputTokens + opts.estimatedOutputTokens
        : null,
    estimatedCostUsd: opts.estimatedCostUsd,
    actualInputTokens: null,
    actualOutputTokens: null,
    actualCostUsd: null,
    model: cfg.model,
    provider: cfg.provider,
    attemptCount: 0,
    maxAttempts: cfg.maxAttempts,
    reservedAt: status === 'RESERVED' || status === 'PROCESSING' ? now : null,
    startedAt: status === 'PROCESSING' ? now : null,
    completedAt: null,
    blockedReason: null,
    failureReason: null,
    editorialNewsId: null,
    outputTarget: EDITORIAL_OUTPUT_TARGET,
    selectedSourceCount: cluster.uniqueSourceCount,
    createdAt: now,
    updatedAt: now,
  }
}

async function recoverStaleJobs(
  aiStore: AiDispatchStore,
  now: Date,
  reasons: Record<string, number>
): Promise<number> {
  const leaseMs = jobLeaseTimeoutMs()
  const active = await aiStore.listJobs({ limit: 50 })
  let recovered = 0
  for (const job of active) {
    if (!['PENDING', 'RESERVED', 'PROCESSING'].includes(job.status)) continue
    const anchor = job.startedAt || job.reservedAt || job.updatedAt || job.createdAt
    if (now.getTime() - anchor.getTime() < leaseMs) continue
    await aiStore.updateJob(job.id, {
      status: 'FAILED',
      failureReason: 'lease_timeout',
      completedAt: now,
      blockedReason: 'PROVIDER_CIRCUIT_OPEN',
    })
    bump(reasons, 'LEASE_RECOVERED')
    recovered += 1
  }
  return recovered
}

/**
 * Evaluate APPROVED_FOR_AI clusters for controlled auto-draft.
 * Default mode OFF / provider OFF → zero jobs, zero provider calls.
 */
export async function runControlledAutoDraftTick(opts: {
  crawlerStore: CrawlerStore
  aiStore: AiDispatchStore
  /** Injected mock for tests — production uses DeepSeek canary provider when wired. */
  canaryProvider?: CanaryProvider
  now?: Date
  limit?: number
}): Promise<ControlledAutoDraftTickResult> {
  const now = opts.now ?? new Date()
  const mode = getCrawlerAiMode()
  const autoEnabled = isControlledAutoDraftEnabled()
  const limits = autoDraftBudgetLimits()
  const cfg = crawlerAiDispatchConfig()
  const readiness = getCrawlerAiProviderReadiness()
  const providerReady = readiness.ready
  const caps = acceptanceHardCaps()

  const result: ControlledAutoDraftTickResult = {
    mode,
    evaluated: 0,
    jobsCreated: 0,
    blocked: 0,
    updateAvailable: 0,
    providerBlocked: 0,
    backlogExcluded: 0,
    providerCalls: 0,
    draftsPersisted: 0,
    published: 0,
    leaseRecovered: 0,
    reasons: {},
    providerReady,
    providerReason: readiness.reason,
  }

  result.leaseRecovered = await recoverStaleJobs(opts.aiStore, now, result.reasons)

  const keys = periodKeys(now)
  let hourSnap = await opts.aiStore.getBudgetWindow('crawler_automatic', 'hour', keys.hour)
  let daySnap = await opts.aiStore.getBudgetWindow('crawler_automatic', 'day', keys.day)
  let monthSnap = await opts.aiStore.getBudgetWindow('crawler_automatic', 'month', keys.month)
  if (!monthSnap?.periodKey) monthSnap = emptyWindow('crawler_automatic', 'month', keys.month)

  // Acceptance absolute caps from ledger (lane automatic + requestType controlled)
  const recentLedger = await opts.aiStore.listLedger({
    lane: 'crawler_automatic',
    since: new Date(now.getTime() - 7 * 86_400_000),
  })
  const acceptanceSpent = recentLedger.filter(
    (r) => r.requestType === 'controlled_auto_draft' && /success|fail|completed/i.test(r.status)
  )
  if (acceptanceSpent.length >= caps.maxRequests) {
    bump(result.reasons, 'ACCEPTANCE_REQUEST_CAP')
    return result
  }

  const candidates = await listApprovedCandidates(opts.crawlerStore, opts.limit ?? cfg.maxEventsPerTick)
  let concurrent = await opts.aiStore.countActiveJobs()

  for (const cluster of candidates) {
    if (result.jobsCreated >= caps.maxEvents) {
      bump(result.reasons, 'ACCEPTANCE_EVENT_CAP')
      break
    }
    if (result.providerCalls >= caps.maxRequests) {
      bump(result.reasons, 'ACCEPTANCE_REQUEST_CAP')
      break
    }

    result.evaluated += 1
    const members = await membersFor(opts.crawlerStore, cluster.id)
    const existing = await opts.aiStore.getInitialJob(cluster.id)
    const hasActive =
      !!existing && ['PENDING', 'RESERVED', 'PROCESSING'].includes(existing.status)
    const hasCompleted =
      !!existing && (existing.status === 'COMPLETED' || Boolean(existing.editorialNewsId))

    const fp = fingerprintFromMembers(cluster.id, cluster.eventKey, toRevisionMembers(members))
    const draftedFp = cluster.draftedContentFingerprint ?? null
    const revision = decideEventRevision({
      currentFingerprint: fp,
      draftedFingerprint: draftedFp,
      hasCompletedDraft: hasCompleted,
      hasActiveJob: hasActive,
    })
    if (revision.action === 'mark_update_available') {
      result.updateAvailable += 1
      bump(result.reasons, 'UPDATE_AVAILABLE')
      await opts.crawlerStore.updateCluster(cluster.id, {
        hasMaterialUpdate: true,
        updateReviewStatus: 'UPDATE_AVAILABLE',
        materialUpdateReason: revision.reason,
        contentFingerprint: fp,
        autoDraftStatus: 'UPDATE_AVAILABLE',
      })
      result.blocked += 1
      continue
    }

    const bestWord = Math.max(0, ...members.map((m) => m.wordCount || 0), 0)
    const bestConf = Math.max(0, ...members.map((m) => m.extractionConfidence || 0), 0)
    const avgHealth =
      members.length === 0
        ? 0
        : members.reduce((s, m) => s + (m.healthScore || 0), 0) / members.length
    const independent = new Set(members.filter((m) => !m.isExactDuplicate).map((m) => m.sourceId)).size
    const staleHours = cluster.latestArticleAt
      ? (now.getTime() - cluster.latestArticleAt.getTime()) / 3_600_000
      : 999

    const pack = buildCanaryEvidencePack(toCanaryCluster(cluster), toCanaryMembers(members))
    const tokenIn = pack.metrics.packedTokensEstimate
    const tokenOut = canaryConfig().estimatedOutputTokens
    const costProbe = estimateCanaryCostUsd(tokenIn, tokenOut)
    const costUsd = costProbe.estimatedCostUsd
    const costUnknown = !costProbe.known || costUsd == null
    const overCeiling = !costUnknown && (costUsd ?? 0) > limits.maxCostPerEventUsd + 1e-12

    const gate = evaluateAutoDraftGate({
      clusterAiEligibility: cluster.aiEligibility,
      clusterAiEligibilityReason: cluster.aiEligibilityReason,
      editorialDecision: cluster.editorialDecision,
      publishedNewsId: cluster.publishedNewsId,
      hasActiveAiJob: hasActive,
      hasCompletedDraft: hasCompleted,
      hasMaterialUpdate: cluster.hasMaterialUpdate,
      updateReviewStatus: cluster.updateReviewStatus,
      bestWordCount: bestWord,
      independentSourceCount: independent,
      uniqueSourceCount: cluster.uniqueSourceCount,
      staleHours,
      exactDuplicateOnly: members.length > 0 && members.every((m) => m.isExactDuplicate),
      avgHealth,
      bestConfidence: bestConf,
      hasLocalGeography: Boolean(cluster.city || cluster.district),
      importanceScore: cluster.importanceScore,
      costBlocked: costUnknown || overCeiling,
      contentFingerprintChanged: Boolean(draftedFp && draftedFp !== fp),
    })

    // Provider not ready: eligibility visible, NO executable PENDING jobs
    if (autoEnabled && !providerReady) {
      await opts.crawlerStore.updateCluster(cluster.id, {
        contentFingerprint: fp,
        autoDraftStatus: gate.readyForJob ? 'PROVIDER_BLOCKED' : gate.status,
      })
      result.providerBlocked += 1
      result.blocked += 1
      bump(result.reasons, readiness.reason || 'PROVIDER_BLOCKED')
      continue
    }

    await opts.crawlerStore.updateCluster(cluster.id, {
      contentFingerprint: fp,
      autoDraftStatus: gate.status,
    })

    // Backlog / activation cutoff
    const activation = isEventEligibleForAutoDraft({
      clusterId: cluster.id,
      decidedAt: cluster.editorialDecidedAt || cluster.updatedAt || cluster.createdAt,
    })
    if (autoEnabled && !activation.ok) {
      result.backlogExcluded += 1
      result.blocked += 1
      bump(result.reasons, activation.reason.toUpperCase())
      await opts.crawlerStore.updateCluster(cluster.id, {
        autoDraftStatus: gate.readyForJob ? 'AI_READY' : gate.status,
      })
      continue
    }

    const reserve =
      !costUnknown && costUsd != null
        ? tryReserveBudget({
            hour: hourSnap,
            day: daySnap,
            month: monthSnap,
            costUsd,
            concurrentJobs: concurrent,
            maxRequestsPerHour: limits.maxDraftsPerHour,
            maxRequestsPerDay: limits.maxDraftsPerDay,
            hourlyBudgetUsd: limits.maxHourlyCostUsd,
            dailyBudgetUsd: limits.maxDailyCostUsd,
            monthlyBudgetUsd: limits.maxMonthlyCostUsd,
          })
        : {
            ok: false as const,
            reason: (costUnknown ? 'COST_UNKNOWN' : 'EVENT_COST_LIMIT_EXCEEDED') as
              | 'COST_UNKNOWN'
              | 'EVENT_COST_LIMIT_EXCEEDED',
          }

    const budgetOk = reserve.ok === true && !costUnknown && !overCeiling

    const create = canCreateAutoDraftJob({
      gate,
      editorialDecision: cluster.editorialDecision,
      autoDraftModeEnabled: autoEnabled,
      budgetOk,
      idempotencyOk: !hasActive && !existing,
    })

    if (!create.ok) {
      result.blocked += 1
      bump(result.reasons, create.reason)
      continue
    }

    if (!reserve.ok) {
      result.blocked += 1
      bump(result.reasons, String(reserve.reason))
      continue
    }

    // Exactly-once: insert RESERVED first (DB unique active) before any paid call
    const job = jobStub(cluster, gate, 'RESERVED', {
      estimatedInputTokens: tokenIn,
      estimatedOutputTokens: tokenOut,
      estimatedCostUsd: costUsd,
      fingerprint: fp,
    })
    const inserted = await opts.aiStore.insertJob(job)
    if (inserted === 'duplicate') {
      result.blocked += 1
      bump(result.reasons, 'IDEMPOTENCY_DUPLICATE')
      continue
    }

    result.jobsCreated += 1
    concurrent += 1
    hourSnap = reserve.hour
    daySnap = reserve.day
    if (reserve.month) monthSnap = reserve.month
    await opts.aiStore.saveBudgetWindow(hourSnap)
    await opts.aiStore.saveBudgetWindow(daySnap)
    if (reserve.month) await opts.aiStore.saveBudgetWindow(reserve.month)

    // Only execute when auto + provider wired (double-check)
    if (!(autoEnabled && isCrawlerAiProviderWired())) {
      await opts.aiStore.updateJob(job.id, {
        status: 'CANCELLED',
        failureReason: 'provider_unwired_after_reserve',
        completedAt: now,
      })
      bump(result.reasons, 'PROVIDER_UNWIRED')
      continue
    }

    await opts.aiStore.updateJob(job.id, {
      status: 'PROCESSING',
      startedAt: now,
      attemptCount: 1,
    })

    const provider = opts.canaryProvider ?? createDeepSeekCanaryProvider()
    const draftResult = await executeEventDraft({
      pack,
      provider,
      lane: 'controlled_auto_draft',
      eventRevision: fp,
      jobId: job.id,
      estimatedCostUsd: costUsd,
      allowPaidSchemaRepair: false,
      maxRequests: 1,
    })

    if (draftResult.paidCallExecuted) result.providerCalls += 1

    // Circuit breaker on auth/balance/rate/5xx
    if (draftResult.statusCode != null) {
      const circuit = await opts.aiStore.getCircuit(cfg.provider)
      const next = applyProviderStatus(circuit, draftResult.statusCode, now)
      await opts.aiStore.saveCircuit(next)
    }

    const settledHour = settleReservation(hourSnap, costUsd ?? 0, draftResult.actualCostUsd ?? 0)
    const settledDay = settleReservation(daySnap, costUsd ?? 0, draftResult.actualCostUsd ?? 0)
    const settledMonth = monthSnap
      ? settleReservation(monthSnap, costUsd ?? 0, draftResult.actualCostUsd ?? 0)
      : null
    hourSnap = settledHour
    daySnap = settledDay
    if (settledMonth) monthSnap = settledMonth
    await opts.aiStore.saveBudgetWindow(hourSnap)
    await opts.aiStore.saveBudgetWindow(daySnap)
    if (settledMonth) await opts.aiStore.saveBudgetWindow(settledMonth)

    await opts.aiStore.insertLedger({
      provider: cfg.provider,
      model: draftResult.model,
      lane: 'crawler_automatic',
      jobId: job.id,
      clusterId: cluster.id,
      requestType: 'controlled_auto_draft',
      inputTokens: draftResult.actualInputTokens,
      outputTokens: draftResult.actualOutputTokens,
      estimatedCostUsd: costUsd,
      actualCostUsd: draftResult.actualCostUsd,
      status: draftResult.ok ? 'SUCCESS' : 'FAILED',
    })

    if (draftResult.ok && draftResult.draft && draftResult.draftId) {
      // AI_DRAFT linkage on job + cluster fingerprint — never publish
      await opts.aiStore.updateJob(job.id, {
        status: 'COMPLETED',
        actualInputTokens: draftResult.actualInputTokens,
        actualOutputTokens: draftResult.actualOutputTokens,
        actualCostUsd: draftResult.actualCostUsd,
        editorialNewsId: draftResult.draftId,
        completedAt: new Date(),
        failureReason: null,
      })
      await opts.crawlerStore.updateCluster(cluster.id, {
        draftedContentFingerprint: fp,
        contentFingerprint: fp,
        autoDraftStatus: 'ALREADY_DRAFTED',
        hasMaterialUpdate: false,
      })
      result.draftsPersisted += 1
      bump(result.reasons, 'SUCCEEDED')
    } else {
      const costBlocked =
        draftResult.blockedReason === 'COST_UNKNOWN' ||
        draftResult.failureReason === 'cost_blocked'
      await opts.aiStore.updateJob(job.id, {
        status: costBlocked ? 'BLOCKED' : 'FAILED',
        actualInputTokens: draftResult.actualInputTokens,
        actualOutputTokens: draftResult.actualOutputTokens,
        actualCostUsd: draftResult.actualCostUsd,
        completedAt: new Date(),
        failureReason: draftResult.failureReason,
        blockedReason: draftResult.blockedReason || (costBlocked ? 'COST_UNKNOWN' : null),
      })
      bump(result.reasons, draftResult.failureReason || 'FAILED')
    }

    // Explicit: never publish from this path
    void eventDraftPublicationAllowed()
  }

  // Cutoff presence note for ops
  if (autoEnabled && !getAutoDraftEligibleAfter()) {
    bump(result.reasons, 'CUTOFF_UNSET_NOTE')
  }

  return result
}

async function listApprovedCandidates(
  store: CrawlerStore,
  limit: number
): Promise<NewsClusterRecord[]> {
  return store.listClusters({
    editorialDecision: 'APPROVED_FOR_AI',
    limit,
  })
}

/** Explicit: publication is never performed by this pipeline. */
export function autoDraftPublicationAllowed(): false {
  return false
}
