/**
 * Phase 4D deterministic AI eligibility gate (unpaid).
 * Unit of work = EVENT. Does not call any LLM.
 */

export const AUTO_DRAFT_GATE_STATUSES = [
  'AI_READY',
  'WAITING_FOR_MORE_SOURCES',
  'LOW_QUALITY',
  'TOO_THIN',
  'DUPLICATE',
  'STALE',
  'EDITOR_REJECTED',
  'ALREADY_DRAFTED',
  'ALREADY_PUBLISHED',
  'COST_BLOCKED',
  'MANUAL_ONLY',
  'UPDATE_AVAILABLE',
] as const

export type AutoDraftGateStatus = (typeof AUTO_DRAFT_GATE_STATUSES)[number]

export type AutoDraftGateInput = {
  /** Cluster algorithmic eligibility (4A/4B): REJECTED|WATCHING|ELIGIBLE|HIGH_PRIORITY */
  clusterAiEligibility: string
  clusterAiEligibilityReason?: string | null
  editorialDecision: string | null
  publishedNewsId?: string | null
  hasActiveAiJob: boolean
  hasCompletedDraft: boolean
  hasMaterialUpdate: boolean
  updateReviewStatus?: string | null
  bestWordCount: number
  independentSourceCount: number
  uniqueSourceCount: number
  staleHours: number
  exactDuplicateOnly: boolean
  avgHealth: number
  bestConfidence: number
  hasLocalGeography: boolean
  importanceScore: number
  crawlPriority?: 'BREAKING' | 'HIGH' | 'NORMAL' | 'LOW'
  /** Cost preflight already failed (unknown or over ceiling). */
  costBlocked?: boolean
  /** Editor marked event as manual-only / sensitive. */
  manualOnly?: boolean
  /** Content fingerprint changed after an existing draft. */
  contentFingerprintChanged?: boolean
}

export type AutoDraftGateResult = {
  status: AutoDraftGateStatus
  reason: string
  /** True only when status is AI_READY — still needs mode+budget+idempotency+dispatch. */
  readyForJob: boolean
}

/**
 * Multi-source preferred but NOT hard-coded min=2 globally.
 * Strong local/breaking single source may be AI_READY.
 */
export function evaluateAutoDraftGate(input: AutoDraftGateInput): AutoDraftGateResult {
  if (input.publishedNewsId) {
    return { status: 'ALREADY_PUBLISHED', reason: 'published_news_id', readyForJob: false }
  }
  if (input.editorialDecision === 'REJECTED' || input.editorialDecision === 'ARCHIVED') {
    return { status: 'EDITOR_REJECTED', reason: 'editorial_decision', readyForJob: false }
  }
  if (input.manualOnly) {
    return { status: 'MANUAL_ONLY', reason: 'manual_only_flag', readyForJob: false }
  }
  if (input.exactDuplicateOnly || input.clusterAiEligibilityReason === 'exact_duplicate_only') {
    return { status: 'DUPLICATE', reason: 'exact_duplicate_only', readyForJob: false }
  }
  if (input.bestWordCount < 80 || input.clusterAiEligibilityReason === 'too_short') {
    return { status: 'TOO_THIN', reason: 'too_thin_body', readyForJob: false }
  }
  if (
    input.bestConfidence < 0.4 ||
    input.avgHealth < 30 ||
    input.clusterAiEligibility === 'REJECTED'
  ) {
    if (input.clusterAiEligibilityReason === 'stale' || input.staleHours > 72) {
      return { status: 'STALE', reason: 'stale_event', readyForJob: false }
    }
    return { status: 'LOW_QUALITY', reason: input.clusterAiEligibilityReason || 'low_quality', readyForJob: false }
  }
  if (input.staleHours > 72) {
    return { status: 'STALE', reason: 'stale_hours', readyForJob: false }
  }

  if (input.hasCompletedDraft) {
    if (input.hasMaterialUpdate || input.contentFingerprintChanged || input.updateReviewStatus === 'UPDATE_AVAILABLE') {
      return {
        status: 'UPDATE_AVAILABLE',
        reason: 'material_update_after_draft',
        readyForJob: false,
      }
    }
    return { status: 'ALREADY_DRAFTED', reason: 'existing_ai_draft', readyForJob: false }
  }

  if (input.hasActiveAiJob) {
    return { status: 'ALREADY_DRAFTED', reason: 'active_ai_job', readyForJob: false }
  }

  if (input.costBlocked) {
    return { status: 'COST_BLOCKED', reason: 'cost_preflight_blocked', readyForJob: false }
  }

  /**
   * STRONG_SINGLE_SOURCE (Phase 4D.3 formalized).
   * Does NOT require fake city/geography. Paths:
   *  A) Local / breaking / high-importance single (legacy strongSingle)
   *  B) High-quality trusted single: words≥150, conf≥0.75, health≥70, stale≤36h, importance≥40
   */
  const strongSingleLocal =
    input.bestWordCount >= 120 &&
    input.bestConfidence >= 0.7 &&
    input.avgHealth >= 60 &&
    input.staleHours <= 48 &&
    (input.hasLocalGeography ||
      input.crawlPriority === 'BREAKING' ||
      input.importanceScore >= 70)

  const strongSingleQuality =
    input.bestWordCount >= 150 &&
    input.bestConfidence >= 0.75 &&
    input.avgHealth >= 70 &&
    input.staleHours <= 36 &&
    input.importanceScore >= 40

  const strongSingle = strongSingleLocal || strongSingleQuality

  const waiting =
    input.clusterAiEligibility === 'WATCHING' ||
    (input.independentSourceCount < 2 && !strongSingle)

  if (waiting) {
    return {
      status: 'WAITING_FOR_MORE_SOURCES',
      reason: 'single_source_waiting',
      readyForJob: false,
    }
  }

  if (
    input.clusterAiEligibility !== 'ELIGIBLE' &&
    input.clusterAiEligibility !== 'HIGH_PRIORITY' &&
    !strongSingle
  ) {
    return {
      status: 'WAITING_FOR_MORE_SOURCES',
      reason: 'not_yet_eligible',
      readyForJob: false,
    }
  }

  return {
    status: 'AI_READY',
    reason:
      input.independentSourceCount >= 2
        ? 'multi_source_ready'
        : strongSingleQuality && !strongSingleLocal
          ? 'STRONG_SINGLE_SOURCE'
          : strongSingle
            ? 'strong_single_source'
            : 'eligible_quality',
    readyForJob: true,
  }
}

/**
 * APPROVED_FOR_AI alone never authorizes spend.
 * Job creation requires AI_READY + mode + budget + idempotency + dispatch.
 */
export function canCreateAutoDraftJob(input: {
  gate: AutoDraftGateResult
  editorialDecision: string | null
  autoDraftModeEnabled: boolean
  budgetOk: boolean
  idempotencyOk: boolean
}): { ok: boolean; reason: string } {
  if (!input.autoDraftModeEnabled) {
    return { ok: false, reason: 'MODE_OR_DISPATCH_OFF' }
  }
  if (input.editorialDecision !== 'APPROVED_FOR_AI') {
    return { ok: false, reason: 'NOT_APPROVED_FOR_AI' }
  }
  if (!input.gate.readyForJob || input.gate.status !== 'AI_READY') {
    return { ok: false, reason: input.gate.status }
  }
  if (!input.budgetOk) return { ok: false, reason: 'BUDGET_BLOCKED' }
  if (!input.idempotencyOk) return { ok: false, reason: 'IDEMPOTENCY_BLOCKED' }
  return { ok: true, reason: 'ok' }
}
