/**
 * Hesap Merkezi (pure, browser-safe): NaHaber's own in-app accounts
 * (istanbul.nahaber, bursa.nahaber …) managed from one admin screen.
 *
 * Identity rules (security):
 *   - A managed account is identified ONLY by its exact Firebase UID string,
 *     taken from the `users/{uid}` document id. No fuzzy, case-folded,
 *     prefix or username-pattern matching ever grants access.
 *   - Every server action re-checks that the target item belongs to that exact
 *     UID (notification.userId === uid, uid ∈ conversation.participantIds …).
 *
 * Auto replies reuse the social inbox rules (./social/inbox/model): only the
 * safe categories, only fixed templates (never AI text), behind an env switch
 * that is OFF by default.
 */
import {
  classifyByRules,
  cleanReplyText,
  CATEGORY_TR,
  DEFAULT_INBOX_SETTINGS,
  hasForeignLink,
  isAutoSafe,
  parseInboxSettings,
  type InboxCategory,
  type InboxSettings,
} from '@/lib/social/inbox/model'

export { CATEGORY_TR, classifyByRules, isAutoSafe }
export type { InboxCategory }

/** Same limit as a normal NaHaber comment / message would accept. */
export const REPLY_MAX_LENGTH = 1000

/** Footer added to every automatic (template) reply so readers know it is automated. */
export const AUTO_REPLY_FOOTER = '— NaHaber otomatik cevap'

/** Firebase Auth UIDs: 1–128 chars, no slash (Firestore doc id). Exact string, never normalised. */
export function isValidUid(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 128 && !/[/\s]/.test(v)
}

/** Firestore auto ids / our deterministic ids. */
export function isValidDocId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(v)
}

/** Client request id for idempotent replies (double click / retry never posts twice). */
export function isValidRequestId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v)
}

/** Username as typed by the admin → lookup key (`@Bursa.NaHaber ` → `bursa.nahaber`). */
export function normalizeUsernameQuery(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/^@+/, '').toLocaleLowerCase('tr-TR').slice(0, 64)
}

/** Exact membership check — the ONLY way a UID is treated as managed. */
export function isManagedUid(uid: string, managed: ReadonlySet<string> | readonly string[]): boolean {
  if (!isValidUid(uid)) return false
  return Array.isArray(managed) ? managed.includes(uid) : (managed as ReadonlySet<string>).has(uid)
}

export type ReplyCheck = { ok: true; text: string } | { ok: false; code: 'empty' | 'foreign_link' }

/** Plain text, bounded, no links to other sites (same rule as the social inbox). */
export function checkReplyText(raw: unknown): ReplyCheck {
  const text = cleanReplyText(raw, REPLY_MAX_LENGTH)
  if (!text) return { ok: false, code: 'empty' }
  if (hasForeignLink(text)) return { ok: false, code: 'foreign_link' }
  return { ok: true, text }
}

/** NaHaber comments are flat; a reply addresses the commenter like the app does. */
export function withMention(text: string, username: string | null): string {
  const u = (username ?? '').trim().replace(/^@+/, '')
  if (!u || !/^[a-z0-9_.]{1,64}$/i.test(u)) return text
  return text.toLocaleLowerCase('tr-TR').startsWith(`@${u.toLocaleLowerCase('tr-TR')}`) ? text : `@${u} ${text}`
}

// ── Inbox items ──────────────────────────────────────────────────────────────

export type InboxItemKind = 'comment' | 'mention' | 'message' | 'like' | 'follow' | 'system'
export type InboxTab = 'pending' | 'messages' | 'comments' | 'activity'

export interface InboxItem {
  /** `n_<notificationId>` or `c_<conversationId>` */
  key: string
  kind: InboxItemKind
  accountUid: string
  accountUsername: string
  /** notification id or conversation id */
  targetId: string
  actorUid: string | null
  actorUsername: string | null
  actorName: string | null
  actorPhotoURL: string | null
  text: string | null
  postId: string | null
  commentId: string | null
  at: number
  unread: boolean
  /** true = the account still owes an answer */
  needsAnswer: boolean
  category: InboxCategory | null
  repliedAt: number | null
}

export function toMillis(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isFinite(t) ? t : 0
  }
  if (v && typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    try {
      return (v as { toMillis: () => number }).toMillis()
    } catch {
      return 0
    }
  }
  return 0
}

const NOTIF_KINDS: Record<string, InboxItemKind> = { comment: 'comment', mention: 'mention', like: 'like', follow: 'follow', system: 'system' }

/** Notification doc → inbox item; null when it does not belong to `accountUid` (exact). */
export function notificationToItem(id: string, d: Record<string, unknown>, account: { uid: string; username: string }): InboxItem | null {
  if (d.userId !== account.uid) return null
  const kind = NOTIF_KINDS[String(d.type)] ?? 'system'
  const text = typeof d.text === 'string' ? d.text : null
  const repliedAt = toMillis(d.accountCenterRepliedAt) || null
  const answerable = kind === 'comment' || kind === 'mention'
  return {
    key: `n_${id}`,
    kind,
    accountUid: account.uid,
    accountUsername: account.username,
    targetId: id,
    actorUid: typeof d.actorId === 'string' ? d.actorId : null,
    actorUsername: typeof d.actorUsername === 'string' ? d.actorUsername : null,
    actorName: typeof d.actorDisplayName === 'string' ? d.actorDisplayName : null,
    actorPhotoURL: typeof d.actorPhotoURL === 'string' ? d.actorPhotoURL : null,
    text,
    postId: typeof d.postId === 'string' ? d.postId : null,
    commentId: typeof d.commentId === 'string' ? d.commentId : null,
    at: toMillis(d.createdAt),
    unread: d.read !== true,
    needsAnswer: answerable && !repliedAt && d.read !== true,
    category: answerable && text ? classifyByRules(text) : null,
    repliedAt,
  }
}

/** Conversation doc → inbox item; null when `accountUid` is not an exact participant. */
export function conversationToItem(id: string, d: Record<string, unknown>, account: { uid: string; username: string }): InboxItem | null {
  const ids = Array.isArray(d.participantIds) ? (d.participantIds as unknown[]) : []
  if (!ids.some((x) => x === account.uid)) return null
  const otherUid = (ids.find((x) => typeof x === 'string' && x !== account.uid) as string | undefined) ?? null
  const parts = (d.participants && typeof d.participants === 'object' ? d.participants : {}) as Record<string, Record<string, unknown>>
  const other = otherUid ? parts[otherUid] ?? {} : {}
  const unreadMap = (d.unreadCount && typeof d.unreadCount === 'object' ? d.unreadCount : {}) as Record<string, unknown>
  const unread = Number(unreadMap[account.uid] ?? 0) > 0
  const lastSender = typeof d.lastMessageSenderId === 'string' ? d.lastMessageSenderId : null
  const text = typeof d.lastMessageText === 'string' ? d.lastMessageText : null
  const inbound = lastSender !== null && lastSender !== account.uid
  return {
    key: `c_${id}`,
    kind: 'message',
    accountUid: account.uid,
    accountUsername: account.username,
    targetId: id,
    actorUid: otherUid,
    actorUsername: typeof other.username === 'string' ? other.username : null,
    actorName: typeof other.displayName === 'string' ? other.displayName : null,
    actorPhotoURL: typeof other.photoURL === 'string' ? other.photoURL : null,
    text,
    postId: null,
    commentId: null,
    at: toMillis(d.lastMessageAt),
    unread,
    needsAnswer: inbound,
    category: inbound && text ? classifyByRules(text) : null,
    repliedAt: null,
  }
}

export function itemInTab(item: InboxItem, tab: InboxTab): boolean {
  if (tab === 'pending') return item.needsAnswer
  if (tab === 'messages') return item.kind === 'message'
  if (tab === 'comments') return item.kind === 'comment' || item.kind === 'mention'
  return item.kind === 'like' || item.kind === 'follow' || item.kind === 'system'
}

/** Newest first; pending items of sensitive categories are not reordered — the list stays chronological. */
export function sortItems(items: InboxItem[]): InboxItem[] {
  return [...items].sort((a, b) => b.at - a.at || a.key.localeCompare(b.key))
}

export interface AccountCounts {
  pendingComments: number
  unreadMessages: number
  activity: number
}

export function countItems(items: InboxItem[]): AccountCounts {
  let pendingComments = 0
  let unreadMessages = 0
  let activity = 0
  for (const i of items) {
    if ((i.kind === 'comment' || i.kind === 'mention') && i.needsAnswer) pendingComments++
    else if (i.kind === 'message' && i.needsAnswer) unreadMessages++
    else if ((i.kind === 'like' || i.kind === 'follow' || i.kind === 'system') && i.unread) activity++
  }
  return { pendingComments, unreadMessages, activity }
}

// ── Assistant settings (global for all managed accounts) ─────────────────────

export type AccountCenterSettings = InboxSettings

/** Default: everything OFF. Opening the gate is an explicit admin action. */
export const DEFAULT_ACCOUNT_CENTER_SETTINGS: AccountCenterSettings = { ...DEFAULT_INBOX_SETTINGS, commentMode: 'off', dmMode: 'off' }

export function parseAccountCenterSettings(raw: unknown, prev: AccountCenterSettings = DEFAULT_ACCOUNT_CENTER_SETTINGS): AccountCenterSettings {
  return parseInboxSettings(raw, prev)
}

/** Template text + visible automation footer. */
export function withAutoFooter(text: string): string {
  return `${text}\n${AUTO_REPLY_FOOTER}`
}
