/**
 * Phase P17.8B — Central Human Editorial Review Gate
 *
 * Enforces a durable, auditable human review requirement prior to canonical publication.
 * Distinguishes genuine human editorial actions from bot, crawler, and automation executions.
 */

export type EditorialApprovalStatus =
  | 'HUMAN_APPROVED'
  | 'BOT_APPROVED'
  | 'UNREVIEWED'
  | 'REJECTED'

export interface EditorialApprovalEvaluation {
  status: EditorialApprovalStatus
  reason: string
  reviewerId: string | null
  reviewedAt: Date | null
}

export interface HumanEditorialReviewInput {
  reviewerId?: string | null
  reviewerDisplayName?: string | null
  reviewedAt?: Date | number | string | null
  decision?: 'APPROVED' | 'REJECTED' | 'IN_REVIEW' | 'NONE' | string | null
  isAiGenerated?: boolean | null
  rejectionReason?: string | null
}

/**
 * Known automation / bot / system identities that must NEVER satisfy
 * the human editorial review requirement.
 */
export const KNOWN_AUTOMATION_UIDS = new Set<string>([
  'ap3scBglLIVwflfZN4qL8PKrM1A3', // historical crawler/pilot UID
  'editorial_ops',
  'crawler_bot',
  'crawler_cron',
  'crawler_dispatcher',
  'ai_worker',
  'deepseek',
  'system',
  'nahaber_bot',
  'automation',
  'ai_editor',
  'service_account',
])

/**
 * Check if a given UID represents an automation/bot identity.
 */
export function isAutomationIdentity(uid: string): boolean {
  const normalized = uid.trim().toLowerCase()
  if (KNOWN_AUTOMATION_UIDS.has(uid) || KNOWN_AUTOMATION_UIDS.has(normalized)) {
    return true
  }
  return (
    normalized.startsWith('bot_') ||
    normalized.startsWith('ai_') ||
    normalized.startsWith('crawler_') ||
    normalized.startsWith('service_') ||
    normalized.startsWith('cron_') ||
    normalized.includes('automation')
  )
}

/**
 * Evaluates whether an editorial review record meets the standard for human approval.
 */
export function evaluateEditorialApproval(input: HumanEditorialReviewInput): EditorialApprovalEvaluation {
  const reviewerId = input.reviewerId?.trim() || null
  const decision = input.decision?.trim().toUpperCase() || null

  let reviewedAt: Date | null = null
  if (input.reviewedAt) {
    const d = input.reviewedAt instanceof Date ? input.reviewedAt : new Date(input.reviewedAt)
    if (!isNaN(d.getTime())) {
      reviewedAt = d
    }
  }

  if (decision === 'REJECTED') {
    return {
      status: 'REJECTED',
      reason: input.rejectionReason || 'Editorial candidate was explicitly rejected',
      reviewerId,
      reviewedAt,
    }
  }

  if (!reviewerId) {
    return {
      status: 'UNREVIEWED',
      reason: 'Reviewer identity is missing',
      reviewerId: null,
      reviewedAt,
    }
  }

  if (isAutomationIdentity(reviewerId) || input.isAiGenerated === true) {
    return {
      status: 'BOT_APPROVED',
      reason: `Automated or bot identity (${reviewerId}) cannot satisfy mandatory human editorial review`,
      reviewerId,
      reviewedAt,
    }
  }

  if (decision !== 'APPROVED') {
    return {
      status: 'UNREVIEWED',
      reason: `Editorial decision is not APPROVED (found: ${decision || 'NONE'})`,
      reviewerId,
      reviewedAt,
    }
  }

  if (!reviewedAt) {
    return {
      status: 'UNREVIEWED',
      reason: 'Editorial review timestamp is missing or invalid',
      reviewerId,
      reviewedAt: null,
    }
  }

  return {
    status: 'HUMAN_APPROVED',
    reason: 'Valid human editorial review verified',
    reviewerId,
    reviewedAt,
  }
}

/**
 * Strictly asserts that human editorial approval is present.
 * Throws an Error if evaluation does not yield HUMAN_APPROVED.
 */
export function assertHumanEditorialApproval(input: HumanEditorialReviewInput): EditorialApprovalEvaluation {
  const evalResult = evaluateEditorialApproval(input)
  if (evalResult.status !== 'HUMAN_APPROVED') {
    throw new Error(
      `EDITORIAL_GATE_REJECTED: Mandatory human editorial review required before canonical publication (${evalResult.status}: ${evalResult.reason})`
    )
  }
  return evalResult
}
