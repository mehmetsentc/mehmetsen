/**
 * Phase 4D/4E/4F.1 deterministic AI eligibility gate (unpaid).
 * Unit of work = EVENT. Does not call any LLM.
 *
 * Design A (Phase 4F.1):
 * - Machine eligibility is SEPARATE from human editorialDecision.
 * - Machine NEVER writes APPROVED_FOR_AI (human-only).
 * - Automatic path: AI_READY / AUTO_DRAFT_ELIGIBLE + mode + cutoff + budget → job.
 * - Manual path: human APPROVED_FOR_AI / AI Taslağı still valid entry.
 *
 * WATCHING rule:
 * - Weak single-source WATCHING → WAITING_FOR_MORE_SOURCES (no spend).
 * - Multi-source (ind≥2) that passes quality → AUTO_DRAFT_ELIGIBLE.
 * - Strong-single thresholds → AUTO_DRAFT_ELIGIBLE.
 * Do not turn every WATCHING row into spend.
 */

export const AUTO_DRAFT_GATE_STATUSES = [
  'AI_READY',
  'AUTO_DRAFT_ELIGIBLE',
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

/** Formal STRONG_SINGLE_SOURCE thresholds (Phase 4D.3 / 4E / 4F.1). Do not lower. */
export const STRONG_SINGLE_SOURCE_THRESHOLDS = {
  localOrBreaking: {
    bestWordCountMin: 120,
    bestConfidenceMin: 0.7,
    avgHealthMin: 60,
    staleHoursMax: 48,
    /** Need local geo OR BREAKING crawl OR importance ≥ this */
    importanceMinWhenNoLocalOrBreaking: 70,
  },
  highQualityTrusted: {
    bestWordCountMin: 150,
    bestConfidenceMin: 0.75,
    avgHealthMin: 70,
    staleHoursMax: 36,
    importanceMin: 40,
  },
} as const

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
  /** True only when status is AI_READY / AUTO_DRAFT_ELIGIBLE — still needs mode+budget+idempotency+dispatch. */
  readyForJob: boolean
  strongSinglePath?: 'local_or_breaking' | 'high_quality_trusted' | null
}

/** Persisted machine eligibility (Design A). Never equals human APPROVED_FOR_AI. */
export type MachineDraftEligibilityStatus =
  | 'AUTO_DRAFT_ELIGIBLE'
  | 'WAITING_FOR_MORE_SOURCES'
  | 'LOW_QUALITY'
  | 'TOO_THIN'
  | 'DUPLICATE'
  | 'STALE'
  | 'EDITOR_REJECTED'
  | 'ALREADY_DRAFTED'
  | 'ALREADY_PUBLISHED'
  | 'COST_BLOCKED'
  | 'MANUAL_ONLY'
  | 'UPDATE_AVAILABLE'
  | 'PROVIDER_BLOCKED'
  | 'BLOCKED'

export type MachineEligibilityAuditMeta = {
  independentSourceCount: number
  uniqueSourceCount: number
  bestWordCount: number
  bestConfidence: number
  avgHealth: number
  importanceScore: number
  staleHours: number
  gateStatus: string
  gateReason: string
  strongSinglePath: string | null
  cutoffIso: string | null
  contentFingerprint: string | null
  /** Human editorial decision at classification time — never mutated by machine. */
  editorialDecision: string | null
  clusterAiEligibility: string
}

export type EligibilityScoreBreakdown = {
  freshness: number
  sourceHealth: number
  confidence: number
  usableWords: number
  importance: number
  multiSource: number
  total: number
}

/** Soft score for observability/ranking — gate status remains authoritative. */
export function scoreAutoDraftEligibility(input: AutoDraftGateInput): EligibilityScoreBreakdown {
  const freshness = Math.max(0, Math.min(100, 100 - input.staleHours * 6))
  const sourceHealth = Math.max(0, Math.min(100, input.avgHealth))
  const confidence = Math.max(0, Math.min(100, input.bestConfidence * 100))
  const usableWords = Math.max(0, Math.min(100, input.bestWordCount / 6))
  const importance = Math.max(0, Math.min(100, input.importanceScore))
  const multiSource = Math.max(0, Math.min(100, input.independentSourceCount * 40))
  const total = Number(
    ((freshness + sourceHealth + confidence + usableWords + importance + multiSource) / 6).toFixed(2)
  )
  return { freshness, sourceHealth, confidence, usableWords, importance, multiSource, total }
}

export function evaluateStrongSingleSource(input: AutoDraftGateInput): {
  ok: boolean
  path: 'local_or_breaking' | 'high_quality_trusted' | null
} {
  const t = STRONG_SINGLE_SOURCE_THRESHOLDS
  const strongSingleLocal =
    input.bestWordCount >= t.localOrBreaking.bestWordCountMin &&
    input.bestConfidence >= t.localOrBreaking.bestConfidenceMin &&
    input.avgHealth >= t.localOrBreaking.avgHealthMin &&
    input.staleHours <= t.localOrBreaking.staleHoursMax &&
    (input.hasLocalGeography ||
      input.crawlPriority === 'BREAKING' ||
      input.importanceScore >= t.localOrBreaking.importanceMinWhenNoLocalOrBreaking)

  const strongSingleQuality =
    input.bestWordCount >= t.highQualityTrusted.bestWordCountMin &&
    input.bestConfidence >= t.highQualityTrusted.bestConfidenceMin &&
    input.avgHealth >= t.highQualityTrusted.avgHealthMin &&
    input.staleHours <= t.highQualityTrusted.staleHoursMax &&
    input.importanceScore >= t.highQualityTrusted.importanceMin

  if (strongSingleLocal) return { ok: true, path: 'local_or_breaking' }
  if (strongSingleQuality) return { ok: true, path: 'high_quality_trusted' }
  return { ok: false, path: null }
}

/**
 * Multi-source preferred but NOT hard-coded min=2 globally.
 * Strong local/breaking / high-quality trusted single source may be AI_READY.
 *
 * WATCHING: weak single stays waiting; multi-source or strong-single may promote.
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

  const strong = evaluateStrongSingleSource(input)
  const strongSingle = strong.ok
  const multiSourceReady = input.independentSourceCount >= 2

  // Weak single (incl. WATCHING without strong-single) → wait; do not spend.
  if (!multiSourceReady && !strongSingle) {
    return {
      status: 'WAITING_FOR_MORE_SOURCES',
      reason:
        input.clusterAiEligibility === 'WATCHING'
          ? 'watching_weak_single'
          : 'single_source_waiting',
      readyForJob: false,
      strongSinglePath: null,
    }
  }

  if (
    input.clusterAiEligibility !== 'ELIGIBLE' &&
    input.clusterAiEligibility !== 'HIGH_PRIORITY' &&
    input.clusterAiEligibility !== 'WATCHING' &&
    !strongSingle &&
    !multiSourceReady
  ) {
    return {
      status: 'WAITING_FOR_MORE_SOURCES',
      reason: 'not_yet_eligible',
      readyForJob: false,
      strongSinglePath: null,
    }
  }

  const reason = multiSourceReady
    ? 'multi_source_ready'
    : strong.path === 'high_quality_trusted'
      ? 'STRONG_SINGLE_SOURCE'
      : strongSingle
        ? 'strong_single_source'
        : 'eligible_quality'

  return {
    status: 'AUTO_DRAFT_ELIGIBLE',
    reason,
    readyForJob: true,
    strongSinglePath: multiSourceReady ? null : strong.path,
  }
}

/** Map gate status → persisted machine eligibility (never APPROVED_FOR_AI). */
export function toMachineDraftEligibility(
  gate: AutoDraftGateResult
): MachineDraftEligibilityStatus {
  if (gate.readyForJob || gate.status === 'AI_READY' || gate.status === 'AUTO_DRAFT_ELIGIBLE') {
    return 'AUTO_DRAFT_ELIGIBLE'
  }
  if (gate.status === 'WAITING_FOR_MORE_SOURCES') return 'WAITING_FOR_MORE_SOURCES'
  if (
    gate.status === 'LOW_QUALITY' ||
    gate.status === 'TOO_THIN' ||
    gate.status === 'DUPLICATE' ||
    gate.status === 'STALE' ||
    gate.status === 'EDITOR_REJECTED' ||
    gate.status === 'ALREADY_DRAFTED' ||
    gate.status === 'ALREADY_PUBLISHED' ||
    gate.status === 'COST_BLOCKED' ||
    gate.status === 'MANUAL_ONLY' ||
    gate.status === 'UPDATE_AVAILABLE'
  ) {
    return gate.status
  }
  return 'BLOCKED'
}

export function buildMachineEligibilityMeta(input: {
  gate: AutoDraftGateResult
  gateInput: AutoDraftGateInput
  cutoffIso: string | null
  contentFingerprint: string | null
}): MachineEligibilityAuditMeta {
  return {
    independentSourceCount: input.gateInput.independentSourceCount,
    uniqueSourceCount: input.gateInput.uniqueSourceCount,
    bestWordCount: input.gateInput.bestWordCount,
    bestConfidence: input.gateInput.bestConfidence,
    avgHealth: input.gateInput.avgHealth,
    importanceScore: input.gateInput.importanceScore,
    staleHours: Number(input.gateInput.staleHours.toFixed(2)),
    gateStatus: input.gate.status,
    gateReason: input.gate.reason,
    strongSinglePath: input.gate.strongSinglePath ?? null,
    cutoffIso: input.cutoffIso,
    contentFingerprint: input.contentFingerprint,
    editorialDecision: input.gateInput.editorialDecision,
    clusterAiEligibility: input.gateInput.clusterAiEligibility,
  }
}

/**
 * Design A — automatic job creation.
 * Does NOT require APPROVED_FOR_AI. Human REJECTED/ARCHIVED already fail the gate.
 * APPROVED_FOR_AI alone never authorizes spend without mode+budget+AI_READY.
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
  if (input.editorialDecision === 'REJECTED' || input.editorialDecision === 'ARCHIVED') {
    return { ok: false, reason: 'EDITOR_REJECTED' }
  }
  if (!input.gate.readyForJob) {
    return { ok: false, reason: input.gate.status }
  }
  if (input.gate.status !== 'AI_READY' && input.gate.status !== 'AUTO_DRAFT_ELIGIBLE') {
    return { ok: false, reason: input.gate.status }
  }
  if (!input.budgetOk) return { ok: false, reason: 'BUDGET_BLOCKED' }
  if (!input.idempotencyOk) return { ok: false, reason: 'IDEMPOTENCY_BLOCKED' }
  return { ok: true, reason: 'ok' }
}

/** Manual path still valid: human approved + gate ready (same worker). */
export function canCreateManualApprovedJob(input: {
  gate: AutoDraftGateResult
  editorialDecision: string | null
  autoDraftModeEnabled: boolean
  budgetOk: boolean
  idempotencyOk: boolean
}): { ok: boolean; reason: string } {
  if (input.editorialDecision !== 'APPROVED_FOR_AI') {
    return { ok: false, reason: 'NOT_APPROVED_FOR_AI' }
  }
  return canCreateAutoDraftJob(input)
}

/** Publication is never automatic. */
export function autoDraftMayPublish(): false {
  return false
}
