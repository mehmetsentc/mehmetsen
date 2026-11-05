/**
 * Social engagement on NaHaber (pure, browser-safe).
 *
 * The counts and comments of a NaHaber post that was shared to Facebook,
 * Instagram, Threads or YouTube are read back from the platform's official
 * API and shown next to the same news item / video on NaHaber.
 *
 * Storage (Admin SDK only, never read by the browser directly):
 *   socialEngagementQueue/{ledgerId}  one row per published (news, account, format);
 *                                     refreshed when `nextAt` is due, dropped after 7 days
 *   socialEngagement/{newsId}         per-news summary: per-target counts + totals +
 *                                     the APPROVED comments (max 30) — the only doc the
 *                                     public endpoint reads
 *   socialComments/{platform}_{id}    every fetched comment; `pending` until an editor
 *                                     approves it (moderation first)
 *
 * Cost: the shared 5-minute worker refreshes at most a few due rows per tick
 * (one indexed query returning only due rows); the public endpoint is CDN-cached.
 * No platform data is invented: a metric the platform did not return is absent,
 * never 0.
 */
import type { SocialAccountPlatform, SocialConnectionMethod } from '../accounts/types'

export const ENGAGEMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_APPROVED_COMMENTS = 30
export const MAX_KNOWN_COMMENT_IDS = 200
export const COMMENTS_PER_FETCH = 50
export const COMMENT_TEXT_MAX = 1000

export type EngagementMetricKey = 'views' | 'likes' | 'comments' | 'shares'
export type EngagementMetrics = Partial<Record<EngagementMetricKey, number>>

/** Why a target has no (or partial) data. */
export type EngagementTargetState =
  | 'ok'
  | 'partial' // counts read, some metrics need a permission the account has not granted
  | 'permission_missing'
  | 'account_unavailable'
  | 'post_unavailable'
  | 'error'

export interface EngagementTarget {
  platform: SocialAccountPlatform
  accountId: string
  accountName: string | null
  format: string
  externalPostId: string
  permalink: string | null
  metrics: EngagementMetrics
  state: EngagementTargetState
  /** Permissions that would unlock more data (e.g. views, comment texts). */
  missing: string[]
  fetchedAt: number
  commentIds: string[]
}

export interface PublicSocialComment {
  id: string
  platform: SocialAccountPlatform
  author: string | null
  text: string
  createdAt: number | null
  permalink: string | null
}

export interface EngagementDoc {
  newsId: string
  slug: string | null
  updatedAt: number
  targets: Record<string, EngagementTarget>
  totals: EngagementMetrics
  approvedComments: PublicSocialComment[]
}

export interface PublicEngagement {
  totals: EngagementMetrics
  platforms: Array<{ platform: SocialAccountPlatform; accountName: string | null; permalink: string | null; metrics: EngagementMetrics; format: string }>
  comments: PublicSocialComment[]
  updatedAt: number
}

/**
 * Optional permissions that unlock engagement data. They are NEVER part of the
 * publish requirement: an account without them keeps publishing exactly as before.
 */
export const ENGAGEMENT_SCOPES: Partial<Record<SocialConnectionMethod, { insights: string[]; comments: string[] }>> = {
  instagram_login: { insights: ['instagram_business_manage_insights'], comments: ['instagram_business_manage_comments'] },
  facebook_login: { insights: [], comments: ['pages_read_user_content'] },
  threads_oauth: { insights: ['threads_manage_insights'], comments: ['threads_read_replies'] },
}

/** Instagram connected through Facebook Login uses the FB-Login permission names. */
export function engagementScopesFor(platform: SocialAccountPlatform, method: SocialConnectionMethod): { insights: string[]; comments: string[] } {
  if (platform === 'instagram' && method === 'facebook_login') return { insights: ['instagram_manage_insights'], comments: ['instagram_manage_comments'] }
  if (platform === 'youtube') return { insights: [], comments: [] } // youtube.readonly already covers statistics + comment threads
  return ENGAGEMENT_SCOPES[method] ?? { insights: [], comments: [] }
}

export function allEngagementScopes(platform: SocialAccountPlatform, method: SocialConnectionMethod): string[] {
  const s = engagementScopesFor(platform, method)
  return [...s.insights, ...s.comments]
}

/**
 * Granted? `null` grantedPermissions (legacy / unverified) → unknown: the call
 * is attempted and a permission error is reported honestly.
 */
export function scopeState(granted: readonly string[] | null | undefined, needed: readonly string[]): 'granted' | 'missing' | 'unknown' {
  if (needed.length === 0) return 'granted'
  if (!granted) return 'unknown'
  return needed.every((p) => granted.includes(p)) ? 'granted' : 'missing'
}

/** Formats whose engagement is meaningful and readable (stories expire in 24 h). */
export function isEngagementFormat(format: string): boolean {
  return format === 'post' || format === 'reel'
}

/**
 * Refresh cadence by post age — fresh posts more often, older posts rarely:
 *   < 6 h → 30 min · < 48 h → 2 h · < 7 days → 12 h · afterwards: no refresh (null).
 */
export function nextRefreshAt(publishedAt: number, now: number): number | null {
  const age = now - publishedAt
  if (age >= ENGAGEMENT_WINDOW_MS) return null
  const step = age < 6 * 3600_000 ? 30 * 60_000 : age < 48 * 3600_000 ? 2 * 3600_000 : 12 * 3600_000
  return Math.min(now + step, publishedAt + ENGAGEMENT_WINDOW_MS)
}

export function sumMetrics(targets: Iterable<Pick<EngagementTarget, 'metrics'>>): EngagementMetrics {
  const out: EngagementMetrics = {}
  for (const t of targets) {
    for (const k of ['views', 'likes', 'comments', 'shares'] as const) {
      const v = t.metrics[k]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = (out[k] ?? 0) + v
    }
  }
  return out
}

/** Platform number → non-negative integer, or undefined when absent / malformed (never 0 by default). */
export function count(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : NaN
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined
}

/** Plain text only: no control characters, bounded length. Rendering escapes it (no HTML). */
export function cleanCommentText(v: unknown): string {
  if (typeof v !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '').trim()
  return t.length > COMMENT_TEXT_MAX ? `${t.slice(0, COMMENT_TEXT_MAX - 1)}…` : t
}

export function cleanAuthor(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = cleanCommentText(v).replace(/^@/, '').slice(0, 80)
  return t || null
}

export function commentDocId(platform: SocialAccountPlatform, commentId: string): string {
  return `${platform}_${commentId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120)}`
}

export function toPublicEngagement(d: EngagementDoc): PublicEngagement {
  const targets = Object.values(d.targets ?? {}).filter((t) => Object.keys(t.metrics ?? {}).length > 0 || t.permalink)
  return {
    totals: d.totals ?? {},
    platforms: targets.map((t) => ({ platform: t.platform, accountName: t.accountName, permalink: t.permalink, metrics: t.metrics ?? {}, format: t.format })),
    comments: (d.approvedComments ?? []).slice(0, MAX_APPROVED_COMMENTS),
    updatedAt: d.updatedAt,
  }
}

export interface EngagementQueueRow {
  ledgerId: string
  newsId: string
  accountId: string
  platform: SocialAccountPlatform
  format: string
  externalPostId: string
  publishedAt: number
  nextAt: number
  failures: number
}

/** Queue row for a verified publish, or null when the format / id is not trackable. */
export function engagementQueueRow(
  ledgerId: string,
  rec: { newsId: string; accountId: string; platform: SocialAccountPlatform; format: string },
  externalPostId: string | null,
  publishedAt: number,
  now: number,
): EngagementQueueRow | null {
  if (!externalPostId || !isEngagementFormat(rec.format)) return null
  if (now - publishedAt >= ENGAGEMENT_WINDOW_MS) return null
  // First read 30 minutes after publishing: platforms need a moment to count.
  return { ledgerId, newsId: rec.newsId, accountId: rec.accountId, platform: rec.platform, format: rec.format, externalPostId, publishedAt, nextAt: Math.max(now, publishedAt + 30 * 60_000), failures: 0 }
}

export const PLATFORM_TR: Record<SocialAccountPlatform, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', youtube: 'YouTube' }

export function formatCountTr(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.', ',')} Mn`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace('.', ',')} B`
  return String(n)
}
