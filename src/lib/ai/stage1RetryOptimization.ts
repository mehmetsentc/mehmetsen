/**
 * Stage1 retry-cost canary (Phase 2F).
 *
 * Default OFF. Production writer/model unchanged unless both
 * AI_STAGE1_RETRY_OPTIMIZATION_ENABLED and PERCENT select this cohort.
 * Cohort: SHA-256 of newsId → queueId → traceId. No Math.random.
 *
 * Optimized cohort:
 * - <220 words is not a continuation reason by itself
 * - body_short + draft + publish_score_low collapse to short_body_quality
 * - at most 2 logical Stage1 calls (initial + one corrective)
 * Provider HTTP retries do not consume the logical cap.
 */

import { groqCohortBucket, classifierCohortKey } from '@/lib/ai/groqRouting'
import { getAiUsageContext } from '@/lib/ai/usage/context'
import { contentHasIncompleteSegments, titleLooksIncomplete } from '@/lib/ai/textCompleteness'
import { isNewsBodyTooShort } from '@/lib/contentQuality'
import {
  classifyContinuationTriggers,
  classifyQualityRetryTriggers,
  hasCriticalNewsFields,
  looksLikeActualTruncation,
  sanitizeRetryTriggers,
  type ContinuationTrigger,
  type QualityRetryTrigger,
  type RetryTrigger,
} from '@/lib/ai/usage/retryTriggers'
import type { GenerationReason } from '@/lib/ai/usage/generationReason'

export const STAGE1_RETRY_OPT_CAP = 2
export const STAGE1_RETRY_OPT_COHORTS = ['off', 'control', 'optimized'] as const
export type Stage1RetryOptCohort = (typeof STAGE1_RETRY_OPT_COHORTS)[number]

export type Stage1CallBudget = {
  used: number
  cap: number | null
}

function envFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'on'
}

function envPercent(name: string): number {
  const n = Number(process.env[name] ?? '0')
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.floor(n)))
}

export function isStage1RetryOptimizationEnabled(): boolean {
  return envFlag('AI_STAGE1_RETRY_OPTIMIZATION_ENABLED') && envPercent('AI_STAGE1_RETRY_OPTIMIZATION_PERCENT') > 0
}

export function getStage1RetryOptimizationPercent(): number {
  return envPercent('AI_STAGE1_RETRY_OPTIMIZATION_PERCENT')
}

export function stage1RetryOptBucket(explicit?: string | null): number {
  return groqCohortBucket(classifierCohortKey(explicit))
}

export function shouldUseStage1RetryOptimization(explicit?: string | null): boolean {
  if (!isStage1RetryOptimizationEnabled()) return false
  const percent = getStage1RetryOptimizationPercent()
  if (percent >= 100) return true
  return stage1RetryOptBucket(explicit) < percent
}

export function createStage1CallBudget(cap: number | null): Stage1CallBudget {
  return { used: 0, cap }
}

export function remainingStage1LogicalCalls(budget: Stage1CallBudget | undefined | null): number {
  if (!budget || budget.cap == null) return Number.POSITIVE_INFINITY
  return Math.max(0, budget.cap - budget.used)
}

/** Consume one logical Stage1 generation. Provider HTTP retries must not call this. */
export function tryConsumeStage1LogicalCall(budget: Stage1CallBudget | undefined | null): boolean {
  if (!budget) return true
  if (budget.cap != null && budget.used >= budget.cap) return false
  budget.used += 1
  return true
}

export function resolveStage1RetryOptCohort(explicit?: string | null): Stage1RetryOptCohort {
  if (!isStage1RetryOptimizationEnabled()) return 'off'
  return shouldUseStage1RetryOptimization(explicit) ? 'optimized' : 'control'
}

/**
 * Attach cohort + optional cap onto the current AI usage ALS store.
 * Safe no-op when no context exists (unit tests / scripts).
 */
export function attachStage1RetryOptimizationContext(explicit?: string | null): Stage1RetryOptCohort {
  const ctx = getAiUsageContext()
  const cohort = resolveStage1RetryOptCohort(explicit)
  if (!ctx) return cohort
  if (ctx.retryOptCohort) return ctx.retryOptCohort
  ctx.retryOptCohort = cohort
  ctx.retryOptBucket = stage1RetryOptBucket(explicit)
  if (cohort === 'optimized') {
    ctx.stage1CallBudget = createStage1CallBudget(STAGE1_RETRY_OPT_CAP)
  }
  return cohort
}

export function isOptimizedStage1RetryCohort(): boolean {
  attachStage1RetryOptimizationContext()
  return getAiUsageContext()?.retryOptCohort === 'optimized'
}

export type ContinuationArticle = {
  title?: string | null
  spot?: string | null
  summary?: string | null
  content?: string | null
}

export function articleHasStructuralFailure(article: ContinuationArticle): boolean {
  return !hasCriticalNewsFields(article)
}

export function articleIsSyntacticallyComplete(article: ContinuationArticle): boolean {
  if (titleLooksIncomplete(article.title || '')) return false
  if (contentHasIncompleteSegments(article.spot || '')) return false
  if (contentHasIncompleteSegments(article.summary || '')) return false
  if (contentHasIncompleteSegments(article.content || '')) return false
  if (looksLikeActualTruncation(article.content || '')) return false
  return true
}

/**
 * Control: any incompleteness including <220 words.
 * Optimized: skip continuation when JSON/schema is valid, fields exist,
 * text is syntactically complete, and the only issue is short body.
 */
export function shouldRunStage1Continuation(
  article: ContinuationArticle,
  optimized: boolean
): boolean {
  if (!optimized) {
    return (
      titleLooksIncomplete(article.title || '') ||
      contentHasIncompleteSegments(article.spot || '') ||
      contentHasIncompleteSegments(article.summary || '') ||
      contentHasIncompleteSegments(article.content || '') ||
      isNewsBodyTooShort(article.content)
    )
  }
  if (articleHasStructuralFailure(article)) return true
  const triggers = classifyContinuationTriggers(article)
  return (
    triggers.includes('title_incomplete') ||
    triggers.includes('incomplete_segment') ||
    triggers.includes('actual_truncation')
  )
}

export function continuationTriggersForCall(
  article: ContinuationArticle,
  optimized: boolean
): ContinuationTrigger[] {
  const triggers = classifyContinuationTriggers(article)
  if (!optimized) return triggers
  return triggers.filter((t) => t !== 'body_too_short')
}

const SHORT_BODY_GATE_REASON = /içerik çok kısa|min gövde|kelime/i
const INDEPENDENT_GATE_REASON = /fact-check|kategori|uyumsuz|teknik|fallback|AI içerik üretemedi/i

export type QualityRetryArticle = {
  gateDecision?: string | null
  gateReasons?: string[] | null
  publishScore?: number | null
  categoryConfidence?: number | null
  title?: string | null
  spot?: string | null
  summary?: string | null
  description?: string | null
  aiWritten?: boolean
  shortContent?: boolean
}

export function hasIncompleteContentIssue(input: QualityRetryArticle): boolean {
  return (
    titleLooksIncomplete(input.title || '') ||
    contentHasIncompleteSegments(input.spot || '') ||
    contentHasIncompleteSegments(input.summary || '') ||
    contentHasIncompleteSegments(input.description || '')
  )
}

export function isShortBodyQualityCluster(input: QualityRetryArticle): boolean {
  const short = Boolean(input.shortContent) || isNewsBodyTooShort(input.description)
  if (!short) return false
  if (input.aiWritten === false) return false
  if ((input.categoryConfidence ?? 1) === 0) return false
  if (hasIncompleteContentIssue(input)) return false
  const reasons = (input.gateReasons ?? []).filter(Boolean)
  if (reasons.some((r) => INDEPENDENT_GATE_REASON.test(r))) return false
  if (reasons.length > 0 && !reasons.every((r) => SHORT_BODY_GATE_REASON.test(r))) return false
  return true
}

export function independentQualityCauses(input: QualityRetryArticle): QualityRetryTrigger[] {
  const out: QualityRetryTrigger[] = []
  if (input.aiWritten === false) out.push('draft')
  if ((input.categoryConfidence ?? 1) === 0) out.push('category_confidence_zero')
  if (hasIncompleteContentIssue(input)) out.push('incomplete_content')
  if (articleHasStructuralFailure({
    title: input.title,
    spot: input.spot,
    summary: input.summary,
    content: input.description,
  })) {
    out.push('incomplete_content')
  }
  const shortCluster = isShortBodyQualityCluster(input)
  if (input.gateDecision === 'draft' && !shortCluster && input.aiWritten !== false) {
    out.push('draft')
  }
  if ((input.publishScore ?? 100) < 60 && !shortCluster) {
    out.push('publish_score_low')
  }
  return [...new Set(out)]
}

export function normalizeQualityRetryTriggers(input: QualityRetryArticle): RetryTrigger[] {
  const raw = classifyQualityRetryTriggers(input)
  if (isShortBodyQualityCluster(input)) {
    const independent = independentQualityCauses(input)
    return sanitizeRetryTriggers(['short_body_quality', ...independent])
  }
  return raw
}

export function shouldRunQualityRetry(input: QualityRetryArticle, optimized: boolean): boolean {
  if (input.gateDecision === 'skip') return false
  const independent = independentQualityCauses(input)
  if (independent.length > 0) return true
  if (!optimized) {
    return (
      input.gateDecision === 'draft' ||
      (input.publishScore ?? 0) < 60 ||
      (input.categoryConfidence ?? 1) === 0 ||
      hasIncompleteContentIssue(input) ||
      isNewsBodyTooShort(input.description) ||
      Boolean(input.shortContent)
    )
  }
  return false
}

export type SimulatedStage1Call = {
  reason: GenerationReason
  triggers?: RetryTrigger[]
}

/**
 * Replay a news item's observed Stage1 sequence under optimized policy + cap.
 * Provider retries are ignored (same logical call).
 */
export function simulateOptimizedStage1Calls(calls: SimulatedStage1Call[]): {
  optimizedCalls: number
  skippedContinuation: number
  skippedQualityRetry: number
  hitCap: boolean
} {
  const budget = createStage1CallBudget(STAGE1_RETRY_OPT_CAP)
  let skippedContinuation = 0
  let skippedQualityRetry = 0
  let hitCap = false

  for (const call of calls) {
    if (call.reason === 'provider_retry' || call.reason === 'pipeline_retry') continue
    if (call.reason === 'initial') {
      if (!tryConsumeStage1LogicalCall(budget)) {
        hitCap = true
        break
      }
      continue
    }
    if (call.reason === 'continuation') {
      const triggers = call.triggers ?? []
      const allow =
        triggers.includes('title_incomplete') ||
        triggers.includes('incomplete_segment') ||
        triggers.includes('actual_truncation') ||
        triggers.includes('schema_failure')
      if (!allow) {
        skippedContinuation += 1
        continue
      }
      if (!tryConsumeStage1LogicalCall(budget)) {
        hitCap = true
        skippedContinuation += 1
        continue
      }
      continue
    }
    if (call.reason === 'quality_retry') {
      const triggers = call.triggers ?? []
      const independent =
        triggers.includes('category_confidence_zero') ||
        triggers.includes('incomplete_content') ||
        (triggers.includes('draft') && !triggers.includes('body_short') && !triggers.includes('short_body_quality')) ||
        (triggers.includes('publish_score_low') &&
          !triggers.includes('body_short') &&
          !triggers.includes('short_body_quality'))
      if (!independent) {
        skippedQualityRetry += 1
        continue
      }
      if (!tryConsumeStage1LogicalCall(budget)) {
        hitCap = true
        skippedQualityRetry += 1
      }
    }
  }

  return {
    optimizedCalls: budget.used,
    skippedContinuation,
    skippedQualityRetry,
    hitCap,
  }
}

/** Production Phase 2E audit window: 43 news / 154 Stage1 calls. */
export function buildPhase2eBaselineTraces(): SimulatedStage1Call[][] {
  const traces: SimulatedStage1Call[][] = []
  const shortCont: SimulatedStage1Call = {
    reason: 'continuation',
    triggers: ['body_too_short'],
  }
  const shortQr: SimulatedStage1Call = {
    reason: 'quality_retry',
    triggers: ['draft', 'publish_score_low', 'body_short'],
  }
  const incompleteCont: SimulatedStage1Call = {
    reason: 'continuation',
    triggers: ['body_too_short', 'incomplete_segment'],
  }
  const incompleteQr: SimulatedStage1Call = {
    reason: 'quality_retry',
    triggers: ['draft', 'publish_score_low', 'body_short', 'incomplete_content'],
  }

  for (let i = 0; i < 18; i++) traces.push([{ reason: 'initial' }])
  traces.push([{ reason: 'initial' }, shortCont])
  traces.push([{ reason: 'initial' }, shortCont])
  traces.push([{ reason: 'initial' }, incompleteCont, incompleteQr])
  traces.push([{ reason: 'initial' }, incompleteCont, shortQr, incompleteCont])
  traces.push([{ reason: 'initial' }, incompleteCont, incompleteQr, incompleteCont, shortQr])
  for (let i = 0; i < 11; i++) {
    traces.push([{ reason: 'initial' }, shortCont, shortQr, shortCont, shortQr, shortCont])
  }
  for (let i = 0; i < 9; i++) {
    traces.push([{ reason: 'initial' }, incompleteCont, incompleteQr, incompleteCont, incompleteQr, incompleteCont])
  }
  return traces
}

export function summarizeRetryOptimizationSimulation(traces: SimulatedStage1Call[][]): {
  news: number
  controlCalls: number
  optimizedCalls: number
  controlCallsPerNews: number
  optimizedCallsPerNews: number
  callDropPct: number
  controlMax: number
  optimizedMax: number
  skippedContinuation: number
  skippedQualityRetry: number
} {
  let controlCalls = 0
  let optimizedCalls = 0
  let controlMax = 0
  let optimizedMax = 0
  let skippedContinuation = 0
  let skippedQualityRetry = 0
  for (const trace of traces) {
    const logical = trace.filter((c) => c.reason !== 'provider_retry' && c.reason !== 'pipeline_retry')
    controlCalls += logical.length
    controlMax = Math.max(controlMax, logical.length)
    const sim = simulateOptimizedStage1Calls(trace)
    optimizedCalls += sim.optimizedCalls
    optimizedMax = Math.max(optimizedMax, sim.optimizedCalls)
    skippedContinuation += sim.skippedContinuation
    skippedQualityRetry += sim.skippedQualityRetry
  }
  const news = traces.length
  const controlCallsPerNews = news > 0 ? controlCalls / news : 0
  const optimizedCallsPerNews = news > 0 ? optimizedCalls / news : 0
  return {
    news,
    controlCalls,
    optimizedCalls,
    controlCallsPerNews,
    optimizedCallsPerNews,
    callDropPct: controlCalls > 0 ? 1 - optimizedCalls / controlCalls : 0,
    controlMax,
    optimizedMax,
    skippedContinuation,
    skippedQualityRetry,
  }
}
