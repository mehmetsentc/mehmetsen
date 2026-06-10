/**
 * NaHaber Multi-Agent AI Newsroom — Shared Types
 *
 * Pipeline: DeepSeek (Collector) → Gemini (Editor) → GPT (QA) → Firestore
 */

// ── Agent identifiers ─────────────────────────────────────────────────────────
export type AiAgentId = 'deepseek' | 'gemini' | 'gpt' | 'claude'

export interface AiAgentStatus {
  id: AiAgentId
  name: string
  role: string
  configured: boolean
  lastUsedAt?: number
  totalCalls: number
  successCalls: number
  failedCalls: number
  avgLatencyMs: number
}

// ── Queue ─────────────────────────────────────────────────────────────────────
export type AiQueueStatus = 'pending' | 'processing' | 'done' | 'failed' | 'rejected'

export interface AiQueueItem {
  id: string
  status: AiQueueStatus
  priority: number                 // 0 = normal, 1 = breaking, 2 = urgent
  sourceLabel: string
  sourceUrl: string
  originalTitle: string
  originalSummary: string
  originalContent: string
  imageUrl?: string
  rssFingerprint?: string
  category?: string
  forcedCategoryId?: string
  forcedCity?: string
  editorId?: string
  // pipeline state
  deepseekResult?: DeepSeekCollectResult
  geminiResult?: GeminiEditResult
  gptResult?: GptQaResult
  // meta
  createdAt: number
  updatedAt: number
  processedAt?: number
  retryCount: number
  errorLog?: string[]
  finalNewsId?: string             // Firestore news doc id after publish
}

// ── DeepSeek (News Generator / Collector) ─────────────────────────────────────
export interface DeepSeekCollectResult {
  isDuplicate: boolean
  duplicateScore: number           // 0–100
  similarArticleIds?: string[]
  shouldMerge: boolean
  mergeArticleIds?: string[]
  enrichedContent: string
  additionalSources?: string[]
  keyFacts: string[]
  sentiment: 'positive' | 'negative' | 'neutral'
  urgencyScore: number             // 0–100
  qualityScore: number             // 0–100 (raw source quality)
  processedAt: number
  modelUsed: string
}

// ── Gemini (Chief News Editor) ────────────────────────────────────────────────
export interface GeminiEditResult {
  // Core content
  title: string
  shortTitle: string
  slug: string
  description: string
  summary: string
  spot: string                     // Journalistic lead / lede
  content: string                  // Full HTML article body

  // Classification
  category: string
  subCategory?: string
  newsType: 'breaking' | 'feature' | 'analysis' | 'report' | 'opinion' | 'update'
  sentiment: 'positive' | 'negative' | 'neutral'

  // Geo
  location?: string
  country: string
  language: 'tr'

  // Taxonomy
  tags: string[]
  keywords: string[]
  relatedTopics: string[]

  // SEO
  metaTitle: string
  metaDescription: string
  seoScore: number                 // 0–100
  canonical?: string

  // Scores
  qualityScore: number             // 0–100
  factCheckScore: number           // 0–100
  readingTime: number              // minutes
  aiConfidence: number             // 0–100

  // Flags
  breakingNews: boolean
  featured: boolean
  isBreaking: boolean

  // Social
  socialCaption: string
  twitterText: string
  facebookText: string
  instagramCaption: string
  pushNotification: string

  // Editorial
  editorNote?: string
  thumbnailSuggestion?: string

  // Push
  pushTitle: string
  pushBody: string

  processedAt: number
  modelUsed: string
}

// ── GPT (Senior Editor / QA) ──────────────────────────────────────────────────
export type GptDecision = 'approved' | 'rejected' | 'needs_revision'

export interface GptQaResult {
  decision: GptDecision
  score: number                    // 0–100 overall quality
  // Sub-scores
  grammarScore: number
  readabilityScore: number
  seoScore: number
  accuracyScore: number
  mobileScore: number
  googleNewsScore: number
  googleDiscoverScore: number
  // Feedback
  issues: string[]
  suggestions: string[]
  revisedTitle?: string
  revisedDescription?: string
  // Push
  pushTitle: string
  pushBody: string
  processedAt: number
  modelUsed: string
}

// ── Pipeline result ────────────────────────────────────────────────────────────
export interface PipelineResult {
  queueItemId: string
  success: boolean
  newsId?: string
  stage: 'deepseek' | 'gemini' | 'gpt' | 'publish' | 'failed'
  decision?: GptDecision
  error?: string
  durationMs: number
}

// ── AI Log ─────────────────────────────────────────────────────────────────────
export type AiLogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface AiLogEntry {
  id?: string
  level: AiLogLevel
  agent: AiAgentId | 'pipeline' | 'queue'
  message: string
  meta?: Record<string, unknown>
  queueItemId?: string
  newsId?: string
  durationMs?: number
  timestamp: number
}

// ── Cron run summary ──────────────────────────────────────────────────────────
export interface AiCronRunResult {
  processed: number
  published: number
  rejected: number
  failed: number
  durationMs: number
  items: Array<{
    queueItemId: string
    title: string
    decision: GptDecision | 'error'
    newsId?: string
  }>
}
