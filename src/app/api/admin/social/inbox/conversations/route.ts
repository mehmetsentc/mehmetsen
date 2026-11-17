/**
 * GET  /api/admin/social/inbox/conversations?status=open|done|all
 * GET  /api/admin/social/inbox/conversations?id=<conversationId>   (messages, marks read)
 * POST /api/admin/social/inbox/conversations
 *   { action: 'reply', id, text, requestId, source?, acceptUncertain? }
 *   { action: 'draft' | 'done' | 'reopen', id }
 *   { action: 'ack_uncertain', id, resolution }
 *
 * Direct messages contain personal data: central social managers only,
 * no-store responses, nothing logged.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import {
  acknowledgeUncertain,
  draftForConversation,
  getConversation,
  isValidRequestId,
  listConversations,
  replyToConversationFromPanel,
  setConversationStatus,
} from '@/lib/social/inbox/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ID_RE = /^[a-z]+_[0-9]{1,40}__[A-Za-z0-9_-]{1,80}$/

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const sp = new URL(request.url).searchParams
  const id = sp.get('id')
  if (id) {
    if (!ID_RE.test(id)) return json({ error: 'Geçersiz konuşma', code: 'invalid_id' }, 400)
    const c = await getConversation(id)
    return c ? json(c) : json({ error: 'Bulunamadı', code: 'not_found' }, 404)
  }
  const raw = sp.get('status')
  const status = raw === 'done' || raw === 'all' ? raw : 'open'
  return json({ status, conversations: await listConversations({ status }) })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const b = await readJsonBody(request)
  const id = typeof b.id === 'string' && ID_RE.test(b.id) ? b.id : null
  if (!id) return json({ error: 'Geçersiz konuşma', code: 'invalid_id' }, 400)
  const now = Date.now()
  switch (b.action) {
    case 'reply': {
      if (!isValidRequestId(b.requestId)) return json({ error: 'Geçersiz istek', code: 'invalid_request_id' }, 400)
      const r = await replyToConversationFromPanel({ conversationId: id, text: b.text, source: b.source === 'ai_draft' ? 'ai_draft' : 'editor', actorUid: auth.ctx.uid, requestId: b.requestId, acceptUncertain: b.acceptUncertain === true, now })
      return r.ok ? json(r) : json({ error: r.code, code: r.code, replyId: r.replyId ?? null }, r.status)
    }
    case 'draft': {
      const r = await draftForConversation(id, now)
      return r.ok ? json(r) : json({ error: r.code, code: r.code }, r.status)
    }
    case 'done':
    case 'reopen': {
      const ok = await setConversationStatus(id, b.action === 'done' ? 'done' : 'open')
      return ok ? json({ ok }) : json({ error: 'Bulunamadı', code: 'not_found' }, 404)
    }
    case 'ack_uncertain': {
      if (b.resolution !== 'sent' && b.resolution !== 'not_sent') return json({ error: 'Geçersiz seçim', code: 'invalid_resolution' }, 400)
      const r = await acknowledgeUncertain('dm', id, b.resolution, auth.ctx.uid, now)
      return json(r, r.ok ? 200 : 409)
    }
    default:
      return json({ error: 'Geçersiz işlem', code: 'invalid_action' }, 400)
  }
}
