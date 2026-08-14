/**
 * NaHaber CMS — AI Newsroom OS foundation types.
 * Additive layer on top of existing CmsRole / newsroom pipeline.
 */

import type { CmsPermission } from '@/types/cms'

// ─── Feature flags ────────────────────────────────────────────────────────────

export type CmsFeatureFlagKey =
  | 'aiNewsroomEnabled'
  | 'learningEngineEnabled'
  | 'algorithmAgentEnabled'
  | 'socialAutomationEnabled'
  | 'autoPublishEnabled'
  | 'pageBuilderEnabled'
  | 'scopedRbacEnabled'
  | 'smmNetworkEnabled'

export type CmsFeatureFlags = Record<CmsFeatureFlagKey, boolean>

export const DEFAULT_CMS_FEATURE_FLAGS: CmsFeatureFlags = {
  aiNewsroomEnabled: true,
  learningEngineEnabled: false,
  algorithmAgentEnabled: false,
  socialAutomationEnabled: true,
  autoPublishEnabled: false,
  pageBuilderEnabled: false,
  scopedRbacEnabled: true,
  smmNetworkEnabled: true,
}

// ─── Permission scopes ────────────────────────────────────────────────────────

export type PermissionScopeKind = 'GLOBAL' | 'country' | 'city' | 'district' | 'category'

export interface PermissionScope {
  kind: PermissionScopeKind
  /** Province slug (e.g. canakkale) when kind=city */
  citySlug?: string
  districtSlug?: string
  countryCode?: string
  categoryId?: string
}

export interface ScopedPermissionGrant {
  permission: CmsPermission
  scopes: PermissionScope[]
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export type AgentStatus = 'active' | 'paused' | 'disabled' | 'error'
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4

export type AgentDepartmentId =
  | 'executive'
  | 'newsroom'
  | 'desk-gundem'
  | 'desk-local'
  | 'desk-sports'
  | 'desk-economy'
  | 'writing'
  | 'digital'
  | 'social'
  | 'algorithm'
  | 'learning'

export type AgentRoleTemplateId =
  | 'editor-in-chief'
  | 'deputy-editor'
  | 'news-director'
  | 'desk-editor'
  | 'local-editor'
  | 'reporter'
  | 'writer'
  | 'fact-checker'
  | 'quality-controller'
  | 'legal-risk'
  | 'seo-editor'
  | 'visual-editor'
  | 'social-director'
  | 'city-smm'
  | 'algorithm-analyst'
  | 'learning-analyst'
  | 'publisher'

export interface AgentModelConfig {
  primaryProvider: 'deepseek' | 'gemini' | 'openai' | 'anthropic' | 'meta'
  primaryModel: string
  fallbackProvider?: AgentModelConfig['primaryProvider']
  fallbackModel?: string
  temperature?: number
  maxTokens?: number
  reasoningMode?: boolean
  webAccess?: boolean
  memoryEnabled?: boolean
  factCheckRequired?: boolean
  humanApprovalThreshold?: number
  dailyTokenLimit?: number
  dailyCostLimitUsd?: number
  timeoutMs?: number
  retryCount?: number
}

export interface NewsroomAgent {
  id: string
  name: string
  displayName: string
  avatar?: string | null
  description?: string
  roleTemplateId: AgentRoleTemplateId
  departmentId: AgentDepartmentId
  managerAgentId?: string | null
  managerHumanId?: string | null
  subordinateAgentIds: string[]
  status: AgentStatus
  autonomyLevel: AutonomyLevel
  permissions: CmsPermission[]
  allowedAgentIds: string[]
  territories: string[]
  categories: string[]
  languages: string[]
  modelConfig: AgentModelConfig
  tools: string[]
  customInstructions?: string
  /** Links to existing AI editor persona when migrated */
  legacyAiEditorId?: string | null
  costLimits?: { dailyUsd?: number; monthlyUsd?: number }
  createdAt: number
  updatedAt: number
}

/** Server-only runtime context — never accept from client. */
export interface AgentRuntimeContext {
  agent: NewsroomAgent
  roleLabel: string
  departmentLabel: string
  manager?: Pick<NewsroomAgent, 'id' | 'displayName' | 'roleTemplateId'> | null
  subordinates: Array<Pick<NewsroomAgent, 'id' | 'displayName' | 'roleTemplateId' | 'status'>>
  canCommunicateWith: string[]
  allowedTaskTypes: string[]
  deniedTaskTypes: string[]
  escalationRules: string[]
  reportResultToAgentId?: string | null
  effectiveInstructionVersionIds: string[]
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export type AgentTaskStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRYING'
  | 'NEEDS_HUMAN'

export type AgentTaskType =
  | 'NEWS_INGEST'
  | 'NEWS_DETECTION'
  | 'NEWS_VALUE'
  | 'AI_RESEARCH'
  | 'AI_WRITE'
  | 'CATEGORY_EDIT'
  | 'FACT_CHECK'
  | 'QUALITY_CHECK'
  | 'LEGAL_RISK'
  | 'SEO'
  | 'VISUAL'
  | 'EDITORIAL_APPROVAL'
  | 'PUBLISH'
  | 'SOCIAL_GENERATE'
  | 'SOCIAL_PUBLISH'
  | 'ANALYTICS_SYNC'
  | 'LEARNING_ANALYSIS'
  | 'ALGORITHM_ANALYSIS'

export interface AgentTask {
  id: string
  type: AgentTaskType
  newsId?: string | null
  createdByAgentId?: string | null
  createdByHumanId?: string | null
  assignedAgentId?: string | null
  assignedHumanId?: string | null
  priority: 'low' | 'normal' | 'high' | 'critical'
  status: AgentTaskStatus
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  evidence?: unknown[]
  confidence?: number | null
  parentTaskId?: string | null
  errorMessage?: string | null
  startedAt?: number | null
  completedAt?: number | null
  createdAt: number
  updatedAt: number
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export type AuditActorType = 'HUMAN' | 'AI' | 'SYSTEM'

export interface AuditLogEntry {
  id: string
  actorType: AuditActorType
  actorId: string
  actorLabel: string
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  newsId?: string | null
  agentTaskId?: string | null
  ip?: string | null
  userAgent?: string | null
  createdAt: number
}

// ─── Learning / algorithm proposals ───────────────────────────────────────────

export type ProposalStatus = 'PROPOSED' | 'TESTING' | 'APPROVED' | 'REJECTED' | 'DEPLOYED'

export interface RuleProposal {
  id: string
  kind: 'editorial_rule' | 'algorithm_weight' | 'smm_matrix'
  title: string
  summary: string
  status: ProposalStatus
  evidence?: Record<string, unknown>
  proposedByAgentId?: string | null
  reviewedByHumanId?: string | null
  createdAt: number
  updatedAt: number
}

// ─── Location / SMM ───────────────────────────────────────────────────────────

export type LocationNodeKind = 'country' | 'city' | 'district' | 'town'

export interface LocationNode {
  id: string
  kind: LocationNodeKind
  name: string
  slug: string
  parentId?: string | null
  active: boolean
  lat?: number
  lng?: number
}

export type SocialPlatform = 'instagram' | 'facebook' | 'x' | 'tiktok' | 'youtube' | 'threads'

export type SocialAccountHealth = 'healthy' | 'warning' | 'error' | 'disconnected'

export interface SocialAccountRef {
  id: string
  citySlug: string
  platform: SocialPlatform
  username: string
  externalAccountId?: string | null
  status: 'active' | 'paused' | 'disabled'
  connected: boolean
  /** Reference into integrations/vault — never raw token */
  tokenReference?: string | null
  health: SocialAccountHealth
  lastSyncAt?: number | null
  lastPublishAt?: number | null
}

export type SmmMatrixPriority = 'HIGH' | 'MEDIUM' | 'LOW' | 'OFF'

export interface CitySmmMatrixRule {
  match: { categoryId?: string; citySlug?: string; isBreaking?: boolean }
  priority: SmmMatrixPriority
}

/** Per-city CMS ops — SEO, feed, push, ads, linked agents/accounts */
export interface CityOpsSettings {
  citySlug: string
  active: boolean
  localEditorHumanId?: string | null
  localAiEditorId?: string | null
  smmAgentId?: string | null
  seoTitle?: string | null
  seoDescription?: string | null
  feedEnabled: boolean
  pushSegment?: string | null
  adSlotIds: string[]
  socialAccountIds: string[]
  matrixRules: CitySmmMatrixRule[]
  updatedAt: number
  updatedBy?: string | null
}

export type PageLayoutStatus = 'draft' | 'preview' | 'published' | 'archived'

export type PageBlockKind =
  | 'manchet'
  | 'breaking'
  | 'featured'
  | 'category_rail'
  | 'local'
  | 'video'
  | 'reels'
  | 'custom'

export interface PageLayoutBlock {
  id: string
  kind: PageBlockKind
  title: string
  active: boolean
  order: number
  categoryId?: string | null
  citySlug?: string | null
  limit: number
  source: 'algorithmic' | 'manual'
  desktopVisible: boolean
  mobileVisible: boolean
}

export interface PageLayout {
  id: string
  pageKey: string
  label: string
  status: PageLayoutStatus
  version: number
  blocks: PageLayoutBlock[]
  updatedAt: number
  updatedBy?: string | null
  publishedAt?: number | null
}

export interface FeedAlgorithmWeights {
  id: string
  version: number
  status: 'draft' | 'active' | 'archived'
  weights: {
    recency: number
    userInterest: number
    locationAffinity: number
    categoryAffinity: number
    trend: number
    editorialPriority: number
    sourceReliability: number
    contentQuality: number
    diversity: number
    breakingPriority: number
    spamPenalty: number
    duplicatePenalty: number
  }
  updatedAt: number
}

export const DEFAULT_FEED_ALGORITHM_WEIGHTS: FeedAlgorithmWeights['weights'] = {
  recency: 0.22,
  userInterest: 0.14,
  locationAffinity: 0.12,
  categoryAffinity: 0.1,
  trend: 0.1,
  editorialPriority: 0.08,
  sourceReliability: 0.06,
  contentQuality: 0.06,
  diversity: 0.05,
  breakingPriority: 0.12,
  spamPenalty: 0.15,
  duplicatePenalty: 0.15,
}

export interface EditorialMemoryRecord {
  id: string
  scope: 'agent' | 'shared'
  agentId?: string | null
  type:
    | 'style'
    | 'entity'
    | 'location'
    | 'organization'
    | 'editorialRule'
    | 'correction'
    | 'sourceReliability'
    | 'historicalContext'
    | 'performanceInsight'
  content: string
  source?: string | null
  confidence: number
  verified: boolean
  verifiedBy?: string | null
  expiresAt?: number | null
  createdAt: number
  lastUsedAt?: number | null
}
