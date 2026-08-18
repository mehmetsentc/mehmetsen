/**
 * Normalized AI usage — provider-specific fields stay in parseUsage.
 * Do not persist prompts, API keys, or full article text.
 */

export type NormalizedAiUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cacheHitTokens?: number
  cacheMissTokens?: number
}

/** Numeric prompt-size / shadow fields. Never store prompt or article text. */
export type AiUsageCostAuditFields = {
  promptSystemTokens?: number
  promptSourceTokens?: number
  promptInstructionTokens?: number
  promptOtherTokens?: number
  shadowProvider?: string
  shadowModel?: string
  shadowSuccess?: boolean
  shadowInputTokens?: number
  shadowOutputTokens?: number
  shadowLatencyMs?: number
  productionInputTokens?: number
  productionOutputTokens?: number
  stage1CallsPerNews?: number
  /** Closed enum list only — never prompt or article text. */
  retryTriggers?: string[]
  /** Closed enum — why a quality retry was skipped before the provider call. */
  retrySuppressedReason?: string
  /** Closed enum — why Stage3 classification was reused instead of a DeepSeek call. */
  stage3ReuseReason?: string
  outputWordCount?: number
  gateDecision?: string
  publishScore?: number
  categoryConfidence?: number
}

export type AiUsageTelemetryMeta = {
  agentName?: string
  operation?: string
  promptVersion?: string
  attempt?: number
  retryCount?: number
  newsId?: string
  queueId?: string
  sourceItemId?: string
  traceId?: string
  requestId?: string
  inputHash?: string
  generationReason?: string
  resultCategoryId?: string
  schemaValid?: boolean
  outputChars?: number
  requiredFieldsPresent?: boolean
  promptVariant?: string
  stage3CanaryBucket?: number
  canaryBucket?: number
} & AiUsageCostAuditFields

export type AiUsageContext = {
  traceId?: string
  newsId?: string
  queueId?: string
  sourceItemId?: string
  agentName?: string
  operation?: string
  promptVersion?: string
  attempt?: number
  retryOptCohort?: 'off' | 'control' | 'optimized'
  retryOptBucket?: number
  stage1CallBudget?: { used: number; cap: number | null }
}

export type RecordAiRequestUsageInput = {
  requestId?: string
  traceId?: string
  newsId?: string
  queueId?: string
  sourceItemId?: string
  agentName?: string
  operation?: string
  promptVersion?: string
  provider?: string
  model?: string
  usage?: NormalizedAiUsage
  latencyMs?: number
  retryCount?: number
  attempt?: number
  success: boolean
  statusCode?: number
  errorCode?: string
  inputHash?: string
  /** Legacy recordAiUsage compatibility */
  editorId?: string | null
  task?: string
  published?: boolean
  durationMs?: number
  routeId?: string
  taskType?: string
  fallbackFrom?: string
  fallbackReason?: string
  providerRank?: number
  canaryBucket?: number
  generationReason?: string
  resultCategoryId?: string
  schemaValid?: boolean
  outputChars?: number
  requiredFieldsPresent?: boolean
  promptVariant?: string
  stage3CanaryBucket?: number
} & AiUsageCostAuditFields

export type AiUsageEventDoc = {
  requestId?: string
  traceId?: string
  newsId?: string
  queueId?: string
  sourceItemId?: string
  agentName?: string
  operation?: string
  promptVersion?: string
  provider?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cacheHitTokens?: number
  cacheMissTokens?: number
  latencyMs?: number
  retryCount?: number
  attempt?: number
  success?: boolean
  statusCode?: number
  errorCode?: string
  estimatedInputCostUsd?: number
  estimatedOutputCostUsd?: number
  estimatedCacheCostUsd?: number
  estimatedTotalCostUsd?: number
  inputHash?: string
  schemaVersion?: number
  editorId?: string | null
  task?: string
  published?: boolean
  createdAt: number
  timestamp: number
  routeId?: string
  taskType?: string
  fallbackFrom?: string
  fallbackReason?: string
  providerRank?: number
  canaryBucket?: number
  generationReason?: string
  resultCategoryId?: string
  schemaValid?: boolean
  outputChars?: number
  requiredFieldsPresent?: boolean
  promptVariant?: string
  stage3CanaryBucket?: number
} & AiUsageCostAuditFields
