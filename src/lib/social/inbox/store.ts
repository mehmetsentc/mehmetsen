/**
 * Social inbox storage and flows (server only).
 *
 *   socialInboxSettings/{accountId}      reply / auto-reply settings (default: everything off)
 *   socialReplies/{replyId}              one record per reply sent from NaHaber; deterministic id →
 *                                        a double click / retry never sends twice; auto replies use
 *                                        `auto_<item>` so an item is auto-answered at most once
 *   socialComments/{id}                  (existing) + inboxState / category / draft / reply / hidden
 *   socialConversations/{accountId__participant}   DM thread summary (24 h window from lastInboundAt)
 *   socialMessages/{platform_mid}        DM messages, idempotent on Meta's message id, 90-day retention
 *   socialInboxCounters/{accountId_day}  automatic replies per Istanbul day (+ hashed author keys)
 *
 * Cost: the shared 5-minute worker reads only queued rows (equality query, small
 * limit); webhooks write only what Meta pushes. Texts never reach logs or the
 * audit log (ids, codes and counts only).
 */
import 'server-only'
import { createHash } from 'node:crypto'
import type { DocumentReference } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { loadSocialAccount } from '../accounts/accountStore'
import { resolvePublishTarget } from '../accounts/resolvePublishTarget'
import { writeSocialAudit } from '../accounts/audit'
import type { SocialAccount, SocialAccountPlatform } from '../accounts/types'
import type { PublishTarget } from '../accounts/targetTypes'
import { buildPublicArticleUrl } from '../articleUrl'
import { errorLogFields, socialLog } from '../safeLog'
import { sensitivityFromDoc } from '../sensitiveNews'
import { moderateComments, type SocialCommentDoc } from '../engagement/store'
import { draftReply } from './ai'
import {
  authorKey as makeAuthorKey,
  classifyByRules,
  cleanReplyText,
  conversationId as makeConversationId,
  decideAuto,
  DEFAULT_INBOX_SETTINGS,
  DM_MAX,
  hasForeignLink,
  inboxCapabilities,
  istanbulDay,
  messageDocId,
  messagingWindow,
  parseInboxSettings,
  REPLY_MAX,
  templateReply,
  type AutoBlock,
  type InboxCategory,
  type InboxSettings,
  type ReplySource,
  type ReplyStatus,
  type ReplySummary,
  type WindowState,
} from './model'
import { fetchSenderProfile, publishThreadsContainer, replyToComment, sendDirectMessage, setCommentHidden, subscribeMessageWebhooks, type PlatformResult } from './platform'

const db = () => getAdminFirestore()
const col = {
  settings: () => db().collection(Collections.SOCIAL_INBOX_SETTINGS),
  replies: () => db().collection(Collections.SOCIAL_REPLIES),
  comments: () => db().collection(Collections.SOCIAL_COMMENTS),
  convs: () => db().collection(Collections.SOCIAL_CONVERSATIONS),
  messages: () => db().collection(Collections.SOCIAL_MESSAGES),
  counters: () => db().collection(Collections.SOCIAL_INBOX_COUNTERS),
  state: () => db().collection(Collections.SOCIAL_AUTOMATION_STATE),
}

export const INBOX_PER_TICK = 5
export const MESSAGE_RETENTION_MS = 90 * 24 * 3600_000
const LEASE_MS = 3 * 60_000
const SENDING_STALE_MS = 2 * 60_000
const SWEEP_EVERY_MS = 30 * 60_000
let lastSweepAt = 0
/** Tests: force the next tick to run the 30-minute sweep. */
export function resetInboxSweepForTests(): void {
  lastSweepAt = 0
}

// ── Inbox items stored on comment / conversation docs ────────────────────────

export interface InboxDraft {
  text: string
  source: 'ai' | 'template'
  provider: string | null
  at: number
}

export type InboxState = 'queued' | 'processing' | 'done'

export interface InboxFields {
  inboxState?: InboxState
  inboxLeaseUntil?: number | null
  category?: InboxCategory | null
  draft?: InboxDraft | null
  autoBlock?: AutoBlock | null
  reply?: ReplySummary | null
  hidden?: boolean | null
}

export interface ConversationDoc extends InboxFields {
  conversationId: string
  accountId: string
  platform: SocialAccountPlatform
  participantId: string
  participantName: string | null
  participantUsername: string | null
  profileFetched: boolean
  lastMessageAt: number
  lastInboundAt: number | null
  lastInboundText: string
  preview: string
  unread: number
  status: 'open' | 'done'
  updatedAt: number
}

export interface MessageDoc {
  messageId: string
  conversationId: string
  accountId: string
  platform: SocialAccountPlatform
  direction: 'in' | 'out'
  text: string
  attachments: string[]
  at: number
  source?: ReplySource | 'platform'
  deleted?: boolean
}

interface ReplyRecord {
  replyId: string
  kind: 'comment' | 'dm'
  itemId: string
  accountId: string
  platform: SocialAccountPlatform
  text: string
  source: ReplySource
  status: ReplyStatus
  createdBy: string
  createdAt: number
  updatedAt: number
  externalId: string | null
  containerId: string | null
  errorCode: string | null
  humanAgent?: boolean
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getInboxSettings(accountId: string): Promise<InboxSettings> {
  const s = await col.settings().doc(accountId).get()
  return s.exists ? parseInboxSettings(s.data(), { ...DEFAULT_INBOX_SETTINGS, ...(s.data() as Partial<InboxSettings>) }) : { ...DEFAULT_INBOX_SETTINGS }
}

export async function saveInboxSettings(accountId: string, patch: unknown, actorUid: string, now: number): Promise<InboxSettings> {
  const before = await getInboxSettings(accountId)
  const next = { ...parseInboxSettings(patch, before), updatedAt: now, updatedBy: actorUid }
  await col.settings().doc(accountId).set(next)
  await writeSocialAudit({
    actorId: actorUid,
    action: 'social.inbox.settings',
    entityType: 'socialAccount',
    entityId: accountId,
    before: { commentMode: before.commentMode, dmMode: before.dmMode, autoCategories: before.autoCategories, dailyLimit: before.dailyLimit, minIntervalSec: before.minIntervalSec, paused: before.paused },
    after: { commentMode: next.commentMode, dmMode: next.dmMode, autoCategories: next.autoCategories, dailyLimit: next.dailyLimit, minIntervalSec: next.minIntervalSec, paused: next.paused },
  })
  return next
}

/** Global switch: env `SOCIAL_INBOX_AUTO_REPLY=on` AND not paused from the panel. */
export async function autoReplyGlobal(): Promise<{ env: boolean; paused: boolean; enabled: boolean }> {
  const env = process.env.SOCIAL_INBOX_AUTO_REPLY?.trim().toLowerCase() === 'on'
  const s = await col.state().doc('inbox').get().catch(() => null)
  const paused = !!(s?.exists && (s.data() as { autoPaused?: unknown }).autoPaused === true)
  return { env, paused, enabled: env && !paused }
}

export async function setAutoReplyPaused(paused: boolean, actorUid: string, now: number): Promise<void> {
  await col.state().doc('inbox').set({ autoPaused: paused, updatedAt: now, updatedBy: actorUid }, { merge: true })
  await writeSocialAudit({ actorId: actorUid, action: 'social.inbox.settings', entityType: 'socialConfig', entityId: 'inbox_auto_global', after: { autoPaused: paused } })
}

/** Called by the engagement refresher when it stores new comments: queue them only if the account wants drafts / auto. */
export async function commentInboxEnabled(accountId: string): Promise<boolean> {
  const s = await col.settings().doc(accountId).get().catch(() => null)
  const mode = s?.exists ? (s.data() as { commentMode?: unknown }).commentMode : 'off'
  return mode === 'draft' || mode === 'auto'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type ResolvedTarget = { ok: true; account: SocialAccount; target: PublishTarget } | { ok: false; code: string }

async function resolveAccount(accountId: string, platform: SocialAccountPlatform, now: number): Promise<ResolvedTarget> {
  const loaded = await loadSocialAccount(accountId).catch(() => null)
  if (!loaded || loaded.state !== 'ok') return { ok: false, code: 'account_unavailable' }
  const r = await resolvePublishTarget(accountId, { expectedPlatform: platform, now })
  if (!r.ok) return { ok: false, code: 'account_unavailable' }
  return { ok: true, account: loaded.account, target: r.target }
}

function replyIdFor(kind: 'comment' | 'dm', itemId: string, requestId: string): string {
  if (requestId.startsWith('auto')) return `${requestId}_${kind}_${itemId}`.slice(0, 300)
  return `${kind}_${createHash('sha256').update(`${itemId}|${requestId}`).digest('hex').slice(0, 32)}`
}

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/
export function isValidRequestId(v: unknown): v is string {
  return typeof v === 'string' && REQUEST_ID_RE.test(v) && !v.toLowerCase().startsWith('auto')
}

async function newsContext(newsId: string | null): Promise<{ title: string | null; url: string | null; sensitivity: number }> {
  if (!newsId) return { title: null, url: null, sensitivity: 0 }
  const s = await db().collection(Collections.NEWS).doc(newsId).get().catch(() => null)
  if (!s?.exists) return { title: null, url: null, sensitivity: 0 }
  const d = s.data() as Record<string, unknown>
  return {
    title: typeof d.title === 'string' ? d.title : null,
    url: buildPublicArticleUrl(newsId, d),
    sensitivity: sensitivityFromDoc(d).level,
  }
}

export type ReplyOutcome =
  | { ok: true; replyId: string; status: ReplyStatus; duplicate: boolean }
  | { ok: false; code: string; status: number; replyId?: string }

/**
 * Shared send pipeline: claim (idempotent record + item summary) → platform call → finish.
 * `uncertain` results are never retried automatically.
 */
async function sendReply(input: {
  kind: 'comment' | 'dm'
  itemRef: DocumentReference
  itemId: string
  accountId: string
  platform: SocialAccountPlatform
  text: string
  source: ReplySource
  actorUid: string
  requestId: string
  now: number
  acceptUncertain?: boolean
  humanAgent?: boolean
  call: (target: PublishTarget) => Promise<PlatformResult>
}): Promise<ReplyOutcome> {
  const replyId = replyIdFor(input.kind, input.itemId, input.requestId)
  const replyRef = col.replies().doc(replyId)
  const claim = await db().runTransaction(async (tx) => {
    const [existing, item] = await Promise.all([tx.get(replyRef), tx.get(input.itemRef)])
    if (existing.exists) return { dup: existing.data() as ReplyRecord }
    if (!item.exists) return { err: 'not_found' as const }
    const cur = (item.data() as InboxFields).reply
    if (cur && cur.status === 'sending' && input.now - cur.at < SENDING_STALE_MS) return { err: 'in_flight' as const }
    if (cur && cur.status === 'uncertain' && !input.acceptUncertain) return { err: 'uncertain_needs_check' as const }
    if (input.source === 'auto' && input.kind === 'comment' && cur && cur.status === 'sent') return { err: 'already_replied' as const }
    const rec: ReplyRecord = {
      replyId,
      kind: input.kind,
      itemId: input.itemId,
      accountId: input.accountId,
      platform: input.platform,
      text: input.text,
      source: input.source,
      status: 'sending',
      createdBy: input.actorUid,
      createdAt: input.now,
      updatedAt: input.now,
      externalId: null,
      containerId: null,
      errorCode: null,
      humanAgent: !!input.humanAgent,
    }
    tx.create(replyRef, { ...rec })
    tx.update(input.itemRef, { reply: summary(rec) })
    return { rec }
  })
  if ('dup' in claim && claim.dup) return { ok: true, replyId, status: claim.dup.status, duplicate: true }
  if ('err' in claim && claim.err) return { ok: false, code: claim.err, status: claim.err === 'not_found' ? 404 : 409 }

  const resolved = await resolveAccount(input.accountId, input.platform, input.now)
  let result: PlatformResult
  if (!resolved.ok) result = { ok: false, code: resolved.code, uncertain: false }
  else {
    try {
      result = await input.call(resolved.target)
    } catch (err) {
      socialLog('error', 'publish', 'inbox_send_error', { platform: input.platform, ...errorLogFields(err) })
      result = { ok: false, code: 'exception', uncertain: true }
    }
  }
  const status: ReplyStatus = result.ok ? (result.pendingPublish ? 'pending_publish' : 'sent') : result.uncertain ? 'uncertain' : 'failed'
  const patch = {
    status,
    updatedAt: Date.now(),
    externalId: result.ok ? result.externalId : null,
    containerId: result.ok ? result.containerId ?? null : null,
    errorCode: result.ok ? null : result.code,
  }
  await replyRef.update(patch)
  const rec = { ...(claim as { rec: ReplyRecord }).rec, ...patch }
  const itemPatch: Record<string, unknown> = { reply: summary(rec) }
  if (status === 'sent' && input.kind === 'dm') Object.assign(itemPatch, { status: 'done', unread: 0 })
  await input.itemRef.update(itemPatch)
  if (status === 'sent' && input.kind === 'dm' && result.ok) {
    await recordOutgoingMessage(input.itemId, input.accountId, input.platform, rec.externalId ?? replyId, input.text, input.source, Date.now())
  }
  await writeSocialAudit({
    actorId: input.actorUid,
    actorType: input.source === 'auto' ? 'SYSTEM' : 'HUMAN',
    action: 'social.inbox.reply',
    entityType: input.kind === 'dm' ? 'socialConversation' : 'socialComment',
    entityId: input.itemId,
    // No reply text in the audit log — ids, source, result only.
    meta: { replyId, accountId: input.accountId, platform: input.platform, source: input.source, status, errorCode: rec.errorCode, humanAgent: !!input.humanAgent },
  })
  return result.ok ? { ok: true, replyId, status, duplicate: false } : { ok: false, code: result.code, status: result.uncertain ? 502 : 422, replyId }
}

function summary(r: ReplyRecord): ReplySummary {
  return { replyId: r.replyId, status: r.status, text: r.text, source: r.source, at: r.updatedAt, by: r.source === 'auto' ? null : r.createdBy, errorCode: r.errorCode }
}

function validateText(raw: unknown, max: number): { ok: true; text: string } | { ok: false; code: string } {
  if (typeof raw === 'string' && raw.trim().length > max) return { ok: false, code: 'too_long' }
  const text = cleanReplyText(raw, max)
  if (!text) return { ok: false, code: 'empty' }
  if (hasForeignLink(text)) return { ok: false, code: 'foreign_link' }
  return { ok: true, text }
}

// ── Comments ─────────────────────────────────────────────────────────────────

type CommentRow = SocialCommentDoc & InboxFields

export async function replyToCommentFromPanel(input: {
  commentDocId: string
  text: unknown
  source: 'editor' | 'ai_draft'
  actorUid: string
  requestId: string
  acceptUncertain?: boolean
  now: number
}): Promise<ReplyOutcome> {
  const ref = col.comments().doc(input.commentDocId)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false, code: 'not_found', status: 404 }
  const c = snap.data() as CommentRow
  if (c.status === 'removed') return { ok: false, code: 'comment_removed', status: 409 }
  if (c.platform === 'tiktok') return { ok: false, code: 'unsupported', status: 422 }
  const v = validateText(input.text, REPLY_MAX[c.platform])
  if (!v.ok) return { ok: false, code: v.code, status: 400 }
  return sendReply({
    kind: 'comment',
    itemRef: ref,
    itemId: input.commentDocId,
    accountId: c.accountId,
    platform: c.platform,
    text: v.text,
    source: input.source,
    actorUid: input.actorUid,
    requestId: input.requestId,
    acceptUncertain: input.acceptUncertain,
    now: input.now,
    call: (t) => replyToComment(t, c.commentId, v.text),
  })
}

export async function hideCommentFromPanel(input: { commentDocId: string; hidden: boolean; actorUid: string; now: number }): Promise<{ ok: true } | { ok: false; code: string; status: number }> {
  const ref = col.comments().doc(input.commentDocId)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false, code: 'not_found', status: 404 }
  const c = snap.data() as CommentRow
  if (c.platform !== 'instagram' && c.platform !== 'facebook' && c.platform !== 'threads') return { ok: false, code: 'unsupported', status: 422 }
  const resolved = await resolveAccount(c.accountId, c.platform, input.now)
  const r: PlatformResult = resolved.ok ? await setCommentHidden(resolved.target, c.commentId, input.hidden) : { ok: false, code: resolved.code, uncertain: false }
  if (r.ok) {
    await ref.update({ hidden: input.hidden })
    // Hidden on the platform → not shown on NaHaber either.
    if (input.hidden && (c.status === 'pending' || c.status === 'approved')) await moderateComments([input.commentDocId], 'reject', input.actorUid, input.now)
  }
  await writeSocialAudit({
    actorId: input.actorUid,
    action: 'social.inbox.hide',
    entityType: 'socialComment',
    entityId: input.commentDocId,
    meta: { accountId: c.accountId, platform: c.platform, hidden: input.hidden, ok: r.ok, errorCode: r.ok ? null : r.code },
  })
  return r.ok ? { ok: true } : { ok: false, code: r.code, status: r.uncertain ? 502 : 422 }
}

export async function draftForComment(commentDocId: string, now: number): Promise<{ ok: true; draft: InboxDraft | null; category: InboxCategory; reason: string } | { ok: false; code: string; status: number }> {
  const ref = col.comments().doc(commentDocId)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false, code: 'not_found', status: 404 }
  const c = snap.data() as CommentRow
  const news = await newsContext(c.newsId)
  const ai = await draftReply({ kind: 'comment', platform: c.platform, text: c.text, newsTitle: news.title, newsUrl: news.url, lane: 'manual_editor', maxLength: REPLY_MAX[c.platform] })
  const draft = ai.text
    ? { text: ai.text, source: 'ai' as const, provider: ai.provider, at: now }
    : templateFor(ai.category, news.url, 'comment', now)
  await ref.update({ draft, category: ai.category })
  return { ok: true, draft, category: ai.category, reason: ai.text ? 'ok' : ai.reason }
}

function templateFor(category: InboxCategory, url: string | null, kind: 'comment' | 'dm', now: number): InboxDraft | null {
  const t = templateReply(category, { newsUrl: url, kind })
  return t ? { text: t, source: 'template', provider: null, at: now } : null
}

export async function acknowledgeUncertain(kind: 'comment' | 'dm', itemId: string, resolution: 'sent' | 'not_sent', actorUid: string, now: number): Promise<{ ok: boolean }> {
  const ref = kind === 'comment' ? col.comments().doc(itemId) : col.convs().doc(itemId)
  const s = await ref.get()
  const cur = s.exists ? (s.data() as InboxFields).reply : null
  if (!cur || cur.status !== 'uncertain') return { ok: false }
  const status: ReplyStatus = resolution === 'sent' ? 'sent' : 'failed'
  await col.replies().doc(cur.replyId).update({ status, updatedAt: now, errorCode: resolution === 'sent' ? null : 'confirmed_not_sent' }).catch(() => undefined)
  await ref.update({ reply: { ...cur, status, at: now, errorCode: resolution === 'sent' ? null : 'confirmed_not_sent' } })
  await writeSocialAudit({ actorId: actorUid, action: 'social.inbox.uncertain_ack', entityType: kind === 'dm' ? 'socialConversation' : 'socialComment', entityId: itemId, meta: { replyId: cur.replyId, resolution } })
  return { ok: true }
}

// ── Direct messages: webhook ingestion ───────────────────────────────────────

interface WebhookMessaging {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean; attachments?: Array<{ type?: string }> }
}

export interface IngestReport {
  accepted: number
  ignored: number
  unknownAccounts: number
}

const ATTACHMENT_TR: Record<string, string> = { image: 'görsel', video: 'video', audio: 'ses', file: 'dosya', share: 'paylaşım', story_mention: 'hikâyede bahsetme', ig_reel: 'Reels', reel: 'Reels', sticker: 'çıkartma' }

/** Meta webhook body (object `instagram` or `page`) → conversations + messages. Idempotent on message id. */
export async function ingestMessagingWebhook(body: unknown, now: number): Promise<IngestReport> {
  const report: IngestReport = { accepted: 0, ignored: 0, unknownAccounts: 0 }
  const b = (body && typeof body === 'object' ? body : {}) as { object?: unknown; entry?: unknown }
  const platform: SocialAccountPlatform | null = b.object === 'instagram' ? 'instagram' : b.object === 'page' ? 'facebook' : null
  if (!platform || !Array.isArray(b.entry)) return report
  const accountCache = new Map<string, SocialAccount | null>()
  for (const entry of b.entry.slice(0, 50) as Array<{ id?: unknown; messaging?: unknown }>) {
    const ownerId = typeof entry.id === 'string' || typeof entry.id === 'number' ? String(entry.id) : ''
    if (!/^[0-9]{1,40}$/.test(ownerId) || !Array.isArray(entry.messaging)) {
      report.ignored++
      continue
    }
    const accountId = `${platform}_${ownerId}`
    if (!accountCache.has(accountId)) {
      const l = await loadSocialAccount(accountId).catch(() => null)
      accountCache.set(accountId, l && l.state === 'ok' ? l.account : null)
    }
    const account = accountCache.get(accountId)
    if (!account) {
      report.unknownAccounts++
      continue
    }
    for (const ev of entry.messaging.slice(0, 100) as WebhookMessaging[]) {
      const ok = await ingestOne(account, ownerId, ev, now).catch((err) => {
        socialLog('error', 'cron', 'inbox_ingest_error', { platform, ...errorLogFields(err) })
        return false
      })
      if (ok) report.accepted++
      else report.ignored++
    }
  }
  return report
}

async function ingestOne(account: SocialAccount, ownerId: string, ev: WebhookMessaging, now: number): Promise<boolean> {
  const m = ev.message
  const mid = typeof m?.mid === 'string' ? m.mid : ''
  if (!m || !mid) return false // reads, reactions, postbacks: not stored
  const echo = m.is_echo === true
  const participantId = String((echo ? ev.recipient?.id : ev.sender?.id) ?? '')
  if (!/^[0-9]{1,40}$/.test(participantId) || participantId === ownerId) return false
  const at = typeof ev.timestamp === 'number' && ev.timestamp > 0 ? ev.timestamp : now
  const convId = makeConversationId(account.id, participantId)
  const msgRef = col.messages().doc(messageDocId(account.platform, mid))
  const convRef = col.convs().doc(convId)

  if (m.is_deleted) {
    const s = await msgRef.get()
    if (s.exists) await msgRef.update({ deleted: true, text: '' })
    return true
  }
  const attachments = (m.attachments ?? []).map((a) => (typeof a?.type === 'string' ? a.type : 'file')).slice(0, 10)
  const text = cleanReplyText(m.text, 2000) || (attachments.length ? `[${attachments.map((t) => ATTACHMENT_TR[t] ?? 'ek').join(', ')}]` : '')
  const direction: 'in' | 'out' = echo ? 'out' : 'in'

  await db().runTransaction(async (tx) => {
    const [ms, cs] = await Promise.all([tx.get(msgRef), tx.get(convRef)])
    if (ms.exists) return // Meta retries deliveries — already stored (or our own send echoed back)
    const msg: MessageDoc = { messageId: mid, conversationId: convId, accountId: account.id, platform: account.platform, direction, text, attachments, at, source: echo ? 'platform' : undefined }
    if (!echo) delete msg.source
    tx.create(msgRef, { ...msg })
    const prev = cs.exists ? (cs.data() as ConversationDoc) : null
    const conv: ConversationDoc = {
      conversationId: convId,
      accountId: account.id,
      platform: account.platform,
      participantId,
      participantName: prev?.participantName ?? null,
      participantUsername: prev?.participantUsername ?? null,
      profileFetched: prev?.profileFetched ?? false,
      lastMessageAt: Math.max(prev?.lastMessageAt ?? 0, at),
      lastInboundAt: direction === 'in' ? Math.max(prev?.lastInboundAt ?? 0, at) : prev?.lastInboundAt ?? null,
      lastInboundText: direction === 'in' ? text.slice(0, 1000) : prev?.lastInboundText ?? '',
      preview: (at >= (prev?.lastMessageAt ?? 0) ? text : prev?.preview ?? text).slice(0, 140),
      unread: direction === 'in' ? (prev?.unread ?? 0) + 1 : prev?.unread ?? 0,
      status: direction === 'in' ? 'open' : prev?.status ?? 'open',
      updatedAt: now,
      inboxState: direction === 'in' ? 'queued' : prev?.inboxState ?? 'done',
      inboxLeaseUntil: null,
      category: direction === 'in' ? null : prev?.category ?? null,
      draft: direction === 'in' ? null : prev?.draft ?? null,
      autoBlock: direction === 'in' ? null : prev?.autoBlock ?? null,
      reply: prev?.reply ?? null,
    }
    tx.set(convRef, conv)
  })
  return true
}

async function recordOutgoingMessage(convId: string, accountId: string, platform: SocialAccountPlatform, mid: string, text: string, source: ReplySource, now: number): Promise<void> {
  const ref = col.messages().doc(messageDocId(platform, mid))
  const msg: MessageDoc = { messageId: mid, conversationId: convId, accountId, platform, direction: 'out', text, attachments: [], at: now, source }
  await ref.create({ ...msg }).catch(() => undefined) // the echo webhook may have stored it first
  await col.convs().doc(convId).update({ lastMessageAt: now, preview: text.slice(0, 140), updatedAt: now }).catch(() => undefined)
}

// ── Direct messages: panel ───────────────────────────────────────────────────

export async function listConversations(opts: { status: 'open' | 'done' | 'all'; limit?: number }): Promise<Array<ConversationDoc & { window: WindowState; accountName: string | null }>> {
  const q = opts.status === 'all' ? col.convs().orderBy('lastMessageAt', 'desc').limit(opts.limit ?? 100) : col.convs().where('status', '==', opts.status).limit(300)
  const snap = await q.get()
  const now = Date.now()
  const rows = snap.docs.map((d) => d.data() as ConversationDoc).sort((a, b) => b.lastMessageAt - a.lastMessageAt).slice(0, opts.limit ?? 100)
  const names = await accountNames([...new Set(rows.map((r) => r.accountId))])
  return rows.map((r) => ({ ...r, window: messagingWindow(r.lastInboundAt, now), accountName: names.get(r.accountId) ?? null }))
}

export async function getConversation(convId: string): Promise<{ conversation: ConversationDoc & { window: WindowState }; messages: MessageDoc[] } | null> {
  const s = await col.convs().doc(convId).get()
  if (!s.exists) return null
  const conv = s.data() as ConversationDoc
  const m = await col.messages().where('conversationId', '==', convId).limit(300).get()
  const messages = m.docs.map((d) => d.data() as MessageDoc).sort((a, b) => a.at - b.at).slice(-200)
  if (conv.unread) await col.convs().doc(convId).update({ unread: 0 }).catch(() => undefined)
  return { conversation: { ...conv, unread: 0, window: messagingWindow(conv.lastInboundAt, Date.now()) }, messages }
}

export async function setConversationStatus(convId: string, status: 'open' | 'done'): Promise<boolean> {
  const ref = col.convs().doc(convId)
  const s = await ref.get()
  if (!s.exists) return false
  await ref.update({ status, unread: 0 })
  return true
}

async function accountNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!ids.length) return out
  const snaps = await db().getAll(...ids.slice(0, 100).map((id) => db().collection(Collections.SOCIAL_ACCOUNTS).doc(id)))
  for (const s of snaps) {
    if (!s.exists) continue
    const d = s.data() as { username?: string | null; displayName?: string }
    out.set(s.id, d.username ? `@${d.username}` : d.displayName ?? s.id)
  }
  return out
}

export async function replyToConversationFromPanel(input: {
  conversationId: string
  text: unknown
  source: 'editor' | 'ai_draft'
  actorUid: string
  requestId: string
  acceptUncertain?: boolean
  now: number
}): Promise<ReplyOutcome> {
  const ref = col.convs().doc(input.conversationId)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false, code: 'not_found', status: 404 }
  const c = snap.data() as ConversationDoc
  const v = validateText(input.text, DM_MAX)
  if (!v.ok) return { ok: false, code: v.code, status: 400 }
  const window = messagingWindow(c.lastInboundAt, input.now)
  if (window === 'closed') return { ok: false, code: 'window_closed', status: 409 }
  const humanAgent = window === 'human_agent' // a person is answering — never used by auto replies
  return sendReply({
    kind: 'dm',
    itemRef: ref,
    itemId: input.conversationId,
    accountId: c.accountId,
    platform: c.platform,
    text: v.text,
    source: input.source,
    actorUid: input.actorUid,
    requestId: input.requestId,
    acceptUncertain: input.acceptUncertain,
    humanAgent,
    now: input.now,
    call: (t) => sendDirectMessage(t, c.participantId, v.text, { humanAgent }),
  })
}

export async function draftForConversation(convId: string, now: number): Promise<{ ok: true; draft: InboxDraft | null; category: InboxCategory; reason: string } | { ok: false; code: string; status: number }> {
  const got = await getConversation(convId)
  if (!got) return { ok: false, code: 'not_found', status: 404 }
  const { conversation: c, messages } = got
  const history = messages.filter((m) => !m.deleted && m.text).map((m) => ({ direction: m.direction, text: m.text }))
  const ai = await draftReply({ kind: 'dm', platform: c.platform, text: c.lastInboundText, newsTitle: null, newsUrl: null, history, lane: 'manual_editor', maxLength: DM_MAX })
  const draft = ai.text ? { text: ai.text, source: 'ai' as const, provider: ai.provider, at: now } : templateFor(ai.category, null, 'dm', now)
  await col.convs().doc(convId).update({ draft, category: ai.category })
  return { ok: true, draft, category: ai.category, reason: ai.text ? 'ok' : ai.reason }
}

export async function subscribeAccountMessages(accountId: string, actorUid: string, now: number): Promise<{ ok: true } | { ok: false; code: string }> {
  const loaded = await loadSocialAccount(accountId).catch(() => null)
  if (!loaded || loaded.state !== 'ok') return { ok: false, code: 'not_found' }
  const a = loaded.account
  if (a.platform !== 'instagram' && a.platform !== 'facebook') return { ok: false, code: 'unsupported' }
  const resolved = await resolveAccount(accountId, a.platform, now)
  const linkedPage = a.platform === 'instagram' ? a.instagram.linkedFacebookPageId : null
  const r: PlatformResult = resolved.ok ? await subscribeMessageWebhooks(resolved.target, linkedPage) : { ok: false, code: resolved.code, uncertain: false }
  if (r.ok) await col.settings().doc(accountId).set({ messagesSubscribedAt: now }, { merge: true })
  await writeSocialAudit({ actorId: actorUid, action: 'social.inbox.subscribe', entityType: 'socialAccount', entityId: accountId, meta: { ok: r.ok, errorCode: r.ok ? null : r.code } })
  return r.ok ? { ok: true } : { ok: false, code: r.code }
}

// ── Shared worker step ───────────────────────────────────────────────────────

export interface InboxTickReport {
  comments: number
  conversations: number
  autoReplies: number
  drafts: number
  threadsPublished: number
  purged: number
}

/**
 * Bounded: at most a few queued comments / conversations per tick, each claimed
 * with a lease (two workers never take the same item), plus pending Threads
 * publishes and a small retention sweep.
 */
export async function runInboxTick(now: () => number, opts: { deadline: number }): Promise<InboxTickReport> {
  const rep: InboxTickReport = { comments: 0, conversations: 0, autoReplies: 0, drafts: 0, threadsPublished: 0, purged: 0 }
  // Idle cost: two equality queries per tick. The global switch is read only when
  // there is work; lease recovery, pending Threads publishes and retention run
  // at most every 30 minutes per server instance.
  let globalMemo: Awaited<ReturnType<typeof autoReplyGlobal>> | null = null
  const globalEnabled = async () => (globalMemo ??= await autoReplyGlobal()).enabled
  const sweep = now() - lastSweepAt >= SWEEP_EVERY_MS
  if (sweep) lastSweepAt = now()
  const settingsCache = new Map<string, InboxSettings>()
  const settingsOf = async (id: string) => {
    if (!settingsCache.has(id)) settingsCache.set(id, await getInboxSettings(id))
    return settingsCache.get(id)!
  }

  for (const [kind, ref] of [
    ['comment', col.comments()],
    ['dm', col.convs()],
  ] as const) {
    if (now() > opts.deadline) break
    const snap = await ref.where('inboxState', '==', 'queued').limit(INBOX_PER_TICK).get()
    for (const doc of snap.docs) {
      if (now() > opts.deadline) break
      const itemRef = ref.doc(doc.id)
      const claimed = await claimItem(itemRef, now())
      if (!claimed) continue
      try {
        const r =
          kind === 'comment'
            ? await processComment(doc.id, claimed as unknown as CommentRow, await settingsOf((claimed as unknown as CommentRow).accountId), await globalEnabled(), now())
            : await processConversation(doc.id, claimed as unknown as ConversationDoc, await settingsOf((claimed as unknown as ConversationDoc).accountId), await globalEnabled(), now())
        if (kind === 'comment') rep.comments++
        else rep.conversations++
        if (r === 'auto') rep.autoReplies++
        if (r === 'draft') rep.drafts++
      } catch (err) {
        socialLog('error', 'cron', 'inbox_item_error', { kind, ...errorLogFields(err) })
        await itemRef.update({ inboxState: 'done', inboxLeaseUntil: null }).catch(() => undefined)
      }
    }
    // Expired leases (a worker died mid-item) go back to the queue — checked every 30 minutes only.
    if (!sweep) continue
    const stale = await ref.where('inboxState', '==', 'processing').limit(10).get()
    for (const d of stale.docs) {
      const lease = (d.data() as InboxFields).inboxLeaseUntil ?? 0
      if (lease < now()) await ref.doc(d.id).update({ inboxState: 'queued', inboxLeaseUntil: null }).catch(() => undefined)
    }
  }

  if (sweep && now() < opts.deadline) rep.threadsPublished = await publishPendingThreads(now())
  if (sweep && now() < opts.deadline) {
    const old = await col.messages().where('at', '<', now() - MESSAGE_RETENTION_MS).limit(50).get()
    for (const d of old.docs) await col.messages().doc(d.id).delete()
    rep.purged = old.size
  }
  return rep
}

async function claimItem(ref: DocumentReference, now: number): Promise<Record<string, unknown> | null> {
  return db().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return null
    const d = s.data() as InboxFields & Record<string, unknown>
    if (d.inboxState !== 'queued') return null
    tx.update(ref, { inboxState: 'processing', inboxLeaseUntil: now + LEASE_MS })
    return d
  })
}

async function counterFor(accountId: string, now: number) {
  const ref = col.counters().doc(`${accountId}_${istanbulDay(now)}`)
  const s = await ref.get()
  const d = s.exists ? (s.data() as { count?: number; lastAt?: number | null; authors?: string[] }) : {}
  return { ref, counter: { count: d.count ?? 0, lastAt: d.lastAt ?? null, authors: d.authors ?? [] } }
}

async function bumpCounter(ref: DocumentReference, author: string | null, now: number): Promise<void> {
  await db().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    const d = s.exists ? (s.data() as { count?: number; authors?: string[] }) : {}
    const authors = author ? [...new Set([...(d.authors ?? []), author])].slice(-500) : d.authors ?? []
    tx.set(ref, { count: (d.count ?? 0) + 1, lastAt: now, authors })
  })
}

async function processComment(id: string, c: CommentRow, settings: InboxSettings, globalEnabled: boolean, now: number): Promise<'auto' | 'draft' | 'none'> {
  const ref = col.comments().doc(id)
  const category = classifyByRules(c.text)
  const loaded = await loadSocialAccount(c.accountId).catch(() => null)
  const account = loaded && loaded.state === 'ok' ? loaded.account : null
  const ownAccount = !!(account?.username && c.author && account.username.toLowerCase() === c.author.toLowerCase())
  const caps = account ? inboxCapabilities(account) : null
  const news = await newsContext(c.newsId)
  const key = makeAuthorKey(c.platform, c.author)
  const { ref: counterRef, counter } = await counterFor(c.accountId, now)
  const decision = decideAuto({
    kind: 'comment',
    category,
    settings,
    globalEnabled,
    newsSensitivity: news.sensitivity,
    ownAccount,
    canReply: caps ? caps.reply === 'granted' || caps.reply === 'unknown' : false,
    itemAt: c.createdAt ?? c.fetchedAt,
    now,
    counter,
    authorKey: key,
  })
  if (decision.action === 'skip') {
    await ref.update({ inboxState: 'done', inboxLeaseUntil: null, category, autoBlock: decision.reason })
    return 'none'
  }
  if (decision.action === 'reply') {
    const text = templateReply(category, { newsUrl: news.url, kind: 'comment' })
    if (text) {
      await ref.update({ inboxState: 'done', inboxLeaseUntil: null, category, autoBlock: null })
      const r = await sendReply({ kind: 'comment', itemRef: ref, itemId: id, accountId: c.accountId, platform: c.platform, text, source: 'auto', actorUid: 'system:social-inbox', requestId: 'auto', now, call: (t) => replyToComment(t, c.commentId, text) })
      if (r.ok && r.status !== 'failed') await bumpCounter(counterRef, key, now)
      return 'auto'
    }
  }
  // Draft for a person (AI in the automated lane when allowed, otherwise a template for safe categories).
  let draft: InboxDraft | null = null
  let finalCategory = category
  if (category !== 'spam') {
    const ai = await draftReply({ kind: 'comment', platform: c.platform, text: c.text, newsTitle: news.title, newsUrl: news.url, lane: 'automated', maxLength: REPLY_MAX[c.platform] })
    finalCategory = ai.category
    draft = ai.text ? { text: ai.text, source: 'ai', provider: ai.provider, at: now } : templateFor(ai.category, news.url, 'comment', now)
  }
  await ref.update({ inboxState: 'done', inboxLeaseUntil: null, category: finalCategory, draft, autoBlock: decision.action === 'draft' ? decision.reason : null })
  return draft ? 'draft' : 'none'
}

async function processConversation(id: string, c: ConversationDoc, settings: InboxSettings, globalEnabled: boolean, now: number): Promise<'auto' | 'draft' | 'none'> {
  const ref = col.convs().doc(id)
  const loaded = await loadSocialAccount(c.accountId).catch(() => null)
  const account = loaded && loaded.state === 'ok' ? loaded.account : null
  const patch: Record<string, unknown> = {}
  if (!c.profileFetched && account) {
    const resolved = await resolveAccount(c.accountId, c.platform, now)
    if (resolved.ok) {
      const p = await fetchSenderProfile(resolved.target, c.participantId)
      Object.assign(patch, { participantName: p.name, participantUsername: p.username })
    }
    patch.profileFetched = true
  }
  const category = classifyByRules(c.lastInboundText)
  const caps = account ? inboxCapabilities(account) : null
  const key = makeAuthorKey(c.platform, c.participantId)
  const { ref: counterRef, counter } = await counterFor(c.accountId, now)
  const decision = decideAuto({
    kind: 'dm',
    category,
    settings,
    globalEnabled,
    newsSensitivity: 0,
    ownAccount: false,
    canReply: caps ? caps.messages === 'granted' || caps.messages === 'unknown' : false,
    itemAt: c.lastInboundAt,
    now,
    counter,
    authorKey: key,
    window: messagingWindow(c.lastInboundAt, now),
  })
  if (decision.action === 'skip') {
    await ref.update({ ...patch, inboxState: 'done', inboxLeaseUntil: null, category, autoBlock: decision.reason })
    return 'none'
  }
  if (decision.action === 'reply') {
    const text = templateReply(category, { newsUrl: null, kind: 'dm' })
    if (text) {
      await ref.update({ ...patch, inboxState: 'done', inboxLeaseUntil: null, category, autoBlock: null })
      const r = await sendReply({
        kind: 'dm',
        itemRef: ref,
        itemId: id,
        accountId: c.accountId,
        platform: c.platform,
        text,
        source: 'auto',
        actorUid: 'system:social-inbox',
        // At most one automatic answer per conversation per day.
        requestId: `auto-${istanbulDay(now)}`,
        now,
        call: (t) => sendDirectMessage(t, c.participantId, text, { humanAgent: false }),
      })
      if (r.ok && r.status !== 'failed') await bumpCounter(counterRef, key, now)
      return 'auto'
    }
  }
  let draft: InboxDraft | null = null
  let finalCategory = category
  if (category !== 'spam') {
    const m = await col.messages().where('conversationId', '==', id).limit(50).get()
    const history = m.docs.map((d) => d.data() as MessageDoc).filter((x) => !x.deleted && x.text).sort((a, b) => a.at - b.at).map((x) => ({ direction: x.direction, text: x.text }))
    const ai = await draftReply({ kind: 'dm', platform: c.platform, text: c.lastInboundText, newsTitle: null, newsUrl: null, history, lane: 'automated', maxLength: DM_MAX })
    finalCategory = ai.category
    draft = ai.text ? { text: ai.text, source: 'ai', provider: ai.provider, at: now } : templateFor(ai.category, null, 'dm', now)
  }
  await ref.update({ ...patch, inboxState: 'done', inboxLeaseUntil: null, category: finalCategory, draft, autoBlock: decision.action === 'draft' ? decision.reason : null })
  return draft ? 'draft' : 'none'
}

async function publishPendingThreads(now: number): Promise<number> {
  const snap = await col.replies().where('status', '==', 'pending_publish').limit(5).get()
  let published = 0
  for (const d of snap.docs) {
    const r = d.data() as ReplyRecord
    if (!r.containerId) continue
    const resolved = await resolveAccount(r.accountId, r.platform, now)
    const res: PlatformResult = resolved.ok ? await publishThreadsContainer(resolved.target, r.containerId) : { ok: false, code: resolved.code, uncertain: false }
    let status: ReplyStatus = 'pending_publish'
    if (res.ok) status = 'sent'
    else if (res.uncertain) status = 'uncertain'
    else if (now - r.createdAt > 2 * 3600_000) status = 'failed'
    if (status === 'pending_publish') continue
    const patch = { status, updatedAt: now, externalId: res.ok ? res.externalId : null, errorCode: res.ok ? null : res.code }
    await col.replies().doc(d.id).update(patch)
    const itemRef = r.kind === 'comment' ? col.comments().doc(r.itemId) : col.convs().doc(r.itemId)
    await itemRef.update({ reply: summary({ ...r, ...patch }) }).catch(() => undefined)
    if (status === 'sent') published++
  }
  return published
}

// ── Settings panel ───────────────────────────────────────────────────────────

export interface InboxAccountView {
  accountId: string
  platform: SocialAccountPlatform
  connectionMethod: string
  name: string
  status: string
  citySlug: string | null
  central: boolean
  reply: string
  messages: string
  missing: string[]
  settings: InboxSettings
  messagesSubscribedAt: number | null
}

export async function listInboxAccounts(): Promise<{ accounts: InboxAccountView[]; global: Awaited<ReturnType<typeof autoReplyGlobal>>; webhookConfigured: boolean }> {
  const { parseSocialAccount } = await import('../accounts/types')
  const snap = await db().collection(Collections.SOCIAL_ACCOUNTS).limit(300).get()
  const accounts = snap.docs
    .map((d) => parseSocialAccount(d.id, d.data()))
    .filter((a): a is SocialAccount => !!a && a.connectionMethod !== 'legacy' && a.platform !== 'tiktok' && a.status !== 'disabled')
  const settingsSnaps = accounts.length ? await db().getAll(...accounts.map((a) => col.settings().doc(a.id))) : []
  const byId = new Map(settingsSnaps.filter((s) => s.exists).map((s) => [s.id, s.data() as Partial<InboxSettings> & { messagesSubscribedAt?: number }]))
  const views = accounts.map((a) => {
    const raw = byId.get(a.id)
    const settings = raw ? parseInboxSettings(raw, { ...DEFAULT_INBOX_SETTINGS, ...raw }) : { ...DEFAULT_INBOX_SETTINGS }
    const caps = inboxCapabilities(a)
    return {
      accountId: a.id,
      platform: a.platform,
      connectionMethod: a.connectionMethod,
      name: a.username ? `@${a.username}` : a.displayName,
      status: a.status,
      citySlug: a.ownership.citySlug,
      central: a.ownership.central === true,
      reply: caps.reply,
      messages: caps.messages,
      missing: caps.missing,
      settings: { ...settings, updatedAt: raw?.updatedAt ?? null, updatedBy: raw?.updatedBy ?? null },
      messagesSubscribedAt: typeof raw?.messagesSubscribedAt === 'number' ? raw.messagesSubscribedAt : null,
    }
  })
  views.sort((x, y) => Number(y.central) - Number(x.central) || (x.citySlug ?? '').localeCompare(y.citySlug ?? '') || x.platform.localeCompare(y.platform))
  const env = process.env
  return { accounts: views, global: await autoReplyGlobal(), webhookConfigured: (env.SOCIAL_META_WEBHOOK_VERIFY_TOKEN?.trim().length ?? 0) >= 16 }
}
