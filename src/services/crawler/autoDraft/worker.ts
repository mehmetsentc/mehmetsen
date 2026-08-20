/**
 * Phase 4D.3 — dedicated bounded AI draft worker.
 * Claims ONE job with lease → executeEventDraft → durable draft → COMPLETED.
 * Crawler tick never calls this path synchronously.
 */

import type { AiDispatchStore } from '../aiDispatch/store'
import type { CrawlerStore } from '../store/types'
import type { NewsClusterRecord } from '../types'
import { crawlerAiDispatchConfig, isCrawlerAiProviderWired, getCrawlerAiProviderReadiness } from '../aiDispatch/flags'
import type { MemberEvidence } from '../aiDispatch/types'
import { emptyWindow, periodKeys, settleReservation } from '../aiDispatch/budget'
import { applyProviderStatus } from '../aiDispatch/circuit'
import { isControlledAutoDraftEnabled, getCrawlerAiMode } from '../aiMode'
import { isCrawlerAiProviderEnabled } from '../aiDispatch/providerReadiness'
import { buildCanaryEvidencePack } from '../canary/pack'
import { createDeepSeekCanaryProvider } from '../canary/provider'
import { executeEventDraft, eventDraftPublicationAllowed } from '../eventDraft/executeEventDraft'
import type { CanaryClusterInput, CanaryMemberInput, CanaryProvider } from '../canary/types'
import {
  blocksAutomaticRepay,
  isLeaseExpired,
  leaseExpiresAt,
  newExecutionId,
  newWorkerId,
} from './lease'
import { jobLeaseTimeoutMs } from './activation'

export type AiWorkerTickResult = {
  mode: string
  claimed: number
  skipped: number
  providerCalls: number
  draftsPersisted: number
  completed: number
  failed: number
  published: 0
  reasons: Record<string, number>
  jobId: string | null
  clusterId: string | null
  draftId: string | null
  executionId: string | null
  leaseOwner: string | null
  timingsMs: {
    claim: number
    pack: number
    provider: number
    persist: number
    total: number
  }
  providerReady: boolean
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

/**
 * Shutdown / OFF semantics:
 * - AI mode OFF or provider OFF → do not claim NEW jobs.
 * - If already holding a lease mid-execution, caller should still finalize (in-process).
 */
export function workerMayClaimNewJobs(): { ok: boolean; reason: string } {
  if (!isControlledAutoDraftEnabled()) {
    return { ok: false, reason: 'MODE_OR_DISPATCH_OFF' }
  }
  if (!isCrawlerAiProviderEnabled()) {
    return { ok: false, reason: 'PROVIDER_KILL_SWITCH_OFF' }
  }
  const readiness = getCrawlerAiProviderReadiness()
  if (!readiness.ready) {
    return { ok: false, reason: readiness.reason || 'PROVIDER_NOT_READY' }
  }
  return { ok: true, reason: 'ok' }
}

/**
 * Claim + execute at most ONE job per invocation.
 */
export async function runDedicatedAiWorkerTick(opts: {
  crawlerStore: CrawlerStore
  aiStore: AiDispatchStore
  canaryProvider?: CanaryProvider
  now?: Date
  workerId?: string
}): Promise<AiWorkerTickResult> {
  const t0 = Date.now()
  const now = opts.now ?? new Date()
  const mode = getCrawlerAiMode()
  const workerId = opts.workerId ?? newWorkerId()
  const readiness = getCrawlerAiProviderReadiness()
  const cfg = crawlerAiDispatchConfig()

  const result: AiWorkerTickResult = {
    mode,
    claimed: 0,
    skipped: 0,
    providerCalls: 0,
    draftsPersisted: 0,
    completed: 0,
    failed: 0,
    published: 0,
    reasons: {},
    jobId: null,
    clusterId: null,
    draftId: null,
    executionId: null,
    leaseOwner: null,
    timingsMs: { claim: 0, pack: 0, provider: 0, persist: 0, total: 0 },
    providerReady: readiness.ready,
  }

  const claimGate = workerMayClaimNewJobs()
  if (!claimGate.ok) {
    bump(result.reasons, claimGate.reason)
    result.skipped = 1
    result.timingsMs.total = Date.now() - t0
    return result
  }

  if (!isCrawlerAiProviderWired()) {
    bump(result.reasons, 'PROVIDER_UNWIRED')
    result.skipped = 1
    result.timingsMs.total = Date.now() - t0
    return result
  }

  const tClaim = Date.now()
  const leaseMs = jobLeaseTimeoutMs()
  const expires = leaseExpiresAt(now, leaseMs)

  let job =
    (await opts.aiStore.claimNextJob?.({
      workerId,
      leaseExpiresAt: expires,
      now,
    })) ?? null

  // Memory-store fallback when claimNextJob not implemented
  if (!job && !opts.aiStore.claimNextJob) {
    const pending = await opts.aiStore.listJobs({ status: 'PENDING', limit: 5 })
    const reserved = await opts.aiStore.listJobs({ status: 'RESERVED', limit: 5 })
    const processing = await opts.aiStore.listJobs({ status: 'PROCESSING', limit: 5 })
    const candidates = [
      ...pending,
      ...reserved,
      ...processing.filter((j) => isLeaseExpired(j.leaseExpiresAt, now) && !j.executionId),
    ].sort((a, b) => (b.priority || 0) - (a.priority || 0))

    for (const candidate of candidates) {
      const ledger = await opts.aiStore.listLedger({ lane: 'crawler_automatic' })
      const successForJob = ledger.some(
        (r) => r.jobId === candidate.id && /success|succeeded/i.test(r.status)
      )
      if (
        blocksAutomaticRepay({
          failureCode: candidate.failureCode,
          failureReason: candidate.failureReason,
          hasSuccessfulLedger: successForJob,
        })
      ) {
        continue
      }
      if (candidate.status === 'PROCESSING' && candidate.executionId) {
        // Uncertain — do not reclaim for re-pay
        await opts.aiStore.updateJob(candidate.id, {
          status: 'FAILED',
          failureCode: 'EXECUTION_RESULT_UNCERTAIN',
          failureReason: 'expired_lease_with_execution_id',
          completedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
        })
        bump(result.reasons, 'EXECUTION_RESULT_UNCERTAIN')
        continue
      }
      await opts.aiStore.updateJob(candidate.id, {
        status: 'PROCESSING',
        leaseOwner: workerId,
        leaseExpiresAt: expires,
        lastHeartbeatAt: now,
        startedAt: now,
        attemptCount: (candidate.attemptCount || 0) + 1,
      })
      job = { ...candidate, status: 'PROCESSING', leaseOwner: workerId, leaseExpiresAt: expires }
      break
    }
  }

  result.timingsMs.claim = Date.now() - tClaim

  if (!job) {
    bump(result.reasons, 'NO_CLAIMABLE_JOB')
    result.skipped = 1
    result.timingsMs.total = Date.now() - t0
    return result
  }

  result.claimed = 1
  result.jobId = job.id
  result.clusterId = job.clusterId
  result.leaseOwner = workerId

  // Re-check ledger SUCCESS before any paid call (Event 1 class)
  const ledgerPre = await opts.aiStore.listLedger({ lane: 'crawler_automatic' })
  const priorSuccess = ledgerPre.some(
    (r) => r.jobId === job!.id && /success|succeeded/i.test(r.status)
  )
  if (priorSuccess) {
    await opts.aiStore.updateJob(job.id, {
      status: 'FAILED',
      failureCode: 'PROVIDER_SUCCEEDED_FINALIZE_FAILED',
      failureReason: 'ledger_success_exists_no_auto_repay',
      completedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
    })
    bump(result.reasons, 'PROVIDER_SUCCEEDED_FINALIZE_FAILED')
    result.failed = 1
    result.timingsMs.total = Date.now() - t0
    return result
  }

  const cluster = await opts.crawlerStore.getCluster(job.clusterId)
  if (!cluster) {
    await opts.aiStore.updateJob(job.id, {
      status: 'FAILED',
      failureCode: 'CLUSTER_MISSING',
      failureReason: 'cluster_not_found',
      completedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
    })
    bump(result.reasons, 'CLUSTER_MISSING')
    result.failed = 1
    result.timingsMs.total = Date.now() - t0
    return result
  }

  const tPack = Date.now()
  const members = await membersFor(opts.crawlerStore, cluster.id)
  const pack = buildCanaryEvidencePack(toCanaryCluster(cluster), toCanaryMembers(members))
  result.timingsMs.pack = Date.now() - tPack

  // Mint executionId BEFORE DeepSeek — reconciliation key
  const executionId = newExecutionId(job.id)
  result.executionId = executionId
  const fingerprint = job.eventRevision || pack.clusterId
  await opts.aiStore.updateJob(job.id, {
    executionId,
    eventRevision: fingerprint,
    lastHeartbeatAt: new Date(),
  })

  const provider = opts.canaryProvider ?? createDeepSeekCanaryProvider()
  const tProv = Date.now()
  let draftResult
  try {
    draftResult = await executeEventDraft({
      pack,
      provider,
      lane: 'controlled_auto_draft',
      eventRevision: fingerprint,
      jobId: job.id,
      estimatedCostUsd: job.estimatedCostUsd,
      allowPaidSchemaRepair: false,
      maxRequests: 1,
    })
  } catch (err) {
    // Paid call may have succeeded — mark uncertain, never auto-retry
    await opts.aiStore.updateJob(job.id, {
      status: 'FAILED',
      failureCode: 'EXECUTION_RESULT_UNCERTAIN',
      failureReason: err instanceof Error ? err.message : 'provider_throw',
      completedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
    })
    bump(result.reasons, 'EXECUTION_RESULT_UNCERTAIN')
    result.failed = 1
    result.timingsMs.provider = Date.now() - tProv
    result.timingsMs.total = Date.now() - t0
    return result
  }
  result.timingsMs.provider = Date.now() - tProv

  if (draftResult.paidCallExecuted) result.providerCalls = 1

  const tPersist = Date.now()
  const draftOk = Boolean(draftResult.ok && draftResult.draft && draftResult.draftId)

  // Atomic-ish finalization: draft snapshot + COMPLETED + ledger with same executionId
  try {
    if (draftOk && draftResult.draft) {
      const draftSnapshot = {
        draftId: draftResult.draftId,
        status: 'AI_DRAFT' as const,
        title: draftResult.draft.title,
        spot: draftResult.draft.spot,
        body: draftResult.draft.body,
        summary: draftResult.draft.summary,
        seoTitle: draftResult.draft.seoTitle,
        seoDescription: draftResult.draft.seoDescription,
        category: draftResult.draft.category,
        tags: draftResult.draft.tags,
        slug: draftResult.draft.slug,
        imageAlt: draftResult.draft.imageAlt,
        imageFilename: draftResult.draft.imageFilename,
        provider: draftResult.provider,
        model: draftResult.model,
        lane: draftResult.lane,
        eventId: cluster.id,
        jobId: job.id,
        executionId,
        eventRevision: fingerprint,
        sourceEvidence: pack.sources.map((s) => ({
          articleId: s.articleId,
          sourceId: s.sourceId,
          sourceName: s.sourceName,
          role: s.role,
        })),
        cost: {
          estimatedCostUsd: job.estimatedCostUsd,
          actualCostUsd: draftResult.actualCostUsd,
          inputTokens: draftResult.actualInputTokens,
          outputTokens: draftResult.actualOutputTokens,
        },
        createdAt: new Date().toISOString(),
      }

      await opts.aiStore.updateJob(job.id, {
        status: 'COMPLETED',
        actualInputTokens: draftResult.actualInputTokens,
        actualOutputTokens: draftResult.actualOutputTokens,
        actualCostUsd: draftResult.actualCostUsd,
        editorialNewsId: draftResult.draftId,
        draftSnapshot,
        validationSnapshot: draftResult.validation
          ? ({
              ok: draftResult.validation.ok,
              issues: draftResult.validation.issues,
            } as Record<string, unknown>)
          : null,
        completedAt: new Date(),
        failureReason: null,
        failureCode: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: new Date(),
      })

      await opts.crawlerStore.updateCluster(cluster.id, {
        draftedContentFingerprint: fingerprint,
        contentFingerprint: fingerprint,
        autoDraftStatus: 'ALREADY_DRAFTED',
        hasMaterialUpdate: false,
      })

      result.draftsPersisted = 1
      result.completed = 1
      result.draftId = draftResult.draftId
      bump(result.reasons, 'SUCCEEDED')
    } else {
      const primaryCode =
        draftResult.blockedReason ||
        (draftResult.failureReason === 'body_too_short' ||
        draftResult.failureReason === 'body_absolute_too_short'
          ? draftResult.failureReason.toUpperCase()
          : draftResult.failureReason?.toUpperCase()) ||
        'FAILED'
      const costBlocked =
        draftResult.blockedReason === 'COST_UNKNOWN' || draftResult.failureReason === 'cost_blocked'

      await opts.aiStore.updateJob(job.id, {
        status: costBlocked ? 'BLOCKED' : 'FAILED',
        actualInputTokens: draftResult.actualInputTokens,
        actualOutputTokens: draftResult.actualOutputTokens,
        actualCostUsd: draftResult.actualCostUsd,
        completedAt: new Date(),
        failureReason: draftResult.failureReason,
        failureCode: primaryCode,
        blockedReason: draftResult.blockedReason || (costBlocked ? 'COST_UNKNOWN' : null),
        validationSnapshot: draftResult.validation
          ? ({
              ok: draftResult.validation.ok,
              issues: draftResult.validation.issues,
            } as Record<string, unknown>)
          : null,
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      result.failed = 1
      bump(result.reasons, primaryCode)
    }
  } catch (finalizeErr) {
    // Provider may have succeeded — never auto re-pay
    await opts.aiStore.updateJob(job.id, {
      status: 'FAILED',
      failureCode: draftResult.paidCallExecuted
        ? 'PROVIDER_SUCCEEDED_FINALIZE_FAILED'
        : 'EXECUTION_RESULT_UNCERTAIN',
      failureReason:
        finalizeErr instanceof Error ? finalizeErr.message : 'finalize_error',
      actualInputTokens: draftResult.actualInputTokens,
      actualOutputTokens: draftResult.actualOutputTokens,
      actualCostUsd: draftResult.actualCostUsd,
      completedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
    })
    bump(
      result.reasons,
      draftResult.paidCallExecuted
        ? 'PROVIDER_SUCCEEDED_FINALIZE_FAILED'
        : 'EXECUTION_RESULT_UNCERTAIN'
    )
    result.failed = 1
    result.timingsMs.persist = Date.now() - tPersist
    result.timingsMs.total = Date.now() - t0
    return result
  }

  result.timingsMs.persist = Date.now() - tPersist

  if (draftResult.statusCode != null) {
    const circuit = await opts.aiStore.getCircuit(cfg.provider)
    const next = applyProviderStatus(circuit, draftResult.statusCode, now)
    await opts.aiStore.saveCircuit(next)
  }

  // Settle budget reserved at enqueue
  const keys = periodKeys(now)
  const hourSnap = await opts.aiStore.getBudgetWindow('crawler_automatic', 'hour', keys.hour)
  const daySnap = await opts.aiStore.getBudgetWindow('crawler_automatic', 'day', keys.day)
  let monthSnap = await opts.aiStore.getBudgetWindow('crawler_automatic', 'month', keys.month)
  if (!monthSnap?.periodKey) monthSnap = emptyWindow('crawler_automatic', 'month', keys.month)
  const reserved = job.estimatedCostUsd ?? 0
  const actual = draftResult.actualCostUsd ?? 0
  await opts.aiStore.saveBudgetWindow(settleReservation(hourSnap, reserved, actual))
  await opts.aiStore.saveBudgetWindow(settleReservation(daySnap, reserved, actual))
  await opts.aiStore.saveBudgetWindow(settleReservation(monthSnap, reserved, actual))

  await opts.aiStore.insertLedger({
    id: executionId,
    provider: cfg.provider,
    model: draftResult.model,
    lane: 'crawler_automatic',
    jobId: job.id,
    clusterId: cluster.id,
    requestType: 'controlled_auto_draft',
    inputTokens: draftResult.actualInputTokens,
    outputTokens: draftResult.actualOutputTokens,
    estimatedCostUsd: job.estimatedCostUsd,
    actualCostUsd: draftResult.actualCostUsd,
    status: draftOk ? 'SUCCESS' : 'FAILED',
    mode: 'controlled_auto_draft',
    reason: draftOk ? 'ok' : draftResult.failureReason || 'failed',
    failureCode: draftOk ? null : draftResult.blockedReason || draftResult.failureReason,
  })

  void eventDraftPublicationAllowed()
  result.timingsMs.total = Date.now() - t0
  return result
}
