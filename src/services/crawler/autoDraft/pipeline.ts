/**
 * Phase 4D.3 / 4E.1 — enqueue-only controlled auto-draft tick.
 * Crawler evaluates eligibility and creates PENDING jobs.
 * Paid DeepSeek execution happens only in the dedicated AI worker.
 *
 * Phase 4E.1: provider readiness is NOT required to enqueue.
 * Worker refuses claim/spend when provider OFF (avoids paid calls).
 * Candidate scan pool is wider than maxEventsPerTick so historical
 * BEFORE_CUTOFF rows cannot starve fresh eligible events.
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
import { emptyWindow, periodKeys } from '../aiDispatch/budget'
import {
  getCrawlerAiMode,
  isControlledAutoDraftEnabled,
  isShadowAutoDraftEnabled,
} from '../aiMode'
import {
  buildMachineEligibilityMeta,
  canCreateAutoDraftJob,
  evaluateAutoDraftGate,
  toMachineDraftEligibility,
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
import { compareEditorialAutoDraftRank, scoreEditorialAutoDraftRank } from './editorialRank'
import { buildCanaryEvidencePack } from '../canary/pack'
import { estimateCanaryCostUsd } from '../canary/preflight'
import { canaryConfig } from '../canary/flags'
import { computeSourceContentMetrics } from '../canary/sourcePolicy'
import { blocksAutomaticRepay } from './lease'
import type { CanaryClusterInput, CanaryMemberInput } from '../canary/types'
import {
  atomicReserveAutoDraftBudget,
  releaseAutoDraftReservation,
} from './concurrency'
import {
  estimateBoilerplateRatio,
  evaluatePrespendGate,
} from './preSpendGate'
import { classifyEconomicTier, dedupEconomicsMetrics } from './economicTiers'
import {
  buildShadowDecision,
  shadowDecisionToDispatchShadow,
} from './shadowEconomics'
import {
  PRESPEND_GATE_VERSION_CURRENT,
  classifyShadowRevisionKind,
} from './shadowUniqueEconomics'

export type ControlledAutoDraftTickResult = {
  mode: string
  /** Alias of evaluated — APPROVED candidates scanned this tick. */
  candidatesScanned: number
  evaluated: number
  /** Gate status AI_READY (may still skip for cutoff/budget/idempotency). */
  aiReady: number
  jobsCreated: number
  jobsSkipped: number
  blocked: number
  updateAvailable: number
  /**
   * Legacy counter — Phase 4E.1 no longer blocks enqueue on provider OFF.
   * Remains 0 unless a future hard provider firewall is re-enabled.
   */
  providerBlocked: number
  backlogExcluded: number
  historicalBlocked: number
  duplicateBlocked: number
  publishedBlocked: number
  existingDraftBlocked: number
  budgetBlocked: number
  /** Phase 4F.3 pre-spend rejects (event retained). */
  prespendRejected: number
  /** Phase 4F.3 shadow WOULD_DISPATCH count this tick. */
  shadowWouldDispatch: number
  /** Phase 4F.3 shadow WOULD_BLOCK count this tick. */
  shadowWouldBlock: number
  /** Always 0 — crawler never calls provider (Phase 4D.3 / 4E.1). */
  providerCalls: 0
  draftsPersisted: 0
  published: 0
  leaseRecovered: number
  /** Explicit skip / outcome codes → counts. */
  skipReasons: Record<string, number>
  /** @deprecated alias of skipReasons */
  reasons: Record<string, number>
  providerReady: boolean
  providerReason: string | null
  cutoffIso: string | null
  enqueueLimit: number
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
 * Phase 4F.1/4F.3 Design A — classify machine eligibility + optionally enqueue.
 * MODE OFF → classify only (0 jobs). Never writes APPROVED_FOR_AI.
 * SHADOW_AUTO_DRAFT → classify + pre-spend + economics; 0 jobs; 0 provider.
 * Provider OFF → enqueue still allowed when CONTROLLED mode ON; worker stays inert.
 */
export async function runControlledAutoDraftTick(opts: {
  crawlerStore: CrawlerStore
  aiStore: AiDispatchStore
  now?: Date
  /** Max jobs to create this tick (default CRAWLER_AI_MAX_EVENTS_PER_TICK). */
  limit?: number
}): Promise<ControlledAutoDraftTickResult> {
  const now = opts.now ?? new Date()
  const mode = getCrawlerAiMode()
  const autoEnabled = isControlledAutoDraftEnabled()
  const shadowEnabled = isShadowAutoDraftEnabled()
  const limits = autoDraftBudgetLimits()
  const cfg = crawlerAiDispatchConfig()
  const readiness = getCrawlerAiProviderReadiness()
  const providerReady = readiness.ready
  const caps = acceptanceHardCaps()
  const enqueueLimit = opts.limit ?? cfg.maxEventsPerTick
  const cutoff = getAutoDraftEligibleAfter()

  const skipReasons: Record<string, number> = {}
  const result: ControlledAutoDraftTickResult = {
    mode,
    candidatesScanned: 0,
    evaluated: 0,
    aiReady: 0,
    jobsCreated: 0,
    jobsSkipped: 0,
    blocked: 0,
    updateAvailable: 0,
    providerBlocked: 0,
    backlogExcluded: 0,
    historicalBlocked: 0,
    duplicateBlocked: 0,
    publishedBlocked: 0,
    existingDraftBlocked: 0,
    budgetBlocked: 0,
    prespendRejected: 0,
    shadowWouldDispatch: 0,
    shadowWouldBlock: 0,
    providerCalls: 0,
    draftsPersisted: 0,
    published: 0,
    leaseRecovered: 0,
    skipReasons,
    reasons: skipReasons,
    providerReady,
    providerReason: readiness.reason,
    cutoffIso: cutoff ? cutoff.toISOString() : null,
    enqueueLimit,
  }

  result.leaseRecovered = await recoverStaleLeases(opts.aiStore, now, skipReasons)

  if (!autoEnabled && !shadowEnabled) {
    if (mode === 'OFF') bump(skipReasons, 'MODE_OFF')
    else if (mode === 'MANUAL_CANARY') bump(skipReasons, 'MANUAL_CANARY_NO_AUTO')
    else bump(skipReasons, 'DISPATCH_OFF')
  }
  if (shadowEnabled) bump(skipReasons, 'SHADOW_AUTO_DRAFT_ACTIVE')

  if (autoEnabled && !providerReady) {
    bump(skipReasons, 'PROVIDER_DEFERRED_NOTE')
  }

  const keys = periodKeys(now)
  await opts.aiStore.getBudgetWindow('crawler_automatic', 'hour', keys.hour)
  await opts.aiStore.getBudgetWindow('crawler_automatic', 'day', keys.day)
  let monthSnap = await opts.aiStore.getBudgetWindow('crawler_automatic', 'month', keys.month)
  if (!monthSnap?.periodKey) monthSnap = emptyWindow('crawler_automatic', 'month', keys.month)

  const recentLedger = await opts.aiStore.listLedger({
    lane: 'crawler_automatic',
    since: new Date(now.getTime() - 7 * 86_400_000),
  })
  const acceptanceSpent = recentLedger.filter((r) => {
    if (r.requestType !== 'controlled_auto_draft') return false
    if (!/success|fail|completed/i.test(r.status)) return false
    if (cutoff && r.timestamp.getTime() < cutoff.getTime()) return false
    return true
  })
  const acceptanceSpendUsd = acceptanceSpent.reduce(
    (s, r) => s + (typeof r.actualCostUsd === 'number' ? r.actualCostUsd : 0),
    0
  )
  const acceptanceRequestCapped = autoEnabled && acceptanceSpent.length >= caps.maxRequests
  const acceptanceSpendCapped =
    autoEnabled && caps.maxSpendUsd > 0 && acceptanceSpendUsd >= caps.maxSpendUsd - 1e-12
  const acceptanceCapped = acceptanceRequestCapped || acceptanceSpendCapped
  if (acceptanceRequestCapped) bump(skipReasons, 'ACCEPTANCE_REQUEST_CAP')
  if (acceptanceSpendCapped) bump(skipReasons, 'ACCEPTANCE_SPEND_CAP')

  const candidates = await listAutoDraftCandidates(opts.crawlerStore, enqueueLimit, now)

  for (const cluster of candidates) {
    if (autoEnabled && !acceptanceCapped && result.jobsCreated >= enqueueLimit) {
      bump(skipReasons, 'ENQUEUE_LIMIT_REACHED')
    }

    result.evaluated += 1
    result.candidatesScanned += 1
    const humanDecisionBefore = cluster.editorialDecision

    const members = await membersFor(opts.crawlerStore, cluster.id)
    const existing = await opts.aiStore.getInitialJob(cluster.id)
    const hasActive =
      !!existing && ['PENDING', 'RESERVED', 'PROCESSING'].includes(existing.status)
    const hasCompleted =
      !!existing && (existing.status === 'COMPLETED' || Boolean(existing.editorialNewsId))

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
      result.jobsSkipped += 1
      bump(skipReasons, existing.failureCode || 'NO_AUTO_REPAY')
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
      bump(skipReasons, 'UPDATE_AVAILABLE')
      await opts.crawlerStore.updateCluster(cluster.id, {
        hasMaterialUpdate: true,
        updateReviewStatus: 'UPDATE_AVAILABLE',
        materialUpdateReason: revision.reason,
        contentFingerprint: fp,
        autoDraftStatus: 'UPDATE_AVAILABLE',
        machineDraftEligibility: 'UPDATE_AVAILABLE',
        machineDraftEligibilityReason: revision.reason,
        machineDraftEligibilityAt: now,
        machineDraftEligibilityMeta: {
          editorialDecision: humanDecisionBefore,
          gateReason: 'material_update_after_draft',
        },
      })
      result.blocked += 1
      result.jobsSkipped += 1
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
    const contentMetrics = computeSourceContentMetrics(pack)
    const tokenIn = pack.metrics.packedTokensEstimate
    const tokenOut = canaryConfig().estimatedOutputTokens
    const costProbe = estimateCanaryCostUsd(tokenIn, tokenOut)
    const costUsd = costProbe.estimatedCostUsd
    const costUnknown = !costProbe.known || costUsd == null
    const overCeiling = !costUnknown && (costUsd ?? 0) > limits.maxCostPerEventUsd + 1e-12
    const combinedBody = pack.sources.map((s) => s.body || '').join('\n')
    const boilerplateRatio = estimateBoilerplateRatio(combinedBody)
    const memberBodiesEmpty = members.every((m) => !(m.body || '').trim() && !(m.description || '').trim())
    const packBodiesEmpty =
      pack.sources.length > 0 && pack.sources.every((s) => !(s.body || '').trim())
    const malformedExtraction =
      members.length === 0 ||
      (bestWord === 0 && contentMetrics.usableSourceWords === 0) ||
      memberBodiesEmpty ||
      packBodiesEmpty

    const gateInput = {
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
    }
    const gate = evaluateAutoDraftGate(gateInput)

    if (gate.readyForJob) result.aiReady += 1
    if (gate.status === 'ALREADY_PUBLISHED') result.publishedBlocked += 1
    if (gate.status === 'ALREADY_DRAFTED') result.existingDraftBlocked += 1
    if (gate.status === 'DUPLICATE') result.duplicateBlocked += 1

    const machineStatus = toMachineDraftEligibility(gate)
    const machineMeta = buildMachineEligibilityMeta({
      gate,
      gateInput,
      cutoffIso: cutoff ? cutoff.toISOString() : null,
      contentFingerprint: fp,
    })

    await opts.crawlerStore.updateCluster(cluster.id, {
      contentFingerprint: fp,
      autoDraftStatus: gate.readyForJob ? 'AUTO_DRAFT_ELIGIBLE' : gate.status,
      machineDraftEligibility: machineStatus,
      machineDraftEligibilityReason: gate.reason,
      machineDraftEligibilityAt: now,
      machineDraftEligibilityMeta: machineMeta,
    })

    const after = await opts.crawlerStore.getCluster(cluster.id)
    if (after && after.editorialDecision !== humanDecisionBefore) {
      bump(skipReasons, 'HUMAN_DECISION_MUTATION_BLOCKED')
      await opts.crawlerStore.updateCluster(cluster.id, {
        editorialDecision: humanDecisionBefore as NewsClusterRecord['editorialDecision'],
      })
    }

    const eventAt = cluster.createdAt || cluster.firstSeenAt || cluster.editorialDecidedAt
    const activation = isEventEligibleForAutoDraft({
      clusterId: cluster.id,
      eventAt,
      decidedAt: eventAt,
    })
    const historicalBlocked = !activation.ok

    const prespend = evaluatePrespendGate({
      gate,
      bestWordCount: bestWord,
      bestConfidence: bestConf,
      avgHealth,
      staleHours,
      independentSourceCount: independent,
      usableSourceWords: contentMetrics.usableSourceWords,
      richness: contentMetrics.richness,
      boilerplateRatio,
      malformedExtraction,
      costUnknown,
      budgetBlocked: overCeiling,
      historicalBlocked,
      hasActiveAiJob: hasActive,
      hasCompletedDraft: hasCompleted,
      publishedNewsId: cluster.publishedNewsId,
      exactDuplicateOnly: gateInput.exactDuplicateOnly,
      canonicalTitle: cluster.canonicalTitle,
      normalizedTopic: cluster.normalizedTopic,
      bodySnippet: combinedBody.slice(0, 4000),
      city: cluster.city,
      importanceScore: cluster.importanceScore,
      editorialPriority: cluster.editorialPriority,
    })
    if (prespend.rejected) {
      result.prespendRejected += 1
      bump(skipReasons, `PRESPEND_${prespend.outcome}`)
      // Legacy skip codes for Phase 4E/4F.1 observability compatibility
      bump(skipReasons, prespend.outcome)
    }

    const effectiveUsableWords = Math.max(bestWord, contentMetrics.usableSourceWords)
    const effectiveRichness =
      contentMetrics.usableSourceWords >= 80
        ? contentMetrics.richness
        : effectiveUsableWords >= 300
          ? 'rich'
          : effectiveUsableWords >= 150
            ? 'medium'
            : effectiveUsableWords >= 80
              ? 'thin'
              : 'insufficient'

    const tier = classifyEconomicTier({
      richness: effectiveRichness,
      independentSourceCount: independent,
      usableSourceWords: effectiveUsableWords,
      bestConfidence: bestConf,
      avgHealth,
      importanceScore: cluster.importanceScore,
      strongSinglePath: gate.strongSinglePath ?? null,
      prespendOutcome: prespend.outcome,
    })
    const rank = scoreEditorialAutoDraftRank({
      city: cluster.city,
      district: cluster.district,
      region: cluster.region,
      importanceScore: cluster.importanceScore,
      independentSourceCount: independent,
      staleHours,
      avgHealth,
      bestWordCount: bestWord,
      bestConfidence: bestConf,
      countryCode: cluster.countryCode,
    })
    const dedup = dedupEconomicsMetrics({
      memberSourceCount: members.length,
      independentSourceCount: independent,
      packedSourceCount: pack.sources.length,
      usableSourceWords: contentMetrics.usableSourceWords,
      packedUsableWords: pack.sources.reduce(
        (s, x) => s + (x.body || '').split(/\s+/).filter(Boolean).length,
        0
      ),
    })

    const shadowDecision = buildShadowDecision({
      clusterId: cluster.id,
      eventKey: cluster.eventKey,
      canonicalTitle: cluster.canonicalTitle,
      machineEligibility: machineStatus,
      prespendOutcome: prespend.outcome,
      readyToSpend: prespend.readyToSpend,
      tier: tier.tier,
      shadowDispatchAllowed: tier.shadowDispatchAllowed,
      blockReason: prespend.rejected
        ? prespend.outcome
        : tier.shadowDispatchAllowed
          ? null
          : tier.reason,
      estimatedInputTokens: tokenIn,
      estimatedOutputTokens: tokenOut,
      estimatedCostUsd: costUsd,
      costKnown: !costUnknown,
      rankScore: rank.score,
      independentSourceCount: independent,
      usableSourceWords: effectiveUsableWords,
      editorialDecisionSnapshot: humanDecisionBefore,
      contentFingerprint: fp,
      prespendGateVersion: PRESPEND_GATE_VERSION_CURRENT,
      meta: {
        economicTierReason: tier.reason,
        dedup,
        strongSinglePath: gate.strongSinglePath ?? null,
        richness: effectiveRichness,
        prespendGateVersion: PRESPEND_GATE_VERSION_CURRENT,
      },
      now,
    })
    if (shadowDecision.action === 'WOULD_DISPATCH') result.shadowWouldDispatch += 1
    else result.shadowWouldBlock += 1

    // Persist shadow economics only in SHADOW_AUTO_DRAFT (never paid; never mutates human decision).
    if (shadowEnabled) {
      await opts.aiStore.upsertShadow(shadowDecisionToDispatchShadow(shadowDecision))
      let economicDecisionId: string | null = null
      let revisionKind = shadowDecision.revisionKind
      if (opts.aiStore.tryInsertShadowEconomicDecision) {
        const hadCluster = opts.aiStore.hasShadowEconomicDecisionForCluster
          ? await opts.aiStore.hasShadowEconomicDecisionForCluster(cluster.id)
          : false
        const econId = newCrawlerId('she')
        const tryEcon = await opts.aiStore.tryInsertShadowEconomicDecision({
          id: econId,
          clusterId: shadowDecision.clusterId,
          contentFingerprint: fp,
          prespendGateVersion: PRESPEND_GATE_VERSION_CURRENT,
          revisionKind: hadCluster ? 'MATERIAL_UPDATE' : 'NEW_EVENT',
          eventKey: shadowDecision.eventKey,
          canonicalTitle: shadowDecision.canonicalTitle,
          firstEvaluatedAt: shadowDecision.evaluatedAt,
          lastEvaluatedAt: shadowDecision.evaluatedAt,
          evaluationCount: 1,
          machineEligibility: shadowDecision.machineEligibility,
          prespendOutcome: shadowDecision.prespendOutcome,
          economicTier: shadowDecision.economicTier,
          action: shadowDecision.action,
          blockReason: shadowDecision.blockReason,
          estimatedInputTokens: shadowDecision.estimatedInputTokens,
          estimatedOutputTokens: shadowDecision.estimatedOutputTokens,
          estimatedCostUsd: shadowDecision.estimatedCostUsd,
          costKnown: shadowDecision.costKnown,
          rankScore: shadowDecision.rankScore,
          independentSourceCount: shadowDecision.independentSourceCount,
          usableSourceWords: shadowDecision.usableSourceWords,
          editorialDecisionSnapshot: shadowDecision.editorialDecisionSnapshot,
          meta: shadowDecision.meta ?? null,
        })
        economicDecisionId = tryEcon.row.id
        revisionKind = classifyShadowRevisionKind({
          clusterHadAnyPriorDecision: hadCluster,
          sameFingerprintAndGateExists: !tryEcon.inserted,
        })
        // If inserted as MATERIAL but cluster had no prior (race), keep inserted revisionKind from row
        if (tryEcon.inserted) {
          revisionKind = tryEcon.row.revisionKind as typeof revisionKind
        }
      }
      if (opts.aiStore.insertShadowDecision) {
        await opts.aiStore.insertShadowDecision({
          id: newCrawlerId('shd'),
          clusterId: shadowDecision.clusterId,
          eventKey: shadowDecision.eventKey,
          canonicalTitle: shadowDecision.canonicalTitle,
          evaluatedAt: shadowDecision.evaluatedAt,
          machineEligibility: shadowDecision.machineEligibility,
          prespendOutcome: shadowDecision.prespendOutcome,
          economicTier: shadowDecision.economicTier,
          action: shadowDecision.action,
          blockReason: shadowDecision.blockReason,
          estimatedInputTokens: shadowDecision.estimatedInputTokens,
          estimatedOutputTokens: shadowDecision.estimatedOutputTokens,
          estimatedCostUsd: shadowDecision.estimatedCostUsd,
          costKnown: shadowDecision.costKnown,
          rankScore: shadowDecision.rankScore,
          independentSourceCount: shadowDecision.independentSourceCount,
          usableSourceWords: shadowDecision.usableSourceWords,
          editorialDecisionSnapshot: shadowDecision.editorialDecisionSnapshot,
          meta: {
            ...(shadowDecision.meta ?? {}),
            revisionKind,
            contentFingerprint: fp,
          },
          contentFingerprint: fp,
          prespendGateVersion: PRESPEND_GATE_VERSION_CURRENT,
          revisionKind,
          economicDecisionId,
        })
      }
    }

    if (!autoEnabled || acceptanceCapped || shadowEnabled) {
      result.jobsSkipped += 1
      if (shadowEnabled) bump(skipReasons, 'SHADOW_NO_ENQUEUE')
      else if (!autoEnabled) bump(skipReasons, 'CLASSIFIED_NO_ENQUEUE')
      continue
    }

    if (!activation.ok) {
      const code =
        activation.reason === 'before_cutoff'
          ? 'BEFORE_ACTIVATION_CUTOFF'
          : activation.reason === 'cutoff_unset'
            ? 'CUTOFF_UNSET'
            : activation.reason.toUpperCase()
      result.backlogExcluded += 1
      result.historicalBlocked += 1
      result.blocked += 1
      result.jobsSkipped += 1
      bump(skipReasons, code)
      continue
    }

    if (result.jobsCreated >= enqueueLimit || result.jobsCreated >= caps.maxEvents) {
      result.jobsSkipped += 1
      bump(
        skipReasons,
        result.jobsCreated >= caps.maxEvents ? 'ACCEPTANCE_EVENT_CAP' : 'ENQUEUE_LIMIT_REACHED'
      )
      continue
    }

    if (!prespend.readyToSpend) {
      result.blocked += 1
      result.jobsSkipped += 1
      bump(skipReasons, 'PRESPEND_BLOCKED_ENQUEUE')
      continue
    }

    // Phase 4F.4 — paid path only Tier A/B (shadowDispatchAllowed). Tier C/D never spend.
    if (!tier.shadowDispatchAllowed) {
      result.blocked += 1
      result.jobsSkipped += 1
      bump(skipReasons, `ECONOMIC_TIER_${tier.tier}_BLOCKED`)
      continue
    }

    if (costUnknown || costUsd == null || overCeiling) {
      result.blocked += 1
      result.jobsSkipped += 1
      result.budgetBlocked += 1
      bump(skipReasons, costUnknown ? 'COST_UNKNOWN' : 'EVENT_COST_LIMIT_EXCEEDED')
      continue
    }

    const reserved = await atomicReserveAutoDraftBudget({
      aiStore: opts.aiStore,
      costUsd,
      limits,
      now,
    })
    if (!reserved.ok) {
      result.blocked += 1
      result.jobsSkipped += 1
      result.budgetBlocked += 1
      const reason = reserved.reason
      const code =
        reason === 'HOURLY_REQUEST_LIMIT'
          ? 'HOURLY_LIMIT'
          : reason === 'DAILY_REQUEST_LIMIT'
            ? 'DAILY_LIMIT'
            : reason === 'DAILY_BUDGET_EXCEEDED'
              ? 'DAILY_COST_LIMIT'
              : reason === 'MONTHLY_BUDGET_EXCEEDED'
                ? 'MONTHLY_COST_LIMIT'
                : reason === 'CONCURRENCY_LIMIT'
                  ? 'CONCURRENCY_LIMIT'
                  : reason
      bump(skipReasons, code)
      continue
    }

    const create = canCreateAutoDraftJob({
      gate,
      editorialDecision: cluster.editorialDecision,
      autoDraftModeEnabled: autoEnabled,
      budgetOk: true,
      idempotencyOk: !hasActive && !existing,
    })

    if (!create.ok) {
      await releaseAutoDraftReservation({
        aiStore: opts.aiStore,
        hour: reserved.hour,
        day: reserved.day,
        month: reserved.month,
        costUsd: reserved.costUsd,
      })
      result.blocked += 1
      result.jobsSkipped += 1
      const reason = create.reason
      if (reason === 'BUDGET_BLOCKED' || reason === 'COST_BLOCKED') result.budgetBlocked += 1
      if (reason === 'IDEMPOTENCY_BLOCKED' || reason === 'ALREADY_DRAFTED') {
        result.existingDraftBlocked += 1
      }
      bump(skipReasons, reason)
      continue
    }

    const job = jobStub(cluster, gate, 'PENDING', {
      estimatedInputTokens: tokenIn,
      estimatedOutputTokens: tokenOut,
      estimatedCostUsd: costUsd,
      fingerprint: fp,
    })
    const inserted = opts.aiStore.insertJobWithConcurrencyCap
      ? await opts.aiStore.insertJobWithConcurrencyCap(job, cfg.maxConcurrentJobs)
      : await opts.aiStore.insertJob(job)
    if (inserted === 'duplicate' || inserted === 'concurrency_limit') {
      await releaseAutoDraftReservation({
        aiStore: opts.aiStore,
        hour: reserved.hour,
        day: reserved.day,
        month: reserved.month,
        costUsd: reserved.costUsd,
      })
      result.blocked += 1
      result.jobsSkipped += 1
      if (inserted === 'concurrency_limit') {
        result.budgetBlocked += 1
        bump(skipReasons, 'CONCURRENCY_LIMIT')
      } else {
        result.duplicateBlocked += 1
        bump(skipReasons, 'IDEMPOTENCY_DUPLICATE')
      }
      continue
    }

    result.jobsCreated += 1
    bump(skipReasons, 'ENQUEUED')
  }

  if (autoEnabled && !cutoff) bump(skipReasons, 'CUTOFF_UNSET_NOTE')
  return result
}

/**
 * Design A ranked scan pool: unpublished events not human-REJECTED/ARCHIVED.
 * Includes editorialDecision=NONE (machine path) and APPROVED_FOR_AI (manual path).
 * Wider than enqueueLimit so BEFORE_CUTOFF skips cannot starve fresh events.
 */
async function listAutoDraftCandidates(
  store: CrawlerStore,
  enqueueLimit: number,
  now = new Date()
): Promise<NewsClusterRecord[]> {
  const scanLimit = Math.max(enqueueLimit * 20, 80)
  const pool = await store.listClusters({ limit: scanLimit * 2 })
  const filtered = pool.filter((c) => {
    if (c.editorialDecision === 'REJECTED' || c.editorialDecision === 'ARCHIVED') return false
    return true
  })
  const ranked = [...filtered]
    .sort((a, b) => {
      // Phase 4F.4 quality priority: multi-source (Tier A proxy) before single-source.
      const multiA = (a.uniqueSourceCount || 0) >= 2 ? 0 : 1
      const multiB = (b.uniqueSourceCount || 0) >= 2 ? 0 : 1
      if (multiA !== multiB) return multiA - multiB
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
    .slice(0, scanLimit)
  return ranked
}

/** Explicit: publication is never performed by this pipeline. */
export function autoDraftPublicationAllowed(): false {
  return false
}
