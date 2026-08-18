/**
 * Phase 2G — suppress a quality-retry Stage1 call when the next request
 * would be the same DeepSeek messages (same inputHash) as the previous
 * quality-retry. Detected BEFORE the provider call.
 *
 * Default ON (opt-out kill switch). Independent of Phase 2F.
 * Optional percent canary (default 100) uses a different SHA-256 salt
 * than Stage1 retry optimization so cohorts do not overlap.
 *
 * Not a global inputHash lock — state is per pipeline loop only.
 * Manual regeneration starts a new loop and may run a first quality retry.
 */

import { groqCohortBucket, classifierCohortKey } from '@/lib/ai/groqRouting'
import { getAiUsageContext } from '@/lib/ai/usage/context'
import { recordAiRequestUsage } from '@/lib/ai/usage/telemetry'
import { sanitizeRetryTriggers } from '@/lib/ai/usage/retryTriggers'

export const RETRY_SUPPRESSED_REASONS = ['unchanged_quality_retry'] as const
export type RetrySuppressedReason = (typeof RETRY_SUPPRESSED_REASONS)[number]

export const QUALITY_RETRY_SUPPRESSED_OPERATION = 'quality_retry_suppressed'

export function normalizeRetrySuppressedReason(raw: unknown): RetrySuppressedReason | undefined {
  if (typeof raw === 'string' && (RETRY_SUPPRESSED_REASONS as readonly string[]).includes(raw)) {
    return raw as RetrySuppressedReason
  }
  return undefined
}

function envFlagDefaultOn(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return true
  if (raw === '0' || raw === 'false' || raw === 'off') return false
  if (raw === '1' || raw === 'true' || raw === 'on') return true
  return true
}

function envPercentDefault(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw == null || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.floor(n)))
}

export function isUnchangedQualityRetrySuppressionEnabled(): boolean {
  return envFlagDefaultOn('AI_STAGE1_UNCHANGED_RETRY_SUPPRESSION_ENABLED')
}

export function getUnchangedQualityRetrySuppressionPercent(): number {
  return envPercentDefault('AI_STAGE1_UNCHANGED_RETRY_SUPPRESSION_PERCENT', 100)
}

/** Independent of Phase 2F bucket — salt keeps 2F 10% and this percent from colliding. */
export function unchangedQualityRetryBucket(explicit?: string | null): number {
  return groqCohortBucket(`unchanged-qr:${classifierCohortKey(explicit)}`)
}

export function shouldApplyUnchangedQualityRetrySuppression(explicit?: string | null): boolean {
  if (!isUnchangedQualityRetrySuppressionEnabled()) return false
  const percent = getUnchangedQualityRetrySuppressionPercent()
  if (percent <= 0) return false
  if (percent >= 100) return true
  return unchangedQualityRetryBucket(explicit) < percent
}

export function shouldSuppressUnchangedQualityRetry(opts: {
  previousInputHash?: string
  nextInputHash?: string
}): boolean {
  const prev = opts.previousInputHash?.trim()
  const next = opts.nextInputHash?.trim()
  if (!prev || !next) return false
  return prev === next
}

export type UnchangedRetrySuppressionMeta = {
  inputHash?: string
  attempt: number
  promptSystemTokens?: number
  promptSourceTokens?: number
  promptInstructionTokens?: number
  promptOtherTokens?: number
  promptTotalTokens?: number
  retryTriggers?: string[]
}

export function recordUnchangedQualityRetrySuppression(meta: UnchangedRetrySuppressionMeta): void {
  const ctx = getAiUsageContext()
  const cleaned = sanitizeRetryTriggers(meta.retryTriggers)
  recordAiRequestUsage({
    success: true,
    agentName: 'stage1_writer',
    operation: QUALITY_RETRY_SUPPRESSED_OPERATION,
    provider: 'deepseek',
    generationReason: 'quality_retry',
    retrySuppressedReason: 'unchanged_quality_retry',
    attempt: meta.attempt,
    retryCount: Math.max(0, meta.attempt - 1),
    inputHash: meta.inputHash,
    promptSystemTokens: meta.promptSystemTokens,
    promptSourceTokens: meta.promptSourceTokens,
    promptInstructionTokens: meta.promptInstructionTokens,
    promptOtherTokens: meta.promptOtherTokens,
    productionInputTokens: meta.promptTotalTokens,
    retryTriggers: cleaned.length > 0 ? cleaned : undefined,
    promptVariant: ctx?.retryOptCohort === 'off' ? undefined : ctx?.retryOptCohort,
    canaryBucket: ctx?.retryOptBucket,
  })
}

export type QualityRetryLoopDraft = {
  title: string
  spot?: string
  summary?: string
  description: string
  gateDecision: 'publish' | 'draft' | 'skip'
  gateReasons?: string[]
  publishScore?: number
  categoryConfidence: number
}

export async function runQualityRewriteLoop<T extends QualityRetryLoopDraft>(opts: {
  initial: T
  maxAttempts: number
  remainingLogicalCalls: () => number
  shouldRetry: (current: T) => boolean
  hashAttempt: (current: T, attempt: number) => UnchangedRetrySuppressionMeta
  runAttempt: (current: T, attempt: number) => Promise<T>
  selectWinner: (previous: T, candidate: T) => T
  shouldStop: (current: T) => boolean
  suppressionEnabled: boolean
  onSuppressed?: (meta: UnchangedRetrySuppressionMeta) => void
}): Promise<{ result: T; editorCalls: number; suppressed: number; attempts: number }> {
  let current = opts.initial
  let attempt = 0
  let editorCalls = 0
  let suppressed = 0
  let lastInputHash: string | undefined

  while (
    attempt < opts.maxAttempts &&
    opts.remainingLogicalCalls() > 0 &&
    opts.shouldRetry(current)
  ) {
    attempt += 1
    const hashed = opts.hashAttempt(current, attempt)
    if (
      opts.suppressionEnabled &&
      shouldSuppressUnchangedQualityRetry({
        previousInputHash: lastInputHash,
        nextInputHash: hashed.inputHash,
      })
    ) {
      suppressed += 1
      const meta: UnchangedRetrySuppressionMeta = { ...hashed, attempt }
      opts.onSuppressed?.(meta)
      recordUnchangedQualityRetrySuppression(meta)
      break
    }

    const candidate = await opts.runAttempt(current, attempt)
    editorCalls += 1
    if (hashed.inputHash) lastInputHash = hashed.inputHash
    current = opts.selectWinner(current, candidate)
    if (opts.shouldStop(current)) break
  }

  return { result: current, editorCalls, suppressed, attempts: attempt }
}
