/**
 * Phase 4D.1 / 4F.1 — activation cutoff + acceptance cohort.
 * Historical events before T must not auto-run when mode is enabled.
 * Cutoff is required for the AUTOMATIC path; unset → refuse (CUTOFF_UNSET).
 * Manual canary / manual approve paths bypass at their own call sites.
 */

export type ActivationGateResult =
  | { ok: true; reason: 'after_cutoff' | 'explicit_cohort' }
  | { ok: false; reason: 'before_cutoff' | 'cutoff_unset' | 'not_in_cohort' }

/**
 * ISO timestamp: only events created at-or-after this may auto-dispatch.
 * Env: CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER
 */
export function getAutoDraftEligibleAfter(): Date | null {
  const raw = process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER?.trim()
  if (!raw) return null
  const d = new Date(raw)
  return Number.isFinite(d.getTime()) ? d : null
}

/**
 * Optional comma-separated cluster IDs allowed during acceptance (max 2 recommended).
 * Env: CRAWLER_AI_ACCEPTANCE_COHORT_IDS
 */
export function getAcceptanceCohortIds(): Set<string> {
  const raw = process.env.CRAWLER_AI_ACCEPTANCE_COHORT_IDS?.trim()
  if (!raw) return new Set()
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

/**
 * Absolute acceptance caps (Phase 4D.1).
 * Env overrides optional; defaults match acceptance: 2 events / 2 requests.
 */
export function acceptanceHardCaps() {
  const maxEvents = Math.max(
    0,
    Math.round(Number(process.env.CRAWLER_AI_ACCEPTANCE_MAX_EVENTS?.trim() || '2') || 2)
  )
  const maxRequests = Math.max(
    0,
    Math.round(Number(process.env.CRAWLER_AI_ACCEPTANCE_MAX_REQUESTS?.trim() || '2') || 2)
  )
  return { maxEvents, maxRequests }
}

/**
 * Decide whether AUTOMATIC paid enqueue is allowed for this event.
 * Design A uses event creation time (not human editorialDecidedAt).
 *
 * Requires either:
 * - clusterId in CRAWLER_AI_ACCEPTANCE_COHORT_IDS, or
 * - eventAt >= CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER
 *
 * If cutoff unset and not in cohort → refuse (protects historical backlog).
 */
export function isEventEligibleForAutoDraft(input: {
  clusterId: string
  /**
   * Event birth timestamp for Design A automatic path.
   * Prefer createdAt / firstSeenAt — do NOT require editorialDecidedAt.
   */
  eventAt?: Date | null
  /** Prefer eventAt; decidedAt kept for older call sites. */
  decidedAt?: Date | null
}): ActivationGateResult {
  const cohort = getAcceptanceCohortIds()
  if (cohort.has(input.clusterId)) {
    return { ok: true, reason: 'explicit_cohort' }
  }

  const cutoff = getAutoDraftEligibleAfter()
  if (!cutoff) {
    return { ok: false, reason: 'cutoff_unset' }
  }

  const at = input.eventAt ?? input.decidedAt ?? null
  if (!at || at.getTime() < cutoff.getTime()) {
    return { ok: false, reason: 'before_cutoff' }
  }
  return { ok: true, reason: 'after_cutoff' }
}

/** Job lease — stuck PROCESSING older than this → FAILED recovery. */
export function jobLeaseTimeoutMs(): number {
  const n = Number(process.env.CRAWLER_AI_JOB_LEASE_MS?.trim() || '300000')
  return Number.isFinite(n) && n >= 30_000 ? n : 300_000
}
