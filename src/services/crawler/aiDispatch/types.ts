export const AI_DISPATCH_STATUSES = [
  'PENDING',
  'RESERVED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'BLOCKED',
  'CANCELLED',
] as const
export type AiDispatchStatus = (typeof AI_DISPATCH_STATUSES)[number]

export const AI_DISPATCH_TYPES = ['INITIAL', 'MATERIAL_UPDATE', 'MANUAL'] as const
export type AiDispatchType = (typeof AI_DISPATCH_TYPES)[number]

export const AI_COST_LANES = ['crawler_automatic', 'legacy_automatic', 'manual_editor', 'manual_canary'] as const
export type AiCostLane = (typeof AI_COST_LANES)[number]

export const AI_BLOCK_REASONS = [
  'DISPATCH_DISABLED',
  'DRY_RUN',
  'WATCHING',
  'REJECTED',
  'NO_VALID_SOURCE',
  'NO_USABLE_BODY',
  'ALREADY_DISPATCHED',
  'ALREADY_PUBLISHED',
  'TOKEN_BUDGET_EXCEEDED',
  'COST_UNKNOWN',
  'EVENT_COST_LIMIT_EXCEEDED',
  'HOURLY_BUDGET_EXCEEDED',
  'DAILY_BUDGET_EXCEEDED',
  'MONTHLY_BUDGET_EXCEEDED',
  'HOURLY_REQUEST_LIMIT',
  'DAILY_REQUEST_LIMIT',
  'CONCURRENCY_LIMIT',
  'PROVIDER_CIRCUIT_OPEN',
  'MATERIAL_UPDATE_NOT_EXECUTED',
  'EDITORIALLY_REJECTED',
  'MODE_OFF',
  'UPDATE_AVAILABLE',
] as const
export type AiBlockReason = (typeof AI_BLOCK_REASONS)[number]

export const EDITORIAL_OUTPUT_TARGET = 'EDITORIAL_DRAFT' as const

export type CrawlerAiJobRecord = {
  id: string
  clusterId: string
  eventKey: string | null
  status: AiDispatchStatus
  dispatchType: AiDispatchType
  priority: number
  eligibilityStatus: string | null
  estimatedInputTokens: number | null
  estimatedOutputTokens: number | null
  estimatedTotalTokens: number | null
  estimatedCostUsd: number | null
  actualInputTokens: number | null
  actualOutputTokens: number | null
  actualCostUsd: number | null
  model: string | null
  provider: string | null
  attemptCount: number
  maxAttempts: number
  reservedAt: Date | null
  startedAt: Date | null
  completedAt: Date | null
  blockedReason: AiBlockReason | string | null
  failureReason: string | null
  editorialNewsId: string | null
  outputTarget: typeof EDITORIAL_OUTPUT_TARGET
  selectedSourceCount: number
  createdAt: Date
  updatedAt: Date
}

export type CrawlerAiLedgerRow = {
  id: string
  timestamp: Date
  provider: string
  model: string | null
  lane: AiCostLane
  jobId: string | null
  clusterId: string | null
  requestType: string | null
  inputTokens: number | null
  outputTokens: number | null
  estimatedCostUsd: number | null
  actualCostUsd: number | null
  status: string
}

export type CrawlerAiBudgetWindow = {
  id: string
  lane: AiCostLane
  periodType: 'hour' | 'day' | 'month'
  periodKey: string
  reservedUsd: number
  spentUsd: number
  requestCount: number
}

export type CrawlerAiCircuitState = {
  provider: string
  state: 'CLOSED' | 'OPEN'
  openedAt: Date | null
  reason: string | null
  consecutive429: number
  consecutive5xx: number
  lastStatus: number | null
}

export type CrawlerAiShadowRow = {
  clusterId: string
  eventKey: string | null
  canonicalTitle: string | null
  eligibility: string | null
  wouldDispatch: boolean
  blockedReason: AiBlockReason | string | null
  dispatchType: AiDispatchType
  estimatedInputTokens: number | null
  estimatedOutputTokens: number | null
  estimatedTotalTokens: number | null
  estimatedCostUsd: number | null
  estimatedPipelineTokens: number | null
  estimatedPipelineCostUsd: number | null
  selectedSourceCount: number
  selectedSourceNames: string[]
  importanceScore: number
  localImportance: number
  nationalImportance: number
  globalImportance: number
  geographicScope: string | null
  isLocalProtected: boolean
  evaluatedAt: Date
}

export type PackedSource = {
  articleId: string
  sourceId: string
  sourceName: string
  publishedAt: Date | null
  title: string
  body: string
  contentHash: string | null
  role?: 'PRIMARY' | 'SUPPORTING'
}

export type EventAiPack = {
  clusterId: string
  eventKey: string | null
  canonicalTitle: string
  geography: {
    countryCode: string | null
    region: string | null
    city: string | null
    district: string | null
    scope: string | null
  }
  importance: number
  localImportance: number
  nationalImportance: number
  globalImportance: number
  hasMaterialUpdate: boolean
  sources: PackedSource[]
  packedText: string
  futureAiJobs?: 1
  providerRequests?: 0
}

export type TokenEstimate = {
  estimatedInputTokens: number
  estimatedOutputTokens: number
  estimatedTotalTokens: number
}

export type CostEstimate = {
  known: boolean
  estimatedCostUsd: number | null
  pipelineCostUsd: number | null
  pipelineTokens: number | null
  provider: string
  model: string
  reason?: 'COST_UNKNOWN'
}

export type ProviderChatResult = {
  called: boolean
  statusCode?: number
  errorCode?: string
  inputTokens?: number
  outputTokens?: number
  text?: string
}

export type CrawlerAiProvider = {
  chat: (input: { pack: EventAiPack; job: CrawlerAiJobRecord }) => Promise<ProviderChatResult>
}

export type EvaluationInputCluster = {
  id: string
  eventKey: string | null
  canonicalTitle: string | null
  normalizedTopic: string | null
  countryCode: string | null
  region: string | null
  city: string | null
  district: string | null
  aiEligibility: string
  importanceScore: number
  localImportance: number
  nationalImportance: number
  globalImportance: number
  uniqueSourceCount: number
  freshnessScore: number
  hasMaterialUpdate: boolean
  geographicScopeHint?: string | null
  editorialDecision?: string | null
}

export type MemberEvidence = {
  articleId: string
  sourceId: string
  sourceName: string
  qualityTier: string
  healthScore: number
  extractionConfidence: number | null
  publishedAt: Date | null
  fetchedAt: Date | null
  title: string | null
  body: string | null
  description: string | null
  contentHash: string | null
  wordCount: number | null
  isExactDuplicate: boolean
  editorialStatus: string
  editorialNewsId: string | null
  sourceStatus: string
}

export type EvaluateContext = {
  cluster: EvaluationInputCluster
  members: MemberEvidence[]
  existingInitialJob: CrawlerAiJobRecord | null
  circuitOpen: boolean
  now: Date
  executeMaterialUpdate: boolean
}
