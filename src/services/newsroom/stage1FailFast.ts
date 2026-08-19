import { recordAiRequestUsage } from '@/lib/ai/usage/telemetry'
import {
  evaluateArticleCompleteness,
  qualityDiscardSkipReason,
  type ArticleCompleteness,
  type ArticleCompletenessInput,
  type CompletenessDiscardReason,
} from '@/services/newsroom/pipelineQualityDiscard'

function envFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'on'
}

/** Default OFF. Production must opt in via STAGE1_FAIL_FAST_ENABLED=true. */
export function isStage1FailFastEnabled(): boolean {
  return envFlag('STAGE1_FAIL_FAST_ENABLED')
}

export const STAGE1_FAIL_FAST_DOWNSTREAM_AGENTS = [
  'stage3_category',
  'fact_checker',
  'category_classifier',
  'chief_editor',
] as const

export type Stage1FailFastSkip = {
  skip: true
  skipReason: string
  reason: CompletenessDiscardReason
  completeness: ArticleCompleteness
  estimatedRequestsAvoided: number
}

export type Stage1FailFastContinue = {
  skip: false
  completeness: ArticleCompleteness
}

export function decideStage1FailFast(opts: {
  enabled?: boolean
  skipAiRewrite?: boolean
  article: ArticleCompletenessInput
  /** Stage3 already skipped on the last multi-stage pass. */
  stage3AlreadySuppressed?: boolean
}): Stage1FailFastSkip | Stage1FailFastContinue {
  const completeness = evaluateArticleCompleteness(opts.article)
  const enabled = opts.enabled ?? isStage1FailFastEnabled()
  if (!enabled || opts.skipAiRewrite) {
    return { skip: false, completeness }
  }
  if (!completeness.reason) {
    return { skip: false, completeness }
  }
  const estimatedRequestsAvoided =
    3 + (opts.stage3AlreadySuppressed ? 1 : 0)
  return {
    skip: true,
    skipReason: qualityDiscardSkipReason(completeness.reason),
    reason: completeness.reason,
    completeness,
    estimatedRequestsAvoided,
  }
}

export function recordStage1FailFastTelemetry(opts: {
  reason: CompletenessDiscardReason
  completeness: ArticleCompleteness
  downstreamAiSuppressed: boolean
  estimatedRequestsAvoided: number
  operation: 'stage3_suppressed' | 'downstream_skip'
}): void {
  recordAiRequestUsage({
    success: true,
    agentName: 'stage1_fail_fast',
    operation: opts.operation,
    provider: 'heuristic',
    stage1FailFastTriggered: true,
    stage1FailFastReason: opts.reason,
    stage1OutputWordCount: opts.completeness.wordCount,
    stage1OutputCharCount: opts.completeness.charCount,
    outputWordCount: opts.completeness.wordCount,
    outputChars: opts.completeness.charCount,
    downstreamAiSuppressed: opts.downstreamAiSuppressed,
    estimatedRequestsAvoided: opts.estimatedRequestsAvoided,
  })
}
