/**
 * NaHaber Enterprise CMS — Types & Role System
 * Roles: super_admin > managing_editor > editor > author | video_editor
 */

// ─── Roles ────────────────────────────────────────────────────────────────────

export type CmsRole =
  | 'super_admin'       // Full access. Locked to mehmetsentc@gmail.com
  | 'managing_editor'   // Full editorial access, cannot delete system config
  | 'editor'            // Can edit/publish, cannot manage users
  | 'author'            // Can create/edit own content, cannot publish
  | 'video_editor'      // Can manage videos, cannot edit news
  | 'user'              // Public user, no CMS access

export const CMS_ROLE_LABELS: Record<CmsRole, string> = {
  super_admin: 'Süper Admin',
  managing_editor: 'Genel Yayın Yönetmeni',
  editor: 'Editör',
  author: 'Yazar',
  video_editor: 'Video Editörü',
  user: 'Kullanıcı',
}

export const CMS_ROLE_COLORS: Record<CmsRole, string> = {
  super_admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  managing_editor: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  editor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  author: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  video_editor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  user: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

/** Roles that have any CMS access */
export const CMS_STAFF_ROLES: CmsRole[] = [
  'super_admin',
  'managing_editor',
  'editor',
  'author',
  'video_editor',
]

/** Role hierarchy level — higher = more access */
export const ROLE_LEVEL: Record<CmsRole, number> = {
  super_admin: 100,
  managing_editor: 80,
  editor: 60,
  author: 40,
  video_editor: 40,
  user: 0,
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export type CmsPermission =
  // News
  | 'news:read'
  | 'news:create'
  | 'news:edit'
  | 'news:edit_own'
  | 'news:delete'
  | 'news:publish'
  | 'news:bulk_action'
  // Videos
  | 'video:read'
  | 'video:create'
  | 'video:edit'
  | 'video:delete'
  | 'video:publish'
  // Users
  | 'users:read'
  | 'users:create'
  | 'users:edit'
  | 'users:delete'
  | 'users:ban'
  | 'users:assign_role'
  // Authors / Editors
  | 'authors:read'
  | 'authors:create'
  | 'authors:edit'
  | 'editors:read'
  | 'editors:manage'
  // SEO
  | 'seo:read'
  | 'seo:edit'
  // Analytics
  | 'analytics:read'
  | 'analytics:export'
  // Cron / System
  | 'cron:read'
  | 'cron:trigger'
  | 'system:settings'
  | 'system:api_keys'
  // AI
  | 'ai:use'
  | 'ai:configure'
  | 'ai:instructions'
  | 'ai:models'
  | 'agents:manage'
  | 'agents:delegate'
  // Social / SMM
  | 'social:view'
  | 'social:publish'
  | 'social:manage'
  // Locations / pages / algorithm
  | 'locations:manage'
  | 'pages:manage'
  | 'algorithm:view'
  | 'algorithm:manage'
  | 'logs:view'
  | 'roles:manage'

export const ROLE_PERMISSIONS: Record<CmsRole, CmsPermission[]> = {
  super_admin: [
    'news:read','news:create','news:edit','news:edit_own','news:delete','news:publish','news:bulk_action',
    'video:read','video:create','video:edit','video:delete','video:publish',
    'users:read','users:create','users:edit','users:delete','users:ban','users:assign_role',
    'authors:read','authors:create','authors:edit',
    'editors:read','editors:manage',
    'seo:read','seo:edit',
    'analytics:read','analytics:export',
    'cron:read','cron:trigger',
    'system:settings','system:api_keys',
    'ai:use','ai:configure','ai:instructions','ai:models','agents:manage','agents:delegate',
    'social:view','social:publish','social:manage',
    'locations:manage','pages:manage','algorithm:view','algorithm:manage','logs:view','roles:manage',
  ],
  managing_editor: [
    'news:read','news:create','news:edit','news:edit_own','news:delete','news:publish','news:bulk_action',
    'video:read','video:create','video:edit','video:delete','video:publish',
    'users:read','users:ban',
    'authors:read','authors:create','authors:edit',
    'editors:read',
    'seo:read','seo:edit',
    'analytics:read','analytics:export',
    'cron:read','cron:trigger',
    // Data-maintenance tools (publishedAt backfill, timestamp migrate) — not API keys.
    'system:settings',
    'ai:use','ai:instructions','ai:models','agents:manage','agents:delegate',
    'social:view','social:publish',
    'locations:manage','pages:manage','algorithm:view','logs:view',
  ],
  editor: [
    'news:read','news:create','news:edit','news:edit_own','news:publish','news:bulk_action',
    'video:read','video:edit',
    'users:read',
    'authors:read',
    'seo:read','seo:edit',
    'analytics:read',
    'cron:read',
    'ai:use',
    'social:view',
    'algorithm:view',
  ],
  author: [
    'news:read','news:create','news:edit_own',
    'video:read',
    'seo:read',
    'analytics:read',
    'ai:use',
  ],
  video_editor: [
    'news:read',
    'video:read','video:create','video:edit','video:delete','video:publish',
    'analytics:read',
    'ai:use',
  ],
  user: [],
}

export function hasPermission(role: CmsRole, permission: CmsPermission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function hasAnyPermission(role: CmsRole, permissions: CmsPermission[]): boolean {
  return permissions.some(p => hasPermission(role, p))
}

// ─── CMS User (extended User) ──────────────────────────────────────────────────

export interface CmsUser {
  uid: string
  email: string
  displayName: string
  photoURL: string | null
  cmsRole: CmsRole
  isActive: boolean
  department?: string
  bio?: string
  articlesCount?: number
  lastActiveAt?: string
  createdAt: string
}

// ─── News Draft / Article Status ──────────────────────────────────────────────

export type ArticleStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'published'
  | 'scheduled'
  | 'rejected'
  | 'archived'

export const ARTICLE_STATUS_LABELS: Record<ArticleStatus, string> = {
  draft: 'Taslak',
  in_review: 'İncelemede',
  approved: 'Onaylandı',
  published: 'Yayında',
  scheduled: 'Zamanlandı',
  rejected: 'Reddedildi',
  archived: 'Arşivlendi',
}

export const ARTICLE_STATUS_COLORS: Record<ArticleStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  in_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  published: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  scheduled: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  archived: 'bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-500',
}

// ─── Cron Job ─────────────────────────────────────────────────────────────────

export interface CronJobStatus {
  id: string
  name: string
  nameTr: string
  schedule: string
  cronPath: string
  lastRunAt: string | null
  lastRunStatus: 'success' | 'error' | 'running' | 'never'
  lastRunDurationMs: number | null
  nextRunAt: string | null
  articlesGenerated?: number
  errorMessage?: string
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsSnapshot {
  date: string
  pageviews: number
  uniqueVisitors: number
  articlesPublished: number
  videoViews: number
  avgReadingTime: number
}

export interface CategoryPerformance {
  categoryId: string
  label: string
  articlesCount: number
  totalViews: number
  avgConfidence: number
}

// ─── API Key ──────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string
  name: string
  keyPreview: string   // last 4 chars shown
  service: 'openai' | 'weatherapi' | 'firebase' | 'custom'
  isActive: boolean
  lastUsedAt: string | null
  createdAt: string
  createdBy: string
}

// ─── Notification ─────────────────────────────────────────────────────────────

export interface CmsNotification {
  id: string
  type: 'article_submitted' | 'article_approved' | 'article_rejected' | 'cron_error' | 'user_reported' | 'breaking_news' | 'approval' | 'factCheck' | 'agentError' | 'socialFailure' | 'tokenExpiry' | 'systemError' | 'algorithmProposal' | 'learningProposal' | 'assignment' | 'mention'
  title: string
  message: string
  href?: string
  isRead: boolean
  createdAt: string
}
