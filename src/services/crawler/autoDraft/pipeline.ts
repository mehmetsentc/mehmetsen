/**
 * Phase 4D controlled automatic draft pipeline (Stage 1 local).
 * Creates AI_DRAFT jobs only when mode+gates pass. Never auto-publishes.
 * Provider remains unwired by default — $0 spend in Stage 1.
 */

import { newCrawlerId } from '../store/types'
import type { AiDispatchStore } from '../aiDispatch/store'
import type { CrawlerStore } from '../store/types'
import type { NewsClusterRecord } from '../types'
import { evaluateDispatchCandidate, type EvaluationResult } from '../aiDispatch/evaluate'
import { crawlerAiDispatchConfig } from '../aiDispatch/flags'
import {
  EDITORIAL_OUTPUT_TARGET,
  type CrawlerAiJobRecord,
  type CrawlerAiProvider,
  type MemberEvidence,
} from '../aiDispatch/types'
import { emptyWindow, periodKeys, tryReserveBudget } from '../aiDispatch/budget'
import { unwiredCrawlerAiProvider } from '../aiDispatch/tick'
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

export type ControlledAutoDraftTickResult = {
  mode: string
  evaluated: number
  jobsCreated: number
  blocked: number
  updateAvailable: number
  providerCalls: number
  draftsPersisted: number
  published: 0
  reasons: Record<string, number>
}

function clusterToEval(cluster: NewsClusterRecord) {
  return {
    id: cluster.id,
    eventKey: cluster.eventKey,
    canonicalTitle: cluster.canonicalTitle,
    normalizedTopic: cluster.normalizedTopic,
    countryCode: cluster.countryCode,
    region: cluster.region,
    city: cluster.city,
    district: cluster.district,
    aiEligibility: cluster.aiEligibility,
    importanceScore: cluster.importanceScore,
    localImportance: cluster.localImportance,
    nationalImportance: cluster.nationalImportance,
    globalImportance: cluster.globalImportance,
    uniqueSourceCount: cluster.uniqueSourceCount,
    freshnessScore: cluster.freshnessScore,
    hasMaterialUpdate: cluster.hasMaterialUpdate,
    geographicScopeHint: cluster.city || cluster.district ? 'CITY' : cluster.countryCode ? 'NATIONAL' : 'GLOBAL',
    editorialDecision: cluster.editorialDecision,
  }
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

function bump(reasons: Record<string, number>, key: string) {
  reasons[key] = (reasons[key] || 0) + 1
}

function jobFromEval(
  evalResult: EvaluationResult,
  gate: AutoDraftGateResult,
  status: CrawlerAiJobRecord['status']
): CrawlerAiJobRecord {
  const now = new Date()
  const cfg = crawlerAiDispatchConfig()
  return {
    id: newCrawlerId('aij'),
    clusterId: evalResult.clusterId,
    eventKey: evalResult.eventKey,
    status,
    dispatchType: 'INITIAL',
    priority: evalResult.priority,
    eligibilityStatus: gate.status,
    estimatedInputTokens: evalResult.estimatedInputTokens,
    estimatedOutputTokens: evalResult.estimatedOutputTokens,
    estimatedTotalTokens: evalResult.estimatedTotalTokens,
    estimatedCostUsd: evalResult.estimatedPipelineCostUsd ?? evalResult.estimatedCostUsd,
    actualInputTokens: null,
    actualOutputTokens: null,
    actualCostUsd: null,
    model: evalResult.model,
    provider: evalResult.provider,
    attemptCount: 0,
    maxAttempts: cfg.maxAttempts,
    reservedAt: status === 'RESERVED' ? now : null,
    startedAt: null,
    completedAt: null,
    blockedReason: evalResult.blockedReason,
    failureReason: null,
    editorialNewsId: null,
    outputTarget: EDITORIAL_OUTPUT_TARGET,
    selectedSourceCount: evalResult.selectedSourceCount,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Evaluate APPROVED_FOR_AI clusters for controlled auto-draft.
 * Default mode OFF → evaluates shadow only, creates zero jobs, zero provider calls.
 */
export async function runControlledAutoDraftTick(opts: {
  crawlerStore: CrawlerStore
  aiStore: AiDispatchStore
  provider?: CrawlerAiProvider
  now?: Date
  limit?: number
}): Promise<ControlledAutoDraftTickResult> {
  const now = opts.now ?? new Date()
  const mode = getCrawlerAiMode()
  const autoEnabled = isControlledAutoDraftEnabled()
  const limits = autoDraftBudgetLimits()
  const cfg = crawlerAiDispatchConfig()
  const provider = opts.provider ?? unwiredCrawlerAiProvider
  const result: ControlledAutoDraftTickResult = {
    mode,
    evaluated: 0,
    jobsCreated: 0,
    blocked: 0,
    updateAvailable: 0,
    providerCalls: 0,
    draftsPersisted: 0,
    published: 0,
    reasons: {},
  }

  const keys = periodKeys(now)
  let hourSnap = await opts.aiStore.getBudgetWindow('crawler_automatic', 'hour', keys.hour)
  let daySnap = await opts.aiStore.getBudgetWindow('crawler_automatic', 'day', keys.day)
  let monthSnap = await opts.aiStore.getBudgetWindow('crawler_automatic', 'month', keys.month)
  if (!monthSnap?.periodKey) monthSnap = emptyWindow('crawler_automatic', 'month', keys.month)

  const candidates = await listApprovedCandidates(opts.crawlerStore, opts.limit ?? cfg.maxEventsPerTick)
  let concurrent = await opts.aiStore.countActiveJobs()

  for (const cluster of candidates) {
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

    const probeEval = evaluateDispatchCandidate(
      {
        cluster: clusterToEval(cluster),
        members,
        existingInitialJob: existing,
        circuitOpen: false,
        now,
        executeMaterialUpdate: false,
      },
      { hour: hourSnap, day: daySnap },
      concurrent
    )

    const costUsd = probeEval.reservationUsd
    const costUnknown =
      probeEval.technicalBlockReason === 'COST_UNKNOWN' ||
      costUsd == null ||
      probeEval.estimatedCostUsd == null
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

    await opts.crawlerStore.updateCluster(cluster.id, {
      contentFingerprint: fp,
      autoDraftStatus: gate.status,
    })

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

    const job = jobFromEval(probeEval, gate, 'PENDING')
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

    // Stage 1 / default: provider unwired — no paid call. Never publish.
    if (autoEnabled && cfg.providerWired) {
      const pack = probeEval.pack
      if (pack) {
        const chat = await provider.chat({ pack, job })
        if (chat.called) result.providerCalls += 1
        await opts.aiStore.insertLedger({
          provider: cfg.provider,
          model: cfg.model,
          lane: 'crawler_automatic',
          jobId: job.id,
          clusterId: cluster.id,
          requestType: 'controlled_auto_draft',
          inputTokens: chat.inputTokens ?? null,
          outputTokens: chat.outputTokens ?? null,
          estimatedCostUsd: job.estimatedCostUsd,
          actualCostUsd: null,
          status: chat.called ? 'SUCCESS' : 'BLOCKED',
        })
      }
    } else {
      bump(result.reasons, autoEnabled ? 'PROVIDER_UNWIRED' : 'MODE_SHADOW')
    }
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
