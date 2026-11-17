/**
 * POST /api/admin/social/inbox/comments
 *   { action: 'reply', id, text, requestId, source?: 'editor'|'ai_draft', acceptUncertain? }
 *   { action: 'hide' | 'unhide', id }
 *   { action: 'draft', id }
 *   { action: 'ack_uncertain', id, resolution: 'sent'|'not_sent' }
 *
 * Central social managers only (same rule as comment moderation); same-origin;
 * every platform action is audited without texts.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { acknowledgeUncertain, draftForComment, hideCommentFromPanel, isValidRequestId, replyToCommentFromPanel } from '@/lib/social/inbox/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ID_RE = /^[a-z]+_[A-Za-z0-9_-]{1,120}$/

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const b = await readJsonBody(request)
  const id = typeof b.id === 'string' && ID_RE.test(b.id) ? b.id : null
  if (!id) return json({ error: 'Geçersiz yorum', code: 'invalid_id' }, 400)
  const now = Date.now()
  switch (b.action) {
    case 'reply': {
      if (!isValidRequestId(b.requestId)) return json({ error: 'Geçersiz istek', code: 'invalid_request_id' }, 400)
      const r = await replyToCommentFromPanel({ commentDocId: id, text: b.text, source: b.source === 'ai_draft' ? 'ai_draft' : 'editor', actorUid: auth.ctx.uid, requestId: b.requestId, acceptUncertain: b.acceptUncertain === true, now })
      return r.ok ? json(r) : json({ error: r.code, code: r.code, replyId: r.replyId ?? null }, r.status)
    }
    case 'hide':
    case 'unhide': {
      const r = await hideCommentFromPanel({ commentDocId: id, hidden: b.action === 'hide', actorUid: auth.ctx.uid, now })
      return r.ok ? json(r) : json({ error: r.code, code: r.code }, r.status)
    }
    case 'draft': {
      const r = await draftForComment(id, now)
      return r.ok ? json(r) : json({ error: r.code, code: r.code }, r.status)
    }
    case 'ack_uncertain': {
      if (b.resolution !== 'sent' && b.resolution !== 'not_sent') return json({ error: 'Geçersiz seçim', code: 'invalid_resolution' }, 400)
      const r = await acknowledgeUncertain('comment', id, b.resolution, auth.ctx.uid, now)
      return json(r, r.ok ? 200 : 409)
    }
    default:
      return json({ error: 'Geçersiz işlem', code: 'invalid_action' }, 400)
  }
}
