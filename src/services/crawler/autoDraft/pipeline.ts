/**
 * Phase 4D.3 — enqueue-only controlled auto-draft tick.
 * Crawler evaluates eligibility and creates PENDING/RESERVED jobs.
 * Paid DeepSeek execution happens only in the dedicated AI worker.
 */

import { newCrawlerId } from '../store/types'
import type { AiDispatchStore } from '../aiDispatch/store'
import type { CrawlerStore } from '../store/types'
import type { NewsClusterRecord } from '../types'
import { crawlerAiDispatchConfig, getCrawlerAiProviderReadiness } from '../aiDispatch/flags'
import {
  EDITORIAL_OUTPUT_TARGET,
  type CrawlerAiJobRecord,
  type MemberEvidence,
} from '../aiDispatch/types'
import { emptyWindow, periodKeys, tryReserveBudget } from '../aiDispatch/budget'
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
} from './activation'
import { compareEditorialAutoDraftRank } from './editorialRank'
import { buildCanaryEvidencePack } from '../canary/pack'
import { estimateCanaryCostUsd } from '../canary/preflight'
import { canaryConfig } from '../canary/flags'
import { blocksAutomaticRepay } from './lease'
import type { CanaryClusterInput, CanaryMemberInput } from '../canary/types'

export type ControlledAutoDraftTickResult = {
  mode: string
  evaluated: number
  jobsCreated: number
  blocked: number
  updateAvailable: number
  providerBlocked: number
  backlogExcluded: number
  /** Always 0 — crawler never calls provider (Phase 4D.3). */
  providerCalls: 0
  draftsPersisted: 0
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
    reservedAt: status === 'RESERVED' || status === 'PENDING' ? now : null,
    startedAt: null,
    completedAt: null,
    blockedReason: null,
    failureReason: null,
    failureCode: null,
    editorialNewsId: null,
    outputTarget: EDITORIAL_OUTPUT_TARGET,
    selectedSourceCount: cluster.uniqueSourceCount,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastHeartbeatAt: null,
    executionId: null,
    eventRevision: opts.fingerprint,
    draftSnapshot: null,
    validationSnapshot: null,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Recover stale PROCESSING leases that have no successful ledger evidence.
 * Never auto-repays. Ledger SUCCESS → PROVIDER_SUCCEEDED_FINALIZE_FAILED.
 */
export async function recoverStaleLeases(
  aiStore: AiDispatchStore,
  now: Date,
  reasons: Record<string, number>
): Promise<number> {
  const claimable = await aiStore.listClaimableJobs?.({ limit: 20, now })
  // Fallback: list PROCESSING and check lease expiry in memory stores without claim API
  const processing =
    claimable ??
    (await aiStore.listJobs({ status: 'PROCESSING', limit: 50 })).filter((j) => {
      const exp = j.leaseExpiresAt || j.startedAt || j.updatedAt
      return !exp || now.getTime() - exp.getTime() > 0
    })

  let recovered = 0
  for (const job of processing) {
    if (job.status !== 'PROCESSING') continue
    const exp = job.leaseExpiresAt
    if (exp && exp.getTime() > now.getTime()) continue

    const ledger = await aiStore.listLedger({ lane: 'crawler_automatic' })
    const successForJob = ledger.some(
      (r) =>
        r.jobId === job.id &&
        /success|succeeded/i.test(r.status) &&
        r.requestType === 'controlled_auto_draft'
    )

    if (blocksAutomaticRepay({ hasSuccessfulLedger: successForJob, failureCode: job.failureCode })) {
      await aiStore.updateJob(job.id, {
        status: 'FAILED',
        failureCode: 'PROVIDER_SUCCEEDED_FINALIZE_FAILED',
        failureReason: 'stale_lease_with_ledger_success_no_auto_repay',
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      bump(reasons, 'PROVIDER_SUCCEEDED_FINALIZE_FAILED')
      recovered += 1
      continue
    }

    // No ledger success — mark uncertain if executionId was minted (call may have started)
    if (job.executionId) {
      await aiStore.updateJob(job.id, {
        status: 'FAILED',
        failureCode: 'EXECUTION_RESULT_UNCERTAIN',
        failureReason: 'stale_lease_execution_started_no_finalize',
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      bump(reasons, 'EXECUTION_RESULT_UNCERTAIN')
      recovered += 1
      continue
    }

    // Never started paid call — return to PENDING for reclaim
    await aiStore.updateJob(job.id, {
      status: 'PENDING',
      failureReason: null,
      failureCode: null,
      startedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      attemptCount: job.attemptCount,
    })
    bump(reasons, 'LEASE_RECOVERED_TO_PENDING')
    recovered += 1
  }
  return recovered
}

/**
 * Evaluate APPROVED_FOR_AI clusters and enqueue jobs only.
 * Default mode OFF / provider OFF → zero jobs, zero provider calls.
 */
export async function runControlledAutoDraftTick(opts: {
  crawlerStore: CrawlerStore
  aiStore: AiDispatchStore
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

  // Lease recovery is cheap and safe when AI OFF (no provider calls)
  result.leaseRecovered = await recoverStaleLeases(opts.aiStore, now, result.reasons)

  if (!autoEnabled) {
    bump(result.reasons, 'MODE_OR_DISPATCH_OFF')
    return result
  }

  const keys = periodKeys(now)
  let hourSnap = await opts.aiStore.getBudgetWindow('crawler_automatic', 'hour', keys.hour)
  let daySnap = await opts.aiStore.getBudgetWindow('crawler_automatic', 'day', keys.day)
  let monthSnap = await opts.aiStore.getBudgetWindow('crawler_automatic', 'month', keys.month)
  if (!monthSnap?.periodKey) monthSnap = emptyWindow('crawler_automatic', 'month', keys.month)

  const recentLedger = await opts.aiStore.listLedger({
    lane: 'crawler_automatic',
    since: new Date(now.getTime() - 7 * 86_400_000),
  })
  /**
   * Phase 4E — acceptance caps apply to the current activation window only.
   * When CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER is set, do not let prior-phase
   * controlled_auto_draft ledger rows exhaust this window's maxRequests.
   */
  const acceptanceCutoff = getAutoDraftEligibleAfter()
  const acceptanceSpent = recentLedger.filter((r) => {
    if (r.requestType !== 'controlled_auto_draft') return false
    if (!/success|fail|completed/i.test(r.status)) return false
    if (acceptanceCutoff && r.timestamp.getTime() < acceptanceCutoff.getTime()) return false
    return true
  })
  if (acceptanceSpent.length >= caps.maxRequests) {
    bump(result.reasons, 'ACCEPTANCE_REQUEST_CAP')
    return result
  }

  const candidates = await listApprovedCandidates(
    opts.crawlerStore,
    opts.limit ?? cfg.maxEventsPerTick,
    now
  )
  let concurrent = await opts.aiStore.countActiveJobs()

  for (const cluster of candidates) {
    if (result.jobsCreated >= caps.maxEvents) {
      bump(result.reasons, 'ACCEPTANCE_EVENT_CAP')
      break
    }

    result.evaluated += 1
    const members = await membersFor(opts.crawlerStore, cluster.id)
    const existing = await opts.aiStore.getInitialJob(cluster.id)
    const hasActive =
      !!existing && ['PENDING', 'RESERVED', 'PROCESSING'].includes(existing.status)
    const hasCompleted =
      !!existing && (existing.status === 'COMPLETED' || Boolean(existing.editorialNewsId))

    // Never auto-requeue uncertain / ledger-success finalize failures
    if (
      existing &&
      blocksAutomaticRepay({
        failureCode: existing.failureCode,
        failureReason: existing.failureReason,
        hasSuccessfulLedger: recentLedger.some(
          (r) => r.jobId === existing.id && /success|succeeded/i.test(r.status)
        ),
      })
    ) {
      result.blocked += 1
      bump(result.reasons, existing.failureCode || 'NO_AUTO_REPAY')
      continue
    }

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

    // Enqueue as PENDING — worker claims into PROCESSING with lease.
    // Budget reserved at enqueue; worker settles after paid execution.
    const job = jobStub(cluster, gate, 'PENDING', {
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
    bump(result.reasons, 'ENQUEUED')
  }

  if (autoEnabled && !getAutoDraftEligibleAfter()) {
    bump(result.reasons, 'CUTOFF_UNSET_NOTE')
  }

  return result
}

async function listApprovedCandidates(
  store: CrawlerStore,
  limit: number,
  now = new Date()
): Promise<NewsClusterRecord[]> {
  // Fetch a wider pool then rank — spend under tight Phase 4E caps goes to best events first.
  const pool = await store.listClusters({
    editorialDecision: 'APPROVED_FOR_AI',
    limit: Math.max(limit * 5, 40),
  })
  const ranked = [...pool].sort((a, b) => {
    const staleA = a.latestArticleAt
      ? (now.getTime() - a.latestArticleAt.getTime()) / 3_600_000
      : 999
    const staleB = b.latestArticleAt
      ? (now.getTime() - b.latestArticleAt.getTime()) / 3_600_000
      : 999
    return compareEditorialAutoDraftRank(
      {
        editorialPriority: a.editorialPriority,
        independentSourceCount: a.uniqueSourceCount,
        importanceScore: a.importanceScore,
        staleHours: staleA,
        avgHealth: 70,
        bestWordCount: 300,
        bestConfidence: a.clusterConfidence ?? 0.7,
        city: a.city,
        district: a.district,
        region: a.region,
        countryCode: a.countryCode,
      },
      {
        editorialPriority: b.editorialPriority,
        independentSourceCount: b.uniqueSourceCount,
        importanceScore: b.importanceScore,
        staleHours: staleB,
        avgHealth: 70,
        bestWordCount: 300,
        bestConfidence: b.clusterConfidence ?? 0.7,
        city: b.city,
        district: b.district,
        region: b.region,
        countryCode: b.countryCode,
      }
    )
  })
  return ranked.slice(0, limit)
}

/** Explicit: publication is never performed by this pipeline. */
export function autoDraftPublicationAllowed(): false {
  return false
}
