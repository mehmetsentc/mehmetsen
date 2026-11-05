/**
 * Read-only engagement fetchers (server only). Each call uses the target
 * account's own token, resolved by the shared publish-target resolver. Nothing
 * is posted; tokens never appear in logs (metaRequest logs step + codes only).
 *
 * Permissions (official docs):
 *   Facebook Page post: reactions / comments summary / shares — pages_read_engagement
 *                       comment texts — pages_read_user_content (optional)
 *   Instagram (Instagram Login): like_count / comments_count — instagram_business_basic
 *                       views / shares — instagram_business_manage_insights (optional)
 *                       comment texts — instagram_business_manage_comments (optional)
 *   Threads: views / likes / replies / reposts / quotes / shares — threads_manage_insights (optional)
 *            reply texts — threads_read_replies (optional)
 *   YouTube: statistics + comment threads — youtube.readonly (already granted)
 */
import 'server-only'
import { metaRequest, query, type MetaErrorInfo } from '../accounts/connect/metaHttp'
import type { PublishTarget } from '../accounts/targetTypes'
import type { SocialAccount } from '../accounts/types'
import {
  cleanAuthor,
  cleanCommentText,
  COMMENTS_PER_FETCH,
  count,
  engagementScopesFor,
  scopeState,
  type EngagementMetrics,
  type EngagementTargetState,
} from './model'

export interface RawComment {
  id: string
  author: string | null
  text: string
  createdAt: number | null
}

export interface FetchOutcome {
  metrics: EngagementMetrics
  permalink: string | null
  /** null = comment texts not read (permission missing / error). */
  comments: RawComment[] | null
  /** true when the list is the full set of current comments (enables removal sync). */
  commentsComplete: boolean
  state: EngagementTargetState
  missing: string[]
  code: string | null
}

const isTokenError = (e: MetaErrorInfo) => e.code === 190 || e.code === 102
const isPermissionError = (e: MetaErrorInfo) => e.code === 10 || e.code === 3 || (e.code !== null && e.code >= 200 && e.code <= 299)
const isGoneError = (e: MetaErrorInfo) => e.code === 100 && (e.subcode === 33 || e.status === 404)

function failState(e: MetaErrorInfo): EngagementTargetState {
  if (isTokenError(e)) return 'account_unavailable'
  if (isPermissionError(e)) return 'permission_missing'
  if (isGoneError(e)) return 'post_unavailable'
  return 'error'
}
function errCode(e: MetaErrorInfo): string {
  return `meta_${e.status}_${e.code ?? '-'}${e.subcode !== null ? `_${e.subcode}` : ''}`
}
function time(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null
}

type InsightRow = { name?: string; values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } }
function insightValues(rows: InsightRow[] | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows ?? []) {
    const v = count(r.total_value?.value ?? r.values?.[0]?.value)
    if (r.name && v !== undefined) out[r.name] = v
  }
  return out
}

function settle(metrics: EngagementMetrics, missing: string[], hardFail: EngagementTargetState | null): EngagementTargetState {
  if (hardFail) return hardFail
  if (Object.keys(metrics).length === 0) return missing.length ? 'permission_missing' : 'error'
  return missing.length ? 'partial' : 'ok'
}

// ── Facebook Page post ───────────────────────────────────────────────────────

async function facebook(t: Extract<PublishTarget, { platform: 'facebook' }>, account: SocialAccount, postId: string): Promise<FetchOutcome> {
  const scopes = engagementScopesFor('facebook', account.connectionMethod)
  const base = `${t.apiBase}/${encodeURIComponent(postId)}`
  const summary = 'reactions.summary(total_count).limit(0),comments.summary(true).limit(0)'
  let r = await metaRequest<Record<string, unknown>>('engagement.fb_post', query(base, { fields: `${summary},shares,permalink_url`, access_token: t.accessToken }))
  // Photo / video objects have no `shares` field → retry without it.
  if (!r.ok && r.error.code === 100 && !isGoneError(r.error)) {
    r = await metaRequest<Record<string, unknown>>('engagement.fb_post_basic', query(base, { fields: `${summary},permalink_url`, access_token: t.accessToken }))
  }
  if (!r.ok) return { metrics: {}, permalink: null, comments: null, commentsComplete: false, state: failState(r.error), missing: [], code: errCode(r.error) }
  const d = r.data as { reactions?: { summary?: { total_count?: unknown } }; comments?: { summary?: { total_count?: unknown } }; shares?: { count?: unknown }; permalink_url?: unknown }
  const metrics: EngagementMetrics = {}
  const likes = count(d.reactions?.summary?.total_count)
  const comments = count(d.comments?.summary?.total_count)
  const shares = count(d.shares?.count)
  if (likes !== undefined) metrics.likes = likes
  if (comments !== undefined) metrics.comments = comments
  if (shares !== undefined) metrics.shares = shares
  const missing: string[] = []
  let list: RawComment[] | null = null
  let complete = false
  if (scopeState(account.grantedPermissions, scopes.comments) === 'missing') missing.push(...scopes.comments)
  else {
    const c = await metaRequest<{ data?: Array<Record<string, unknown>> ; paging?: { next?: string } }>(
      'engagement.fb_comments',
      query(`${base}/comments`, { fields: 'id,message,created_time,from{name}', filter: 'toplevel', order: 'reverse_chronological', limit: String(COMMENTS_PER_FETCH), access_token: t.accessToken }),
    )
    if (c.ok) {
      list = (c.data.data ?? []).flatMap((x) => {
        const id = str(x.id)
        const text = cleanCommentText(x.message)
        return id && text ? [{ id, author: cleanAuthor((x.from as { name?: unknown } | undefined)?.name), text, createdAt: time(x.created_time) }] : []
      })
      complete = !c.data.paging?.next
    } else if (isPermissionError(c.error)) missing.push(...(scopes.comments.length ? scopes.comments : ['pages_read_user_content']))
  }
  return { metrics, permalink: str(d.permalink_url), comments: list, commentsComplete: complete, state: settle(metrics, missing, null), missing, code: null }
}

// ── Instagram media ──────────────────────────────────────────────────────────

async function instagram(t: Extract<PublishTarget, { platform: 'instagram' }>, account: SocialAccount, mediaId: string): Promise<FetchOutcome> {
  const scopes = engagementScopesFor('instagram', account.connectionMethod)
  const base = `${t.apiBase}/${encodeURIComponent(mediaId)}`
  const r = await metaRequest<Record<string, unknown>>('engagement.ig_media', query(base, { fields: 'like_count,comments_count,permalink', access_token: t.accessToken }))
  if (!r.ok) return { metrics: {}, permalink: null, comments: null, commentsComplete: false, state: failState(r.error), missing: [], code: errCode(r.error) }
  const metrics: EngagementMetrics = {}
  const likes = count(r.data.like_count) // absent when the owner hides like counts
  const comments = count(r.data.comments_count)
  if (likes !== undefined) metrics.likes = likes
  if (comments !== undefined) metrics.comments = comments
  const missing: string[] = []

  if (scopeState(account.grantedPermissions, scopes.insights) === 'missing') missing.push(...scopes.insights)
  else {
    let ins = await metaRequest<{ data?: InsightRow[] }>('engagement.ig_insights', query(`${base}/insights`, { metric: 'views,shares', access_token: t.accessToken }))
    if (!ins.ok && ins.error.code === 100) ins = await metaRequest<{ data?: InsightRow[] }>('engagement.ig_insights_views', query(`${base}/insights`, { metric: 'views', access_token: t.accessToken }))
    if (ins.ok) {
      const v = insightValues(ins.data.data)
      if (v.views !== undefined) metrics.views = v.views
      if (v.shares !== undefined) metrics.shares = v.shares
    } else if (isPermissionError(ins.error)) missing.push(...scopes.insights)
  }

  let list: RawComment[] | null = null
  let complete = false
  if (scopeState(account.grantedPermissions, scopes.comments) === 'missing') missing.push(...scopes.comments)
  else {
    const c = await metaRequest<{ data?: Array<Record<string, unknown>>; paging?: { next?: string } }>(
      'engagement.ig_comments',
      query(`${base}/comments`, { fields: 'id,text,timestamp,username', limit: String(COMMENTS_PER_FETCH), access_token: t.accessToken }),
    )
    if (c.ok) {
      list = (c.data.data ?? []).flatMap((x) => {
        const id = str(x.id)
        const text = cleanCommentText(x.text)
        return id && text ? [{ id, author: cleanAuthor(x.username), text, createdAt: time(x.timestamp) }] : []
      })
      complete = !c.data.paging?.next
    } else if (isPermissionError(c.error)) missing.push(...scopes.comments)
  }
  return { metrics, permalink: str(r.data.permalink), comments: list, commentsComplete: complete, state: settle(metrics, missing, null), missing, code: null }
}

// ── Threads post ─────────────────────────────────────────────────────────────

async function threads(t: Extract<PublishTarget, { platform: 'threads' }>, account: SocialAccount, mediaId: string): Promise<FetchOutcome> {
  const scopes = engagementScopesFor('threads', account.connectionMethod)
  const base = `${t.apiBase}/${encodeURIComponent(mediaId)}`
  const p = await metaRequest<{ permalink?: unknown }>('engagement.th_media', query(base, { fields: 'permalink', access_token: t.accessToken }))
  if (!p.ok && (isTokenError(p.error) || isGoneError(p.error))) {
    return { metrics: {}, permalink: null, comments: null, commentsComplete: false, state: failState(p.error), missing: [], code: errCode(p.error) }
  }
  const permalink = p.ok ? str(p.data.permalink) : null
  const metrics: EngagementMetrics = {}
  const missing: string[] = []
  if (scopeState(account.grantedPermissions, scopes.insights) === 'missing') missing.push(...scopes.insights)
  else {
    const ins = await metaRequest<{ data?: InsightRow[] }>('engagement.th_insights', query(`${base}/insights`, { metric: 'views,likes,replies,reposts,quotes,shares', access_token: t.accessToken }))
    if (ins.ok) {
      const v = insightValues(ins.data.data)
      if (v.views !== undefined) metrics.views = v.views
      if (v.likes !== undefined) metrics.likes = v.likes
      if (v.replies !== undefined) metrics.comments = v.replies
      // «Paylaşım» on Threads = reposts + quotes + shares (whichever the platform returned).
      const sharedParts = [v.reposts, v.quotes, v.shares].filter((x): x is number => x !== undefined)
      if (sharedParts.length) metrics.shares = sharedParts.reduce((a, b) => a + b, 0)
    } else if (isPermissionError(ins.error)) missing.push(...scopes.insights)
  }
  let list: RawComment[] | null = null
  let complete = false
  if (scopeState(account.grantedPermissions, scopes.comments) === 'missing') missing.push(...scopes.comments)
  else {
    const c = await metaRequest<{ data?: Array<Record<string, unknown>>; paging?: { next?: string; cursors?: { after?: string } } }>(
      'engagement.th_replies',
      query(`${base}/replies`, { fields: 'id,text,timestamp,username', limit: String(COMMENTS_PER_FETCH), access_token: t.accessToken }),
    )
    if (c.ok) {
      list = (c.data.data ?? []).flatMap((x) => {
        const id = str(x.id)
        const text = cleanCommentText(x.text)
        return id && text ? [{ id, author: cleanAuthor(x.username), text, createdAt: time(x.timestamp) }] : []
      })
      complete = !c.data.paging?.next
    } else if (isPermissionError(c.error)) missing.push(...scopes.comments)
  }
  return { metrics, permalink, comments: list, commentsComplete: complete, state: settle(metrics, missing, null), missing, code: null }
}

// ── YouTube video ────────────────────────────────────────────────────────────

async function googleGet<T>(url: string, token: string): Promise<{ ok: true; data: T } | { ok: false; status: number; reason: string | null }> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000), cache: 'no-store' })
    const body = (await res.json().catch(() => null)) as (T & { error?: { errors?: Array<{ reason?: string }> } }) | null
    if (!res.ok || !body) {
      const reason = body?.error?.errors?.[0]?.reason ?? null
      console.warn(`[social-engagement] youtube failed status=${res.status} reason=${reason ?? '-'}`)
      return { ok: false, status: res.status, reason }
    }
    return { ok: true, data: body }
  } catch {
    return { ok: false, status: 0, reason: 'network' }
  }
}

async function youtube(t: Extract<PublishTarget, { platform: 'youtube' }>, videoId: string): Promise<FetchOutcome> {
  const id = encodeURIComponent(videoId)
  const s = await googleGet<{ items?: Array<{ statistics?: Record<string, unknown> }> }>(`${t.apiBase}/videos?part=statistics&id=${id}`, t.accessToken)
  if (!s.ok) {
    const state: EngagementTargetState = s.status === 401 ? 'account_unavailable' : s.status === 403 ? 'permission_missing' : 'error'
    return { metrics: {}, permalink: null, comments: null, commentsComplete: false, state, missing: [], code: `yt_${s.status}_${s.reason ?? '-'}` }
  }
  const stats = s.data.items?.[0]?.statistics
  if (!stats) return { metrics: {}, permalink: null, comments: null, commentsComplete: false, state: 'post_unavailable', missing: [], code: 'yt_not_found' }
  const metrics: EngagementMetrics = {}
  const views = count(stats.viewCount)
  const likes = count(stats.likeCount) // absent when the owner hides likes
  const comments = count(stats.commentCount) // absent when comments are disabled
  if (views !== undefined) metrics.views = views
  if (likes !== undefined) metrics.likes = likes
  if (comments !== undefined) metrics.comments = comments
  let list: RawComment[] | null = null
  let complete = false
  const c = await googleGet<{ items?: Array<{ id?: string; snippet?: { topLevelComment?: { snippet?: Record<string, unknown> } } }>; nextPageToken?: string }>(
    `${t.apiBase}/commentThreads?part=snippet&videoId=${id}&maxResults=${COMMENTS_PER_FETCH}&order=time&textFormat=plainText`,
    t.accessToken,
  )
  if (c.ok) {
    list = (c.data.items ?? []).flatMap((x) => {
      const sn = x.snippet?.topLevelComment?.snippet ?? {}
      const cid = str(x.id)
      const text = cleanCommentText(sn.textOriginal ?? sn.textDisplay)
      return cid && text ? [{ id: cid, author: cleanAuthor(sn.authorDisplayName), text, createdAt: time(sn.publishedAt) }] : []
    })
    complete = !c.data.nextPageToken
  } else if (c.reason === 'commentsDisabled') {
    list = []
    complete = true
  }
  return { metrics, permalink: `https://www.youtube.com/watch?v=${videoId}`, comments: list, commentsComplete: complete, state: settle(metrics, [], null), missing: [], code: null }
}

export async function fetchEngagement(target: PublishTarget, account: SocialAccount, externalPostId: string): Promise<FetchOutcome> {
  switch (target.platform) {
    case 'facebook':
      return facebook(target, account, externalPostId)
    case 'instagram':
      return instagram(target, account, externalPostId)
    case 'threads':
      return threads(target, account, externalPostId)
    case 'youtube':
      return youtube(target, externalPostId)
  }
}
