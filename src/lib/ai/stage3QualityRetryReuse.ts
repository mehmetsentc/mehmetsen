/**
 * Phase 2H — reuse the first successful DeepSeek Stage3 classification
 * when quality_retry re-runs the multi-stage editor.
 *
 * Does not skip Stage1 rewrite, Stage2 quickFactCheck, Stage4 gateKeep,
 * pipeline classifier, FactChecker, or Chief Editor.
 * Does not reuse heuristic fallback — only source === 'deepseek'.
 */

import type { CategoryResult } from '@/services/newsroom/editors/stage3_categoryEditor'
import { recordAiRequestUsage } from '@/lib/ai/usage/telemetry'
import type { GenerationReason } from '@/lib/ai/usage/generationReason'

export const STAGE3_REUSE_REASONS = ['quality_retry'] as const
export type Stage3ReuseReason = (typeof STAGE3_REUSE_REASONS)[number]

export const STAGE3_REUSED_OPERATION = 'stage3_reused'

export function normalizeStage3ReuseReason(raw: unknown): Stage3ReuseReason | undefined {
  if (typeof raw === 'string' && (STAGE3_REUSE_REASONS as readonly string[]).includes(raw)) {
    return raw as Stage3ReuseReason
  }
  return undefined
}

export function isReusableStage3Classification(
  value: CategoryResult | null | undefined
): value is CategoryResult {
  if (!value) return false
  if (value.source !== 'deepseek') return false
  return typeof value.categoryId === 'string' && value.categoryId.trim().length > 0
}

export function shouldReuseStage3OnQualityRetry(opts: {
  generationReason?: GenerationReason | string
  previousStage3?: CategoryResult | null
}): boolean {
  if (opts.generationReason !== 'quality_retry') return false
  return isReusableStage3Classification(opts.previousStage3)
}

export function cloneStage3Classification(value: CategoryResult): CategoryResult {
  return {
    categoryId: value.categoryId,
    isBreaking: value.isBreaking,
    confidence: value.confidence,
    city: value.city,
    district: value.district,
    country: value.country,
    tags: Array.isArray(value.tags) ? [...value.tags] : [],
    reason: value.reason,
    source: value.source,
  }
}

/** First DeepSeek success wins; heuristic never replaces a later cache miss. */
export function rememberReusableStage3(
  current?: CategoryResult | null,
  previous?: CategoryResult | null
): CategoryResult | undefined {
  if (isReusableStage3Classification(previous)) {
    return cloneStage3Classification(previous)
  }
  if (isReusableStage3Classification(current)) {
    return cloneStage3Classification(current)
  }
  return undefined
}

export function isBilledStage3CategoryEvent(event: {
  agentName?: unknown
  operation?: unknown
}): boolean {
  if (event.agentName !== 'stage3_category') return false
  return event.operation !== STAGE3_REUSED_OPERATION
}

export function recordStage3Reuse(opts: {
  category: CategoryResult
  generationReason?: GenerationReason | string
}): void {
  recordAiRequestUsage({
    success: true,
    agentName: 'stage3_category',
    operation: STAGE3_REUSED_OPERATION,
    provider: 'heuristic',
    generationReason: opts.generationReason === 'quality_retry' ? 'quality_retry' : undefined,
    stage3ReuseReason: 'quality_retry',
    resultCategoryId: opts.category.categoryId,
    schemaValid: true,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  })
}
