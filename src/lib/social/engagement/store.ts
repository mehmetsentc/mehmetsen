/**
 * Social engagement storage + refresh (server only). See ./model.ts for the
 * data model and cost notes.
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { loadSocialAccount } from '../accounts/accountStore'
import { resolvePublishTarget } from '../accounts/resolvePublishTarget'
import { writeSocialAudit } from '../accounts/audit'
import { errorLogFields, socialLog } from '../safeLog'
import { fetchEngagement, type FetchOutcome } from './fetchers'
import { ENGAGEMENT, ENGAGEMENT_QUEUE, SOCIAL_COMMENTS } from './collections'
import {
  commentDocId,
  ENGAGEMENT_WINDOW_MS,
  engagementQueueRow,
  MAX_APPROVED_COMMENTS,
  MAX_KNOWN_COMMENT_IDS,
  nextRefreshAt,
  sumMetrics,
  toPublicEngagement,
  type EngagementDoc,
  type EngagementQueueRow,
  type EngagementTarget,
  type PublicEngagement,
  type PublicSocialComment,
} from './model'

export type CommentStatus = 'pending' | 'approved' | 'rejected' | 'removed'

export interface SocialCommentDoc {
  commentId: string
  newsId: string
  ledgerId: string
  platform: EngagementTarget['platform']
  accountId: string
  author: string | null
  text: string
  createdAt: number | null
  fetchedAt: number
  status: CommentStatus
  permalink: string | null
  moderatedBy?: string | null
  moderatedAt?: number | null
  removedAt?: number | null
}

const db = () => getAdminFirestore()
const NEWS_ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const SLUG_RE = /^[a-z0-9ğüşıöç-]{1,200}$/i

export const ENGAGEMENT_PER_TICK = 6
const FAILURE_LIMIT = 6

// ── Refresh (shared worker) ───────────────────────────────────────────────────

export interface EngagementTickReport {
  refreshed: number
  failed: number
  dropped: number
  seeded: number | null
}

/**
 * One-time backfill: posts verified in the last 7 days before this feature
 * shipped get queue rows. One range query on `updatedAt` (single-field index),
 * guarded by a state flag so it never runs twice.
 */
export async function seedEngagementQueueOnce(now: number): Promise<number | null> {
  const stateRef = db().collection(Collections.SOCIAL_AUTOMATION_STATE).doc('engagementSeed')
  const st = await stateRef.get()
  if (st.exists) return null
  const snap = await db().collection(Collections.SOCIAL_PUBLISH_RECORDS).where('updatedAt', '>=', now - ENGAGEMENT_WINDOW_MS).limit(500).get()
  let seeded = 0
  for (const doc of snap.docs) {
    const d = doc.data() as { status?: string; newsId?: string; accountId?: string; platform?: EngagementTarget['platform']; format?: string; externalPostId?: string | null; updatedAt?: number }
    if (d.status !== 'succeeded' || !d.newsId || !d.accountId || !d.platform || !d.format) continue
    const row = engagementQueueRow(doc.id, { newsId: d.newsId, accountId: d.accountId, platform: d.platform, format: d.format }, d.externalPostId ?? null, d.updatedAt ?? now, now)
    if (!row) continue
    // Stagger the first reads so the backlog spreads over a few ticks.
    await db().collection(ENGAGEMENT_QUEUE).doc(doc.id).set({ ...row, nextAt: now + seeded * 60_000 })
    seeded++
  }
  await stateRef.set({ at: now, seeded })
  return seeded
}

/** Refresh due rows only: one indexed query (`nextAt <= now`), bounded count and time. */
export async function refreshDueEngagement(now: () => number, opts: { max?: number; deadline: number }): Promise<EngagementTickReport> {
  const report: EngagementTickReport = { refreshed: 0, failed: 0, dropped: 0, seeded: null }
  const snap = await db().collection(ENGAGEMENT_QUEUE).where('nextAt', '<=', now()).orderBy('nextAt', 'asc').limit(opts.max ?? ENGAGEMENT_PER_TICK).get()
  for (const doc of snap.docs) {
    if (now() > opts.deadline) break
    const row = doc.data() as EngagementQueueRow
    try {
      const r = await refreshOne(row, now())
      if (r === 'dropped') report.dropped++
      else if (r === 'ok') report.refreshed++
      else report.failed++
    } catch (err) {
      report.failed++
      socialLog('error', 'cron', 'engagement_error', { platform: row.platform, ...errorLogFields(err) })
      await doc.ref.set({ ...row, failures: (row.failures ?? 0) + 1, nextAt: now() + 2 * 3600_000 }).catch(() => undefined)
    }
  }
  return report
}

async function refreshOne(row: EngagementQueueRow, now: number): Promise<'ok' | 'failed' | 'dropped'> {
  const queueRef = db().collection(ENGAGEMENT_QUEUE).doc(row.ledgerId)
  const reschedule = async (failed: boolean) => {
    const failures = failed ? (row.failures ?? 0) + 1 : 0
    const next = nextRefreshAt(row.publishedAt, now)
    if (next === null || failures >= FAILURE_LIMIT) {
      await queueRef.delete()
      return true
    }
    await queueRef.set({ ...row, failures, nextAt: failed ? Math.max(next, now + 2 * 3600_000) : next })
    return false
  }

  const loaded = await loadSocialAccount(row.accountId).catch(() => null)
  const resolved = loaded?.state === 'ok' ? await resolvePublishTarget(row.accountId, { expectedPlatform: row.platform, now }) : null
  let outcome: FetchOutcome
  let accountName: string | null = null
  if (!loaded || loaded.state !== 'ok' || !resolved || !resolved.ok) {
    outcome = { metrics: {}, permalink: null, comments: null, commentsComplete: false, state: 'account_unavailable', missing: [], code: resolved && !resolved.ok ? String(resolved.code) : 'account_missing' }
  } else {
    accountName = loaded.account.username ? `@${loaded.account.username}` : loaded.account.displayName
    outcome = await fetchEngagement(resolved.target, loaded.account, row.externalPostId)
  }
  await writeOutcome(row, outcome, accountName, now)
  const failed = outcome.state === 'account_unavailable' || outcome.state === 'error' || outcome.state === 'post_unavailable'
  if (outcome.state === 'post_unavailable') {
    await queueRef.delete() // the post was removed from the platform — stop asking
    return 'dropped'
  }
  const dropped = await reschedule(failed)
  return dropped ? 'dropped' : failed ? 'failed' : 'ok'
}

async function writeOutcome(row: EngagementQueueRow, o: FetchOutcome, accountName: string | null, now: number): Promise<void> {
  const engRef = db().collection(ENGAGEMENT).doc(row.newsId)
  // Slug lets the public page (which may carry a canonical id) find this doc. Read once.
  let slug: string | null | undefined
  const pre = await engRef.get()
  if (!pre.exists || !(pre.data() as EngagementDoc).slug) {
    const news = await db().collection(Collections.NEWS).doc(row.newsId).get().catch(() => null)
    const s = news?.exists ? (news.data() as { slug?: unknown }).slug : null
    slug = typeof s === 'string' && s.trim() ? s.trim() : null
  }

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(engRef)
    const prev: EngagementDoc = snap.exists
      ? (snap.data() as EngagementDoc)
      : { newsId: row.newsId, slug: null, updatedAt: now, targets: {}, totals: {}, approvedComments: [] }
    const before = prev.targets?.[row.ledgerId]
    const known = new Set(before?.commentIds ?? [])
    const fetched = o.comments ?? []
    const fetchedIds = new Set(fetched.map((c) => commentDocId(row.platform, c.id)))
    const newOnes = fetched.filter((c) => !known.has(commentDocId(row.platform, c.id)))
    const removedIds = o.comments && o.commentsComplete ? [...known].filter((id) => !fetchedIds.has(id)) : []

    // All reads before writes (Firestore transactions).
    const newRefs = newOnes.map((c) => db().collection(SOCIAL_COMMENTS).doc(commentDocId(row.platform, c.id)))
    const newSnaps = await Promise.all(newRefs.map((r) => tx.get(r)))
    const removedRefs = removedIds.map((id) => db().collection(SOCIAL_COMMENTS).doc(id))
    const removedSnaps = await Promise.all(removedRefs.map((r) => tx.get(r)))

    const permalink = o.permalink ?? before?.permalink ?? null
    newOnes.forEach((c, i) => {
      if (newSnaps[i].exists) return
      const doc: SocialCommentDoc = {
        commentId: c.id,
        newsId: row.newsId,
        ledgerId: row.ledgerId,
        platform: row.platform,
        accountId: row.accountId,
        author: c.author,
        text: c.text,
        createdAt: c.createdAt,
        fetchedAt: now,
        status: 'pending',
        permalink,
      }
      tx.set(newRefs[i], { ...doc })
    })
    removedSnaps.forEach((s, i) => {
      if (s.exists) tx.update(removedRefs[i], { status: 'removed', removedAt: now })
    })

    const nextKnown = o.comments ? [...new Set([...fetched.map((c) => commentDocId(row.platform, c.id)), ...[...known].filter((id) => !removedIds.includes(id))])].slice(0, MAX_KNOWN_COMMENT_IDS) : [...known]
    const target: EngagementTarget = {
      platform: row.platform,
      accountId: row.accountId,
      accountName: accountName ?? before?.accountName ?? null,
      format: row.format,
      externalPostId: row.externalPostId,
      permalink,
      // A failed read keeps the last good counts (shown with their own fetch time).
      metrics: Object.keys(o.metrics).length ? o.metrics : before?.metrics ?? {},
      state: o.state,
      missing: o.missing,
      fetchedAt: Object.keys(o.metrics).length ? now : before?.fetchedAt ?? now,
      commentIds: nextKnown,
    }
    const targets = { ...(prev.targets ?? {}), [row.ledgerId]: target }
    const removedSet = new Set(removedIds)
    tx.set(engRef, {
      newsId: row.newsId,
      slug: slug !== undefined ? slug : prev.slug ?? null,
      updatedAt: now,
      targets,
      totals: sumMetrics(Object.values(targets)),
      approvedComments: (prev.approvedComments ?? []).filter((c) => !removedSet.has(c.id)),
    })
  })
}

// ── Public read (CDN-cached endpoint) ─────────────────────────────────────────

export async function readPublicEngagement(key: string, slug: string | null): Promise<PublicEngagement | null> {
  if (NEWS_ID_RE.test(key)) {
    const s = await db().collection(ENGAGEMENT).doc(key).get()
    if (s.exists) return toPublicEngagement(s.data() as EngagementDoc)
  }
  if (slug && SLUG_RE.test(slug)) {
    const q = await db().collection(ENGAGEMENT).where('slug', '==', slug).limit(1).get()
    if (!q.empty) return toPublicEngagement(q.docs[0].data() as EngagementDoc)
  }
  return null
}

// ── Moderation (central social managers) ──────────────────────────────────────

export interface ModerationComment extends SocialCommentDoc {
  id: string
  newsTitle: string | null
}

export async function listCommentsForModeration(status: CommentStatus, limit = 100): Promise<ModerationComment[]> {
  // Equality only (no composite index); newest first in memory.
  const snap = await db().collection(SOCIAL_COMMENTS).where('status', '==', status).limit(300).get()
  const rows = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as SocialCommentDoc) }))
    .sort((a, b) => (b.createdAt ?? b.fetchedAt) - (a.createdAt ?? a.fetchedAt))
    .slice(0, limit)
  const newsIds = [...new Set(rows.map((r) => r.newsId))].slice(0, 100)
  const titles = new Map<string, string>()
  if (newsIds.length) {
    const refs = newsIds.map((id) => db().collection(Collections.NEWS).doc(id))
    const snaps = await db().getAll(...refs)
    for (const s of snaps) {
      const t = s.exists ? (s.data() as { title?: unknown }).title : null
      if (typeof t === 'string') titles.set(s.id, t)
    }
  }
  return rows.map((r) => ({ ...r, newsTitle: titles.get(r.newsId) ?? null }))
}

export async function countPendingComments(): Promise<number> {
  const snap = await db().collection(SOCIAL_COMMENTS).where('status', '==', 'pending').limit(300).get()
  return snap.size
}

export const MODERATION_BATCH_MAX = 50

export async function moderateComments(ids: string[], action: 'approve' | 'reject', actorUid: string, now: number): Promise<{ updated: number; skipped: number }> {
  let updated = 0
  let skipped = 0
  const newsIds = new Set<string>()
  for (const id of ids.slice(0, MODERATION_BATCH_MAX)) {
    const ref = db().collection(SOCIAL_COMMENTS).doc(id)
    const ok = await db().runTransaction(async (tx) => {
      const s = await tx.get(ref)
      if (!s.exists) return false
      const c = s.data() as SocialCommentDoc
      if (c.status === 'removed') return false // deleted on the platform — never shown
      const engRef = db().collection(ENGAGEMENT).doc(c.newsId)
      const e = await tx.get(engRef)
      const next: CommentStatus = action === 'approve' ? 'approved' : 'rejected'
      tx.update(ref, { status: next, moderatedBy: actorUid, moderatedAt: now })
      const eng = e.exists ? (e.data() as EngagementDoc) : null
      const list = (eng?.approvedComments ?? []).filter((x) => x.id !== id)
      if (next === 'approved') {
        const pub: PublicSocialComment = { id, platform: c.platform, author: c.author, text: c.text, createdAt: c.createdAt, permalink: c.permalink }
        list.push(pub)
      }
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      if (e.exists) tx.update(engRef, { approvedComments: list.slice(0, MAX_APPROVED_COMMENTS), updatedAt: now })
      else if (next === 'approved') {
        tx.set(engRef, { newsId: c.newsId, slug: null, updatedAt: now, targets: {}, totals: {}, approvedComments: list.slice(0, MAX_APPROVED_COMMENTS) })
      }
      newsIds.add(c.newsId)
      return true
    })
    if (ok) updated++
    else skipped++
  }
  await writeSocialAudit({
    actorId: actorUid,
    action: 'social.comment.moderate',
    entityType: 'socialComment',
    entityId: action,
    // Ids and counts only — no comment text or author names in the audit log.
    meta: { action, updated, skipped, commentIds: ids.slice(0, MODERATION_BATCH_MAX), newsIds: [...newsIds] },
  })
  return { updated, skipped }
}
