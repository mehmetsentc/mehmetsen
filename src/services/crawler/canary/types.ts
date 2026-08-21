/**
 * Phase 4C — DeepSeek single-event canary types.
 * Unit of AI = EVENT. Destination = EDITORIAL_DRAFT only. Never auto-publish.
 */

export const CANARY_STATES = [
  'PREFLIGHT',
  'READY',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'BLOCKED',
] as const
export type CanaryState = (typeof CANARY_STATES)[number]

export const CANARY_OUTPUT_TARGET = 'EDITORIAL_DRAFT' as const
export const CANARY_DRAFT_STATUS = 'AI_DRAFT' as const
export const CANARY_DRAFT_STATUS_TR = 'AI TASLAĞI HAZIR' as const

/** Historical APPROVED_FOR_AI must NOT authorize spend. */
export const APPROVED_FOR_AI = 'APPROVED_FOR_AI' as const
/** Explicit human confirmation required before any paid DeepSeek call. */
export const APPROVED_FOR_REAL_CANARY_EXECUTION = 'APPROVED_FOR_REAL_CANARY_EXECUTION' as const

export const CANARY_COST_LANE = 'manual_canary' as const

export const CANARY_BLOCK_REASONS = [
  'MISSING_CONFIRMATION',
  'APPROVED_FOR_AI_NOT_SUFFICIENT',
  'NOT_CANARY_CANDIDATE',
  'SENSITIVE_TOPIC',
  'NO_VALID_SOURCE',
  'NO_USABLE_BODY',
  'ALREADY_PUBLISHED',
  'ALREADY_AI_PROCESSED',
  'STALE_EVENT',
  'TOKEN_CEILING_EXCEEDED',
  'COST_UNKNOWN',
  'EVENT_COST_LIMIT_EXCEEDED',
  'EXISTING_DRAFT',
  'EXISTING_JOB',
  'CONCURRENCY_LIMIT',
  'PROVIDER_CIRCUIT_OPEN',
  'DISPATCH_MUST_STAY_OFF',
  'LEGACY_AI_MUST_STAY_OFF',
  'PROVIDER_NOT_DEEPSEEK',
  'PAID_CALL_DISABLED',
  'AUTH_401',
  'INSUFFICIENT_BALANCE_402',
] as const
export type CanaryBlockReason = (typeof CANARY_BLOCK_REASONS)[number]

export type CanaryPackedSource = {
  articleId: string
  sourceId: string
  sourceName: string
  publishedAt: Date | null
  title: string
  body: string
  contentHash: string | null
  role: 'PRIMARY' | 'SUPPORTING'
  usedRssSnippet: boolean
  htmlStripped: boolean
}

export type CanaryPackMetrics = {
  sourceCount: number
  primaryPresent: boolean
  supportingCount: number
  maxSources: 3
  htmlCharsRemoved: number
  rssSnippetExcludedCount: number
  duplicateParagraphsDropped: number
  packedChars: number
  packedTokensEstimate: number
  sourceOnce: true
  /** Phase 4C.2 — usable content metrics (deterministic). */
  usableSourceWords?: number
  independentSourceCount?: number
  uniqueFactDensity?: number
  sourceRichness?: 'rich' | 'medium' | 'thin' | 'insufficient'
}

export type CanaryEvidencePack = {
  clusterId: string
  eventKey: string | null
  canonicalTitle: string
  geography: {
    countryCode: string | null
    region: string | null
    city: string | null
    district: string | null
  }
  sources: CanaryPackedSource[]
  /** Delimited untrusted evidence for the model — never treated as instructions. */
  evidenceBlock: string
  packedText: string
  metrics: CanaryPackMetrics
  retainedFullPack: true
}

export type CanaryDraftFields = {
  title: string
  slug: string
  spot: string
  summary: string
  body: string
  tags: string[]
  category: string
  seoTitle: string
  seoDescription: string
  seoKeywords: string[]
  socialTitle: string
  socialDescription: string
  pushTitle: string
  pushText: string
  imageAlt: string
  imageFilename: string
  readingTime: number
}

export const CANARY_REQUIRED_FIELDS = [
  'title',
  'slug',
  'spot',
  'summary',
  'body',
  'tags',
  'category',
  'seoTitle',
  'seoDescription',
  'seoKeywords',
  'socialTitle',
  'socialDescription',
  'pushTitle',
  'pushText',
  'imageAlt',
  'imageFilename',
  'readingTime',
] as const

export type CanaryValidationIssue = {
  field: string
  code: string
  messageTr: string
  severity: 'error' | 'warn'
}

export type CanaryValidationResult = {
  ok: boolean
  issues: CanaryValidationIssue[]
  repaired: boolean
  draft: CanaryDraftFields | null
}

export type CanaryFactFlag = {
  kind: 'number' | 'date' | 'entity' | 'location'
  value: string
  inEvidence: boolean
  messageTr: string
}

export type CanaryPreflight = {
  clusterId: string
  eventKey: string | null
  state: CanaryState
  blockedReason: CanaryBlockReason | null
  ready: boolean
  provider: 'deepseek'
  model: string
  pricingKnown: boolean
  inputCostPer1M: number | null
  outputCostPer1M: number | null
  estimatedInputTokens: number
  estimatedOutputTokens: number
  estimatedTotalTokens: number
  estimatedCostUsd: number | null
  maxCostUsdPerEvent: number
  autoPublish: false
  autoPublishLabelTr: 'KAPALI'
  sources: Array<{ role: string; sourceName: string; title: string }>
  packMetrics: CanaryPackMetrics
  selection: CanarySelectionReport
  confirmationRequired: typeof APPROVED_FOR_REAL_CANARY_EXECUTION
  approvedForAiInsufficient: true
  requestLimits: {
    maxEvents: 1
    concurrency: 1
    initialRequests: 1
    maxWithRepair: 2
  }
  maxOutputTokens?: number
  globalFlags: {
    crawlerAiDispatchEnabled: false | boolean
    legacyDirectAiEnabled: false | boolean
  }
}

export type CanarySelectionReport = {
  isCandidate: boolean
  preferReasons: string[]
  avoidReasons: string[]
  score: number
  notesTr: string[]
}

export type CanaryJobRecord = {
  id: string
  clusterId: string
  eventKey: string | null
  state: CanaryState
  provider: 'deepseek'
  model: string
  requestCount: number
  maxRequests: 2
  estimatedInputTokens: number | null
  estimatedOutputTokens: number | null
  estimatedCostUsd: number | null
  actualInputTokens: number | null
  actualOutputTokens: number | null
  actualCostUsd: number | null
  blockedReason: CanaryBlockReason | string | null
  failureReason: string | null
  editorialDraftId: string | null
  outputTarget: typeof CANARY_OUTPUT_TARGET
  draftStatus: typeof CANARY_DRAFT_STATUS
  autoPublish: false
  lane: typeof CANARY_COST_LANE
  packSnapshot: CanaryEvidencePack | null
  draft: CanaryDraftFields | null
  validation: CanaryValidationResult | null
  factFlags: CanaryFactFlag[]
  createdAt: Date
  updatedAt: Date
  startedAt: Date | null
  completedAt: Date | null
}

export type CanaryProviderResult = {
  called: boolean
  statusCode?: number
  errorCode?: string
  inputTokens?: number
  outputTokens?: number
  text?: string
  /** OpenAI-compatible finish_reason: stop | length | content_filter | ... */
  finishReason?: string | null
  truncated?: boolean
  provider: 'deepseek'
  model: string
}

export type CanaryProvider = {
  chat: (input: {
    system: string
    user: string
    model: string
    pack: CanaryEvidencePack
  }) => Promise<CanaryProviderResult>
}

export type CanaryMemberInput = {
  articleId: string
  sourceId: string
  sourceName: string
  qualityTier?: string
  healthScore?: number
  extractionConfidence?: number | null
  publishedAt: Date | null
  fetchedAt?: Date | null
  title: string | null
  body: string | null
  /** RSS/Atom description — excluded when full body exists. */
  description?: string | null
  contentHash?: string | null
  wordCount?: number | null
  isExactDuplicate?: boolean
  editorialStatus?: string
  editorialNewsId?: string | null
  sourceStatus?: string
  hasMedia?: boolean
  originalUrl?: string | null
  canonicalUrl?: string | null
}

export type CanaryClusterInput = {
  id: string
  eventKey: string | null
  canonicalTitle: string | null
  normalizedTopic?: string | null
  countryCode?: string | null
  region?: string | null
  city?: string | null
  district?: string | null
  editorialDecision?: string | null
  aiEligibility?: string | null
  uniqueSourceCount?: number
  importanceScore?: number
  publishedNewsId?: string | null
  firstSeenAt?: Date | null
  lastSeenAt?: Date | null
  hasMaterialUpdate?: boolean
}
