/**
 * Multi-Agent AI Editorial Newsroom V2 — persistent editor personas.
 * Distinct from newsroom worker EditorId (breaking-news, local-news, …).
 */

export type AiEditorStatus = 'active' | 'disabled' | 'archived'

export type AiPublishPolicy = 'DRAFT_ONLY' | 'REQUIRES_APPROVAL' | 'AUTO_PUBLISH'

export type AiEditorTask =
  | 'news'
  | 'research'
  | 'analysis'
  | 'column'
  | 'video'
  | 'seo'
  | 'self_review'
  | 'second_review'
  | 'fact_check'
  | 'editorial_decision'
  | 'breaking'
  | 'source'

export type AiPromptType =
  | 'core'
  | 'news'
  | 'column'
  | 'analysis'
  | 'video'
  | 'seo'
  | 'review'
  | 'source'
  | 'breaking'

export type AiProviderId = 'deepseek' | 'gemini' | 'openai'

export type ArticleFormat = 'standard' | 'column' | 'analysis'

export interface AiModelAssignment {
  provider: AiProviderId
  model: string
  fallbackProvider?: AiProviderId
  fallbackModel?: string
}

export interface AiEditorCapabilities {
  newsEnabled: boolean
  columnEnabled: boolean
  analysisEnabled: boolean
  videoEnabled: boolean
  seoEnabled: boolean
  breakingEnabled: boolean
  selfReviewEnabled: boolean
  secondReviewEnabled: boolean
  factCheckEnabled: boolean
  memoryEnabled: boolean
}

export interface AiEditorDocument {
  id: string
  /** Synthetic or linked public users/{uid} */
  authorUid: string
  name: string
  slug: string
  avatarUrl: string | null
  coverUrl: string | null
  title: string
  shortBio: string
  bio: string
  columnName: string | null
  primarySpecialization: string
  specializations: string[]
  categoryIds: string[]
  languages: string[]
  status: AiEditorStatus
  isAI: true
  verified: boolean
  capabilities: AiEditorCapabilities
  publishPolicy: AiPublishPolicy
  maxDailyNews: number
  maxDailyColumns: number
  maxDailyVideos: number
  /** task → model assignment */
  modelAssignments: Partial<Record<AiEditorTask, AiModelAssignment>>
  /** Preferred RSS / source ids (extend existing SOURCES) */
  preferredSourceIds: string[]
  allowedSourceIds: string[]
  version: number
  createdAt: number
  updatedAt: number
  joinDate: number
  lastActiveAt: number | null
  createdBy: string | null
}

export interface AiEditorPromptDocument {
  id: string
  editorId: string
  promptType: AiPromptType
  version: number
  content: string
  previousVersion: number | null
  changedBy: string | null
  changedAt: number
  changeReason: string | null
  isActive: boolean
}

export interface AiModelRegistryEntry {
  id: string
  provider: AiProviderId
  modelId: string
  label: string
  enabled: boolean
  isDefault?: boolean
  tasks?: AiEditorTask[]
  /** Optional USD per 1M tokens — configurable, not hard-coded in business logic */
  inputPricePer1M?: number
  outputPricePer1M?: number
  updatedAt: number
}

export interface AiUsageEvent {
  id?: string
  editorId: string | null
  task: AiEditorTask | string
  provider: AiProviderId
  model: string
  inputTokens?: number
  outputTokens?: number
  estimatedCostUsd?: number
  durationMs?: number
  published: boolean
  timestamp: number
}

export const DEFAULT_AI_CAPABILITIES: AiEditorCapabilities = {
  newsEnabled: true,
  columnEnabled: true,
  analysisEnabled: true,
  videoEnabled: false,
  seoEnabled: true,
  breakingEnabled: false,
  selfReviewEnabled: true,
  secondReviewEnabled: false,
  factCheckEnabled: true,
  memoryEnabled: false,
}

export function syntheticAiAuthorUid(slug: string): string {
  const safe = slug
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `ai_editor_${safe}`
}

export function promptDocId(editorId: string, promptType: AiPromptType, version: number): string {
  return `${editorId}__${promptType}__v${version}`
}
