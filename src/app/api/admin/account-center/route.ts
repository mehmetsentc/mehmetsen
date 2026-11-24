/**
 * Hesap Merkezi API — super admin only.
 * GET  ?view=inbox|detail|posts|comments|settings
 * POST { action: 'add_account' | 'remove_account' | 'reply' | 'read' | 'draft' | 'hide' | 'settings' | 'pause' }
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { isManualEditorAiEnabled } from '@/services/crawler/automatedAiPolicy'
import { isValidRequestId, type InboxTab } from '@/lib/accountCenter/model'
import {
  addManagedAccount,
  autoReplyEnvEnabled,
  draftFor,
  getInbox,
  getItemDetail,
  getSettings,
  listPostComments,
  listPosts,
  markRead,
  removeManagedAccount,
  replyToComment,
  replyToConversation,
  saveSettings,
  setCommentHidden,
  type AcResult,
} from '@/lib/accountCenter/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store' }
const TABS: InboxTab[] = ['pending', 'messages', 'comments', 'activity']

async function requireSuperAdmin(request: Request) {
  const ctx = await verifyCmsToken(request)
  return ctx && ctx.role === 'super_admin' ? ctx : null
}

function send<T extends object>(r: AcResult<T>) {
  if (!r.ok) return NextResponse.json({ error: r.code }, { status: r.status, headers: NO_STORE })
  return NextResponse.json(r, { headers: NO_STORE })
}

function aiDraftsEnabled(): boolean {
  return isManualEditorAiEnabled()
}

export async function GET(request: Request) {
  const ctx = await requireSuperAdmin(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  const url = new URL(request.url)
  const view = url.searchParams.get('view') ?? 'inbox'
  const uid = url.searchParams.get('uid')
  try {
    if (view === 'inbox') {
      const tabParam = url.searchParams.get('tab') as InboxTab
      const tab = TABS.includes(tabParam) ? tabParam : 'pending'
      return send(await getInbox({ uid: uid || null, tab }))
    }
    if (view === 'detail') return send(await getItemDetail({ uid, key: url.searchParams.get('key') }))
    if (view === 'posts') return send(await listPosts(uid))
    if (view === 'comments') return send(await listPostComments({ uid, postId: url.searchParams.get('postId') }))
    if (view === 'settings') {
      return NextResponse.json({ ok: true, settings: await getSettings(), autoEnv: autoReplyEnvEnabled(), aiDrafts: aiDraftsEnabled() }, { headers: NO_STORE })
    }
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE })
  } catch (err) {
    console.error('[account-center] GET failed:', view, err instanceof Error ? err.name : 'error')
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE })
  }
}

export async function POST(request: Request) {
  const ctx = await requireSuperAdmin(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE })
  }
  const action = body.action
  try {
    if (action === 'add_account') return send(await addManagedAccount(body.query, ctx.uid))
    if (action === 'remove_account') return send(await removeManagedAccount(body.uid, ctx.uid))
    if (action === 'read') return send(await markRead({ uid: body.uid, keys: body.keys }))
    if (action === 'draft') return send(await draftFor({ uid: body.uid, key: body.key }))
    if (action === 'hide') return send(await setCommentHidden({ uid: body.uid, commentId: body.commentId, hidden: body.hidden, actorUid: ctx.uid }))
    if (action === 'reply') {
      if (!isValidRequestId(body.requestId)) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE })
      const source = body.source === 'ai_draft' ? 'ai_draft' : 'editor'
      const key = typeof body.key === 'string' ? body.key : ''
      if (key.startsWith('n_')) {
        return send(await replyToComment({ uid: body.uid, notificationId: key.slice(2), text: body.text, requestId: body.requestId, actorUid: ctx.uid, source }))
      }
      if (key.startsWith('c_')) {
        return send(await replyToConversation({ uid: body.uid, conversationId: key.slice(2), text: body.text, requestId: body.requestId, actorUid: ctx.uid, source }))
      }
      return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE })
    }
    if (action === 'settings') {
      return NextResponse.json({ ok: true, settings: await saveSettings(body.settings, ctx.uid), autoEnv: autoReplyEnvEnabled() }, { headers: NO_STORE })
    }
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE })
  } catch (err) {
    console.error('[account-center] POST failed:', String(action), err instanceof Error ? err.name : 'error')
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE })
  }
}
