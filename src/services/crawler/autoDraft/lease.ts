/**
 * Phase 4D.3 — job lease helpers for dedicated AI worker.
 * PROCESSING requires a live lease owner; stale leases are recoverable without blind re-pay.
 */

import { jobLeaseTimeoutMs } from './activation'

export const UNCERTAIN_FAILURE_CODES = [
  'PROVIDER_SUCCEEDED_FINALIZE_FAILED',
  'EXECUTION_RESULT_UNCERTAIN',
] as const

export type UncertainFailureCode = (typeof UNCERTAIN_FAILURE_CODES)[number]

export function isUncertainFailureCode(code: string | null | undefined): boolean {
  return UNCERTAIN_FAILURE_CODES.includes(code as UncertainFailureCode)
}

/** Jobs with these codes must never auto re-pay. */
export function blocksAutomaticRepay(input: {
  failureCode?: string | null
  failureReason?: string | null
  hasSuccessfulLedger: boolean
}): boolean {
  if (input.hasSuccessfulLedger) return true
  if (isUncertainFailureCode(input.failureCode)) return true
  if (
    input.failureReason &&
    /provider_succeeded_finalize_failed|execution_result_uncertain|phase4d2_shutdown/i.test(
      input.failureReason
    )
  ) {
    return true
  }
  return false
}

export function newWorkerId(): string {
  return `aiw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function newExecutionId(jobId: string): string {
  return `exec_${jobId}_${Date.now().toString(36)}`
}

export function leaseExpiresAt(now: Date = new Date(), leaseMs = jobLeaseTimeoutMs()): Date {
  return new Date(now.getTime() + leaseMs)
}

export function isLeaseExpired(leaseExpiresAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!leaseExpiresAt) return true
  return leaseExpiresAt.getTime() <= now.getTime()
}
