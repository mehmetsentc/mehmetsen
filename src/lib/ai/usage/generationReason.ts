export const GENERATION_REASONS = [
  'initial',
  'continuation',
  'quality_retry',
  'provider_retry',
  'pipeline_retry',
  'manual_retry',
  'unknown',
] as const

export type GenerationReason = (typeof GENERATION_REASONS)[number]

export function normalizeGenerationReason(raw: unknown): GenerationReason {
  if (typeof raw === 'string' && (GENERATION_REASONS as readonly string[]).includes(raw)) {
    return raw as GenerationReason
  }
  return 'unknown'
}

export function classifySecondStage1Call(opts: {
  sameInputHash: boolean
  attempt: number
  generationReason?: GenerationReason | null
}): 'A' | 'B' | 'C' | 'D' | 'E' | 'F' {
  const reason = opts.generationReason ?? 'unknown'
  if (reason === 'continuation') return 'A'
  if (reason === 'quality_retry' || reason === 'pipeline_retry') return 'B'
  if (reason === 'provider_retry' || (opts.sameInputHash && opts.attempt > 1)) return 'C'
  if (reason === 'initial' && !opts.sameInputHash) return 'D'
  if (reason === 'manual_retry') return 'E'
  if (opts.sameInputHash && opts.attempt === 1) return 'E'
  return 'F'
}

/**
 * Read-only map of why Stage1 fires extra DeepSeek calls.
 * Production retry behavior is unchanged — this is audit documentation.
 *
 * Continuation (writeArticle): one extra DeepSeek if title/spot/summary/content
 * look incomplete OR body < 220 words. Often fires on short-but-valid copy or
 * paragraphs without a terminal period — not only true API truncation.
 *
 * Quality retry (pipeline): full Stage1–4 rerun when gate=draft, score<60,
 * categoryConfidence=0, or the same incomplete/short checks. Stacks on top of
 * continuation, so one news item can pay 3–4 Stage1 calls.
 *
 * Provider retry: same prompt after HTTP 429 / empty DeepSeek body.
 * Pipeline retry: enum only — never assigned in writers or pipeline.
 */
export const STAGE1_RETRY_AUDIT = {
  continuation: {
    assignedIn: 'stage1_contentWriter.writeArticle',
    extraCalls: 1,
    triggers: [
      'titleLooksIncomplete',
      'contentHasIncompleteSegments(spot|summary|content)',
      'isNewsBodyTooShort(<220 words)',
    ],
    necessaryForTruncation: true,
    likelyOverfire: true,
  },
  quality_retry: {
    assignedIn: 'pipeline rewrite loop',
    extraCalls: 'NEWSROOM_REWRITE_MAX_RETRIES (default 2)',
    rerunsFullEditor: true,
    triggers: ['gateDecision=draft', 'publishScore<60', 'categoryConfidence=0', 'articleIncomplete'],
    necessaryForGate: true,
    duplicatesStage1: true,
  },
  provider_retry: {
    assignedIn: 'stage1_contentWriter.callDeepSeek',
    extraCalls: 1,
    triggers: ['HTTP 429', 'empty DeepSeek body'],
    sameInput: true,
  },
  pipeline_retry: {
    assignedIn: null,
    extraCalls: 0,
    triggers: [],
  },
} as const

