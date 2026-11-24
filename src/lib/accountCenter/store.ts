/**
 * Hesap Merkezi — server side (Admin SDK). Every function re-checks that the
 * target belongs to a managed account by EXACT Firebase UID string.
 * Never import from client components.
 */
import 'server-only'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections, VIDEO_FEED_COLLECTION } from '@/lib/firebase/collections'
import { CMS_STAFF_ROLES } from '@/types/cms'
import { resolveCmsRoleFromFirestore } from '@/lib/cmsRoleUtils'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { buildPublicArticleUrl } from '@/lib/social/articleUrl'
import { sensitivityFromDoc } from '@/lib/social/sensitiveNews'
import { draftReply } from '@/lib/social/inbox/ai'
import { decideAuto, istanbulDay, messagingWindow, templateReply, AUTO_MAX_AGE_MS } from '@/lib/social/inbox/model'
import {
  checkReplyText,
  classifyByRules,
  conversationToItem,
  countItems,
  DEFAULT_ACCOUNT_CENTER_SETTINGS,
  isManagedUid,
  isValidDocId,
  isValidUid,
  itemInTab,
  normalizeUsernameQuery,
  notificationToItem,
  parseAccountCenterSettings,
  REPLY_MAX_LENGTH,
  sortItems,
  toMillis,
  withAutoFooter,
  withMention,
  type AccountCenterSettings,
  type AccountCounts,
  type InboxCategory,
  type InboxItem,
  type InboxTab,
} from './model'

export const AC_COLLECTIONS = {
  accounts: 'accountCenterAccounts',
  state: 'accountCenterState',
  replies: 'accountCenterReplies',
} as const

const SYSTEM_ACTOR = 'system:account-center'

export type AcError =
  | 'not_managed'
  | 'not_found'
  | 'not_owner'
  | 'ambiguous'
  | 'staff_account'
  | 'empty'
  | 'foreign_link'
  | 'content_not_found'
  | 'duplicate'
  | 'bad_request'

export type AcResult<T> = ({ ok: true } & T) | { ok: false; code: AcError; status: number }

const fail = (code: AcError, status: number) => ({ ok: false as const, code, status })
const db = (): Firestore => getAdminFirestore()

export interface ManagedAccount {
  uid: string
  username: string
  displayName: string | null
  photoURL: string | null
  addedAt: number
  addedBy: string
}

// ── Managed account registry ─────────────────────────────────────────────────

export async function listManagedAccounts(): Promise<ManagedAccount[]> {
  const snap = await db().collection(AC_COLLECTIONS.accounts).get()
  const out: ManagedAccount[] = []
  for (const d of snap.docs) {
    const x = d.data()
    // The doc id IS the uid; a mismatching stored field is ignored, the id wins.
    if (!isValidUid(d.id)) continue
    out.push({
      uid: d.id,
      username: typeof x.username === 'string' ? x.username : d.id,
      displayName: typeof x.displayName === 'string' ? x.displayName : null,
      photoURL: typeof x.photoURL === 'string' ? x.photoURL : null,
      addedAt: toMillis(x.addedAt),
      addedBy: typeof x.addedBy === 'string' ? x.addedBy : '',
    })
  }
  return out.sort((a, b) => a.username.localeCompare(b.username, 'tr'))
}

async function managedSet(): Promise<Map<string, ManagedAccount>> {
  const list = await listManagedAccounts()
  return new Map(list.map((a) => [a.uid, a]))
}

async function requireManaged(uid: unknown): Promise<ManagedAccount | null> {
  if (!isValidUid(uid)) return null
  const doc = await db().collection(AC_COLLECTIONS.accounts).doc(uid).get()
  if (!doc.exists) return null
  const x = doc.data() ?? {}
  return {
    uid,
    username: typeof x.username === 'string' ? x.username : uid,
    displayName: typeof x.displayName === 'string' ? x.displayName : null,
    photoURL: typeof x.photoURL === 'string' ? x.photoURL : null,
    addedAt: toMillis(x.addedAt),
    addedBy: typeof x.addedBy === 'string' ? x.addedBy : '',
  }
}

/**
 * Add by username (exact, after trimming «@» and lower-casing as usernames are
 * stored) or by exact UID. Staff (CMS role) accounts are refused: their private
 * messages are not a publishing account's inbox.
 */
export async function addManagedAccount(query: unknown, actorUid: string): Promise<AcResult<{ account: ManagedAccount }>> {
  const raw = typeof query === 'string' ? query.trim() : ''
  if (!raw) return fail('bad_request', 400)
  const users = db().collection(Collections.USERS)
  let userDoc: FirebaseFirestore.DocumentSnapshot | null = null
  if (isValidUid(raw) && /^[A-Za-z0-9]{20,128}$/.test(raw)) {
    const byId = await users.doc(raw).get()
    if (byId.exists) userDoc = byId
  }
  if (!userDoc) {
    const username = normalizeUsernameQuery(raw)
    if (!username) return fail('bad_request', 400)
    const snap = await users.where('username', '==', username).limit(2).get()
    if (snap.size > 1) return fail('ambiguous', 409)
    if (snap.empty) return fail('not_found', 404)
    userDoc = snap.docs[0]
  }
  const data = userDoc.data() ?? {}
  const role = resolveCmsRoleFromFirestore(data.role as string | undefined)
  if (CMS_STAFF_ROLES.includes(role)) return fail('staff_account', 403)
  const now = Date.now()
  const account: ManagedAccount = {
    uid: userDoc.id,
    username: typeof data.username === 'string' ? data.username : userDoc.id,
    displayName: typeof data.displayName === 'string' ? data.displayName : null,
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
    addedAt: now,
    addedBy: actorUid,
  }
  await db().collection(AC_COLLECTIONS.accounts).doc(account.uid).set(account)
  await writeSocialAudit({ actorId: actorUid, action: 'account_center.account.add', entityType: 'accountCenter', entityId: account.uid, after: { username: account.username } })
  return { ok: true, account }
}

export async function removeManagedAccount(uid: unknown, actorUid: string): Promise<AcResult<object>> {
  const acc = await requireManaged(uid)
  if (!acc) return fail('not_managed', 404)
  await db().collection(AC_COLLECTIONS.accounts).doc(acc.uid).delete()
  await writeSocialAudit({ actorId: actorUid, action: 'account_center.account.remove', entityType: 'accountCenter', entityId: acc.uid, before: { username: acc.username } })
  return { ok: true }
}

// ── Reading ──────────────────────────────────────────────────────────────────

const UNREAD_NOTIF_LIMIT = 60
const RECENT_NOTIF_LIMIT = 20
const CONV_LIMIT = 20

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

/** Equality-only notification queries (no composite index needed) + the DM list query the app already uses. */
async function readAccountItems(acc: ManagedAccount): Promise<InboxItem[]> {
  const notifs = db().collection(Collections.NOTIFICATIONS)
  const [unread, recent, convs] = await Promise.all([
    notifs.where('userId', '==', acc.uid).where('read', '==', false).limit(UNREAD_NOTIF_LIMIT).get(),
    notifs.where('userId', '==', acc.uid).limit(RECENT_NOTIF_LIMIT).get(),
    db()
      .collection(Collections.CONVERSATIONS)
      .where('participantIds', 'array-contains', acc.uid)
      .orderBy('lastMessageAt', 'desc')
      .limit(CONV_LIMIT)
      .get()
      .catch(() => null),
  ])
  const seen = new Set<string>()
  const items: InboxItem[] = []
  for (const d of [...unread.docs, ...recent.docs]) {
    if (seen.has(d.id)) continue
    seen.add(d.id)
    const it = notificationToItem(d.id, d.data(), acc)
    if (it) items.push(it)
  }
  for (const d of convs?.docs ?? []) {
    const it = conversationToItem(d.id, d.data(), acc)
    if (it) items.push(it)
  }
  return items
}

export interface AccountView extends ManagedAccount {
  counts: AccountCounts
}

export async function getInbox(opts: { uid?: string | null; tab: InboxTab }): Promise<AcResult<{ accounts: AccountView[]; items: InboxItem[] }>> {
  const managed = await listManagedAccounts()
  if (opts.uid && !isManagedUid(opts.uid, managed.map((m) => m.uid))) return fail('not_managed', 404)
  const perAccount = await mapLimit(managed, 6, async (acc) => ({ acc, items: await readAccountItems(acc).catch(() => [] as InboxItem[]) }))
  const accounts: AccountView[] = perAccount.map(({ acc, items }) => ({ ...acc, counts: countItems(items) }))
  const pool = perAccount.filter(({ acc }) => !opts.uid || acc.uid === opts.uid).flatMap(({ items }) => items)
  const items = sortItems(pool.filter((i) => itemInTab(i, opts.tab))).slice(0, 200)
  return { ok: true, accounts, items }
}

async function loadContent(postId: string): Promise<{ collection: string; ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> } | null> {
  if (!isValidDocId(postId)) return null
  const newsRef = db().collection(VIDEO_FEED_COLLECTION).doc(postId)
  const n = await newsRef.get()
  if (n.exists) return { collection: VIDEO_FEED_COLLECTION, ref: newsRef, data: n.data() ?? {} }
  const postRef = db().collection(Collections.POSTS).doc(postId)
  const p = await postRef.get()
  if (p.exists) return { collection: Collections.POSTS, ref: postRef, data: p.data() ?? {} }
  return null
}

function contentSummary(id: string, c: { collection: string; data: Record<string, unknown> }) {
  const d = c.data
  const title = typeof d.title === 'string' && d.title ? d.title : typeof d.content === 'string' ? d.content.slice(0, 140) : ''
  const thumb = [d.thumbnail, d.imageUrl, d.coverImage].find((v) => typeof v === 'string' && v) as string | undefined
  return {
    id,
    collection: c.collection,
    title,
    thumbnail: thumb ?? null,
    url: c.collection === VIDEO_FEED_COLLECTION ? buildPublicArticleUrl(id, d) : null,
    authorId: typeof d.authorId === 'string' ? d.authorId : null,
  }
}

export async function getItemDetail(input: { uid: unknown; key: unknown }): Promise<
  AcResult<{
    item: InboxItem
    content: ReturnType<typeof contentSummary> | null
    messages: Array<{ id: string; fromAccount: boolean; text: string; at: number }>
  }>
> {
  const acc = await requireManaged(input.uid)
  if (!acc) return fail('not_managed', 404)
  const key = typeof input.key === 'string' ? input.key : ''
  const id = key.slice(2)
  if (!isValidDocId(id)) return fail('bad_request', 400)
  if (key.startsWith('n_')) {
    const snap = await db().collection(Collections.NOTIFICATIONS).doc(id).get()
    const item = snap.exists ? notificationToItem(id, snap.data() ?? {}, acc) : null
    if (!item) return fail('not_owner', 404)
    const c = item.postId ? await loadContent(item.postId) : null
    return { ok: true, item, content: c ? contentSummary(item.postId as string, c) : null, messages: [] }
  }
  if (key.startsWith('c_')) {
    const ref = db().collection(Collections.CONVERSATIONS).doc(id)
    const snap = await ref.get()
    const item = snap.exists ? conversationToItem(id, snap.data() ?? {}, acc) : null
    if (!item) return fail('not_owner', 404)
    const ms = await ref.collection(Collections.MESSAGES).orderBy('createdAt', 'desc').limit(50).get()
    const messages = ms.docs
      .filter((m) => m.data().isDeleted !== true)
      .map((m) => {
        const x = m.data()
        return { id: m.id, fromAccount: x.senderId === acc.uid, text: typeof x.text === 'string' ? x.text : '', at: toMillis(x.createdAt) }
      })
      .reverse()
    return { ok: true, item, content: null, messages }
  }
  return fail('bad_request', 400)
}

// ── Replying ─────────────────────────────────────────────────────────────────

export type ReplySource = 'editor' | 'ai_draft' | 'auto'

/** Idempotency: the first call with a request id wins; a retry returns `duplicate`. */
async function claimRequest(requestId: string, meta: Record<string, unknown>): Promise<boolean> {
  try {
    await db().collection(AC_COLLECTIONS.replies).doc(requestId).create({ ...meta, status: 'sending', createdAt: Date.now() })
    return true
  } catch {
    return false
  }
}

export async function replyToComment(input: {
  uid: unknown
  notificationId: unknown
  text: unknown
  requestId: string
  actorUid: string
  source: ReplySource
}): Promise<AcResult<{ commentId: string }>> {
  const acc = await requireManaged(input.uid)
  if (!acc) return fail('not_managed', 404)
  if (!isValidDocId(input.notificationId)) return fail('bad_request', 400)
  const check = checkReplyText(input.text)
  if (!check.ok) return fail(check.code, 400)

  const notifRef = db().collection(Collections.NOTIFICATIONS).doc(input.notificationId)
  const notifSnap = await notifRef.get()
  const item = notifSnap.exists ? notificationToItem(notifSnap.id, notifSnap.data() ?? {}, acc) : null
  if (!item || (item.kind !== 'comment' && item.kind !== 'mention') || !item.postId) return fail('not_owner', 404)
  const content = await loadContent(item.postId)
  if (!content) return fail('content_not_found', 404)

  if (!(await claimRequest(input.requestId, { kind: 'comment', accountUid: acc.uid, targetId: notifSnap.id, actorUid: input.actorUid, source: input.source }))) {
    return fail('duplicate', 409)
  }

  // Fresh profile of the account (username/photo may have changed since it was added).
  const userSnap = await db().collection(Collections.USERS).doc(acc.uid).get()
  const u = userSnap.data() ?? {}
  const username = typeof u.username === 'string' ? u.username : acc.username
  const photo = typeof u.photoURL === 'string' ? u.photoURL : null
  const body = withMention(check.text, item.actorUsername)
  const now = new Date().toISOString()

  const commentRef = await db().collection(Collections.COMMENTS).add({
    postId: item.postId,
    parentId: null,
    authorId: acc.uid,
    authorUsername: username,
    authorPhotoURL: photo,
    content: body,
    likesCount: 0,
    repliesCount: 0,
    isEdited: false,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  })
  await content.ref.update(content.collection === VIDEO_FEED_COLLECTION ? { commentCount: FieldValue.increment(1) } : { commentsCount: FieldValue.increment(1) })

  // Notify the commenter like an @mention in the app would.
  if (item.actorUid && item.actorUid !== acc.uid) {
    const n: Record<string, unknown> = { userId: item.actorUid, type: 'mention', read: false, createdAt: now, actorId: acc.uid, actorUsername: username, postId: item.postId, commentId: commentRef.id, text: body.slice(0, 140) }
    if (typeof u.displayName === 'string' && u.displayName) n.actorDisplayName = u.displayName
    if (photo) n.actorPhotoURL = photo
    await db().collection(Collections.NOTIFICATIONS).add(n).catch(() => undefined)
  }

  await notifRef.update({ read: true, accountCenterRepliedAt: Date.now(), accountCenterReplyId: commentRef.id })
  await db().collection(AC_COLLECTIONS.replies).doc(input.requestId).update({ status: 'sent', resultId: commentRef.id, sentAt: Date.now() })
  await writeSocialAudit({
    actorId: input.actorUid,
    actorType: input.source === 'auto' ? 'SYSTEM' : 'HUMAN',
    action: 'account_center.reply',
    entityType: 'accountCenter',
    entityId: commentRef.id,
    after: { kind: 'comment', accountUid: acc.uid, account: acc.username, postId: item.postId, source: input.source, length: body.length },
  })
  return { ok: true, commentId: commentRef.id }
}

export async function replyToConversation(input: {
  uid: unknown
  conversationId: unknown
  text: unknown
  requestId: string
  actorUid: string
  source: ReplySource
}): Promise<AcResult<{ messageId: string }>> {
  const acc = await requireManaged(input.uid)
  if (!acc) return fail('not_managed', 404)
  if (!isValidDocId(input.conversationId)) return fail('bad_request', 400)
  const check = checkReplyText(input.text)
  if (!check.ok) return fail(check.code, 400)

  const convRef = db().collection(Collections.CONVERSATIONS).doc(input.conversationId)
  const convSnap = await convRef.get()
  const item = convSnap.exists ? conversationToItem(convSnap.id, convSnap.data() ?? {}, acc) : null
  if (!item || !item.actorUid) return fail('not_owner', 404)

  if (!(await claimRequest(input.requestId, { kind: 'message', accountUid: acc.uid, targetId: convSnap.id, actorUid: input.actorUid, source: input.source }))) {
    return fail('duplicate', 409)
  }
  const now = new Date().toISOString()
  // The message looks exactly like one sent from the app; the staff identity lives only in the audit log.
  const msgRef = await convRef.collection(Collections.MESSAGES).add({ senderId: acc.uid, text: check.text, type: 'text', mediaUrl: null, createdAt: now, isDeleted: false })
  await convRef.update({
    lastMessageText: check.text,
    lastMessageAt: now,
    lastMessageSenderId: acc.uid,
    updatedAt: now,
    [`unreadCount.${item.actorUid}`]: FieldValue.increment(1),
    [`unreadCount.${acc.uid}`]: 0,
    status: 'active',
  })
  await db().collection(AC_COLLECTIONS.replies).doc(input.requestId).update({ status: 'sent', resultId: msgRef.id, sentAt: Date.now() })
  await writeSocialAudit({
    actorId: input.actorUid,
    actorType: input.source === 'auto' ? 'SYSTEM' : 'HUMAN',
    action: 'account_center.reply',
    entityType: 'accountCenter',
    entityId: convSnap.id,
    after: { kind: 'message', accountUid: acc.uid, account: acc.username, source: input.source, length: check.text.length },
  })
  return { ok: true, messageId: msgRef.id }
}

/** Mark items read for the account (exact ownership checked per item). */
export async function markRead(input: { uid: unknown; keys: unknown }): Promise<AcResult<{ updated: number }>> {
  const acc = await requireManaged(input.uid)
  if (!acc) return fail('not_managed', 404)
  const keys = Array.isArray(input.keys) ? (input.keys as unknown[]).filter((k): k is string => typeof k === 'string').slice(0, 200) : []
  let updated = 0
  for (const key of keys) {
    const id = key.slice(2)
    if (!isValidDocId(id)) continue
    if (key.startsWith('n_')) {
      const ref = db().collection(Collections.NOTIFICATIONS).doc(id)
      const s = await ref.get()
      if (s.exists && s.data()?.userId === acc.uid && s.data()?.read !== true) {
        await ref.update({ read: true })
        updated++
      }
    } else if (key.startsWith('c_')) {
      const ref = db().collection(Collections.CONVERSATIONS).doc(id)
      const s = await ref.get()
      const ids = (s.data()?.participantIds as unknown[] | undefined) ?? []
      if (s.exists && ids.some((x) => x === acc.uid)) {
        await ref.update({ [`unreadCount.${acc.uid}`]: 0 })
        updated++
      }
    }
  }
  return { ok: true, updated }
}

// ── Posts (Aşama 3) ──────────────────────────────────────────────────────────

export interface PostView {
  id: string
  collection: string
  title: string
  thumbnail: string | null
  url: string | null
  at: number
  commentCount: number
}

export async function listPosts(uid: unknown): Promise<AcResult<{ posts: PostView[] }>> {
  const acc = await requireManaged(uid)
  if (!acc) return fail('not_managed', 404)
  const [news, posts] = await Promise.all([
    db().collection(VIDEO_FEED_COLLECTION).where('status', '==', 'published').where('authorId', '==', acc.uid).orderBy('publishedAt', 'desc').limit(20).get().catch(() => null),
    db().collection(Collections.POSTS).where('authorId', '==', acc.uid).orderBy('createdAt', 'desc').limit(20).get().catch(() => null),
  ])
  const out: PostView[] = []
  for (const d of news?.docs ?? []) {
    const s = contentSummary(d.id, { collection: VIDEO_FEED_COLLECTION, data: d.data() })
    out.push({ id: d.id, collection: VIDEO_FEED_COLLECTION, title: s.title, thumbnail: s.thumbnail, url: s.url, at: toMillis(d.data().publishedAt), commentCount: Number(d.data().commentCount ?? 0) || 0 })
  }
  for (const d of posts?.docs ?? []) {
    const s = contentSummary(d.id, { collection: Collections.POSTS, data: d.data() })
    out.push({ id: d.id, collection: Collections.POSTS, title: s.title, thumbnail: s.thumbnail, url: null, at: toMillis(d.data().createdAt), commentCount: Number(d.data().commentsCount ?? 0) || 0 })
  }
  return { ok: true, posts: out.sort((a, b) => b.at - a.at).slice(0, 30) }
}

export interface CommentView {
  id: string
  authorId: string
  authorUsername: string
  text: string
  at: number
  hidden: boolean
  fromAccount: boolean
  category: InboxCategory
}

export async function listPostComments(input: { uid: unknown; postId: unknown }): Promise<AcResult<{ comments: CommentView[] }>> {
  const acc = await requireManaged(input.uid)
  if (!acc) return fail('not_managed', 404)
  if (!isValidDocId(input.postId)) return fail('bad_request', 400)
  const content = await loadContent(input.postId)
  if (!content) return fail('content_not_found', 404)
  if (content.data.authorId !== acc.uid) return fail('not_owner', 403)
  const snap = await db().collection(Collections.COMMENTS).where('postId', '==', input.postId).orderBy('createdAt', 'desc').limit(100).get()
  const comments: CommentView[] = []
  for (const d of snap.docs) {
    const x = d.data()
    const hiddenByUs = x.hiddenByAccountCenter === true
    if (x.isDeleted === true && !hiddenByUs) continue // deleted by its author — not ours to show
    const text = typeof x.content === 'string' ? x.content : ''
    comments.push({
      id: d.id,
      authorId: typeof x.authorId === 'string' ? x.authorId : '',
      authorUsername: typeof x.authorUsername === 'string' ? x.authorUsername : '',
      text,
      at: toMillis(x.createdAt),
      hidden: x.isDeleted === true && hiddenByUs,
      fromAccount: x.authorId === acc.uid,
      category: classifyByRules(text),
    })
  }
  return { ok: true, comments }
}

/** Hide / restore a comment on content owned by a managed account. Only comments hidden here can be restored. */
export async function setCommentHidden(input: { uid: unknown; commentId: unknown; hidden: unknown; actorUid: string }): Promise<AcResult<{ hidden: boolean }>> {
  const acc = await requireManaged(input.uid)
  if (!acc) return fail('not_managed', 404)
  if (!isValidDocId(input.commentId) || typeof input.hidden !== 'boolean') return fail('bad_request', 400)
  const ref = db().collection(Collections.COMMENTS).doc(input.commentId)
  const snap = await ref.get()
  if (!snap.exists) return fail('not_found', 404)
  const c = snap.data() ?? {}
  if (typeof c.postId !== 'string') return fail('content_not_found', 404)
  const content = await loadContent(c.postId)
  if (!content || content.data.authorId !== acc.uid) return fail('not_owner', 403)
  const isHidden = c.isDeleted === true && c.hiddenByAccountCenter === true
  if (input.hidden === isHidden) return { ok: true, hidden: isHidden }
  if (!input.hidden && c.hiddenByAccountCenter !== true) return fail('not_owner', 403)
  if (input.hidden && c.isDeleted === true) return fail('not_found', 404)
  const field = content.collection === VIDEO_FEED_COLLECTION ? 'commentCount' : 'commentsCount'
  if (input.hidden) {
    await ref.update({ isDeleted: true, hiddenByAccountCenter: true, hiddenAt: Date.now() })
    await content.ref.update({ [field]: FieldValue.increment(-1) })
  } else {
    await ref.update({ isDeleted: false, hiddenByAccountCenter: FieldValue.delete(), hiddenAt: FieldValue.delete() })
    await content.ref.update({ [field]: FieldValue.increment(1) })
  }
  await writeSocialAudit({ actorId: input.actorUid, action: 'account_center.hide', entityType: 'accountCenter', entityId: snap.id, after: { hidden: input.hidden, accountUid: acc.uid, postId: c.postId } })
  return { ok: true, hidden: input.hidden }
}

// ── AI drafts (on demand, manual editor lane — MANUAL_EDITOR_AI_ENABLED gate) ─

export async function draftFor(input: { uid: unknown; key: unknown }): Promise<
  AcResult<{ text: string | null; source: 'ai' | 'template' | null; category: InboxCategory; needsHuman: boolean; reason: string }>
> {
  const detail = await getItemDetail(input)
  if (!detail.ok) return detail
  const { item, content, messages } = detail
  const text = item.kind === 'message' ? [...messages].reverse().find((m) => !m.fromAccount)?.text ?? item.text ?? '' : item.text ?? ''
  if (!text.trim()) return fail('empty', 400)
  const ai = await draftReply({
    kind: item.kind === 'message' ? 'dm' : 'comment',
    platform: 'nahaber',
    text,
    newsTitle: content?.title || null,
    newsUrl: content?.url ?? null,
    history: item.kind === 'message' ? messages.slice(-6).map((m) => ({ direction: m.fromAccount ? ('out' as const) : ('in' as const), text: m.text })) : undefined,
    lane: 'manual_editor',
    maxLength: REPLY_MAX_LENGTH,
  })
  if (ai.text) return { ok: true, text: ai.text, source: 'ai', category: ai.category, needsHuman: ai.needsHuman, reason: ai.reason }
  const t = templateReply(ai.category, { newsUrl: content?.url ?? null, kind: item.kind === 'message' ? 'dm' : 'comment' })
  return { ok: true, text: t, source: t ? 'template' : null, category: ai.category, needsHuman: ai.needsHuman, reason: ai.reason }
}

// ── Settings / global switch ─────────────────────────────────────────────────

export async function getSettings(): Promise<AccountCenterSettings> {
  const s = await db().collection(AC_COLLECTIONS.state).doc('settings').get().catch(() => null)
  return s?.exists ? parseAccountCenterSettings(s.data(), { ...DEFAULT_ACCOUNT_CENTER_SETTINGS, updatedAt: toMillis(s.data()?.updatedAt) || null, updatedBy: (s.data()?.updatedBy as string) ?? null }) : DEFAULT_ACCOUNT_CENTER_SETTINGS
}

export async function saveSettings(patch: unknown, actorUid: string): Promise<AccountCenterSettings> {
  const before = await getSettings()
  const next = { ...parseAccountCenterSettings(patch, before), updatedAt: Date.now(), updatedBy: actorUid }
  await db().collection(AC_COLLECTIONS.state).doc('settings').set(next)
  await writeSocialAudit({
    actorId: actorUid,
    action: 'account_center.settings',
    entityType: 'accountCenter',
    entityId: 'settings',
    before: { commentMode: before.commentMode, dmMode: before.dmMode, autoCategories: before.autoCategories, dailyLimit: before.dailyLimit, minIntervalSec: before.minIntervalSec, paused: before.paused },
    after: { commentMode: next.commentMode, dmMode: next.dmMode, autoCategories: next.autoCategories, dailyLimit: next.dailyLimit, minIntervalSec: next.minIntervalSec, paused: next.paused },
  })
  return next
}

/** Env `ACCOUNT_CENTER_AUTO_REPLY=on` is the gate (default off); the panel can only pause, never open it. */
export function autoReplyEnvEnabled(): boolean {
  return process.env.ACCOUNT_CENTER_AUTO_REPLY?.trim().toLowerCase() === 'on'
}

// ── Auto-reply tick (called from the existing 5-min social cron) ─────────────

export interface AcTickReport {
  enabled: boolean
  evaluated: number
  replied: number
  errors: number
}

interface Counter {
  count: number
  lastAt: number | null
  authors: string[]
}

export async function runAccountCenterTick(now: () => number, opts: { deadline: number }): Promise<AcTickReport> {
  const report: AcTickReport = { enabled: false, evaluated: 0, replied: 0, errors: 0 }
  if (!autoReplyEnvEnabled()) return report
  const settings = await getSettings()
  if (settings.paused || (settings.commentMode !== 'auto' && settings.dmMode !== 'auto')) return report
  report.enabled = true
  const accounts = await listManagedAccounts()
  const state = db().collection(AC_COLLECTIONS.state)

  for (const acc of accounts) {
    if (now() > opts.deadline) break
    const counterRef = state.doc(`auto_${acc.uid}_${istanbulDay(now())}`)
    const cs = await counterRef.get()
    const counter: Counter = cs.exists
      ? { count: Number(cs.data()?.count ?? 0), lastAt: (cs.data()?.lastAt as number | null) ?? null, authors: (cs.data()?.authors as string[]) ?? [] }
      : { count: 0, lastAt: null, authors: [] }
    const bump = async (author: string | null) => {
      counter.count++
      counter.lastAt = now()
      if (author) counter.authors.push(author)
      await counterRef.set({ count: counter.count, lastAt: counter.lastAt, authors: counter.authors.slice(-200) })
    }

    let items: InboxItem[] = []
    try {
      items = await readAccountItems(acc)
    } catch {
      report.errors++
      continue
    }

    for (const it of items) {
      if (now() > opts.deadline) break
      if (!it.needsAnswer || !it.text) continue
      if (now() - it.at > AUTO_MAX_AGE_MS) continue
      const isMsg = it.kind === 'message'
      if (isMsg ? settings.dmMode !== 'auto' : settings.commentMode !== 'auto') continue
      // Evaluate each inbound item once.
      const markKey = isMsg ? `chk_c_${it.targetId}_${it.at}` : `chk_n_${it.targetId}`
      const markRef = state.doc(markKey)
      try {
        await markRef.create({ at: now() })
      } catch {
        continue
      }
      report.evaluated++
      let sensitivity = 0
      let newsUrl: string | null = null
      if (!isMsg && it.postId) {
        const c = await loadContent(it.postId).catch(() => null)
        if (c) {
          sensitivity = sensitivityFromDoc(c.data).level
          newsUrl = c.collection === VIDEO_FEED_COLLECTION ? buildPublicArticleUrl(it.postId, c.data) : null
        }
      }
      const category = it.category ?? classifyByRules(it.text)
      const decision = decideAuto({
        kind: isMsg ? 'dm' : 'comment',
        category,
        settings,
        globalEnabled: true,
        newsSensitivity: sensitivity,
        ownAccount: it.actorUid === acc.uid,
        canReply: true,
        itemAt: it.at,
        now: now(),
        counter,
        authorKey: it.actorUid,
        window: isMsg ? messagingWindow(it.at, now()) : undefined,
      })
      if (decision.action !== 'reply') continue
      const template = templateReply(category, { newsUrl, kind: isMsg ? 'dm' : 'comment' })
      if (!template) continue
      const requestId = `auto_${markKey}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
      try {
        const r = isMsg
          ? await replyToConversation({ uid: acc.uid, conversationId: it.targetId, text: withAutoFooter(template), requestId, actorUid: SYSTEM_ACTOR, source: 'auto' })
          : await replyToComment({ uid: acc.uid, notificationId: it.targetId, text: withAutoFooter(template), requestId, actorUid: SYSTEM_ACTOR, source: 'auto' })
        if (r.ok) {
          report.replied++
          await bump(it.actorUid)
        }
      } catch {
        report.errors++
      }
    }
  }
  return report
}
