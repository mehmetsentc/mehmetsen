/**
 * GET  /api/admin/social/comments?status=pending|approved|rejected|removed
 * POST /api/admin/social/comments  { ids: string[], action: 'approve' | 'reject' }
 *
 * Moderation of comments read from Facebook / Instagram / Threads / YouTube.
 * A comment is shown on NaHaber only after an editor approves it. Central
 * social-account managers only; same-origin for changes; audited (ids only).
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { countPendingComments, listCommentsForModeration, moderateComments, MODERATION_BATCH_MAX, type CommentStatus } from '@/lib/social/engagement/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUSES: CommentStatus[] = ['pending', 'approved', 'rejected', 'removed']
const ID_RE = /^[a-z]+_[A-Za-z0-9_-]{1,120}$/

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const raw = new URL(request.url).searchParams.get('status') ?? 'pending'
  const status = (STATUSES as string[]).includes(raw) ? (raw as CommentStatus) : 'pending'
  const [comments, pending] = await Promise.all([listCommentsForModeration(status), status === 'pending' ? Promise.resolve(null) : countPendingComments()])
  return json({ status, comments, pendingCount: pending ?? comments.length })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const action = body.action === 'approve' || body.action === 'reject' ? body.action : null
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)))] : []
  if (!action) return json({ error: 'Geçersiz işlem', code: 'invalid_action' }, 400)
  if (ids.length === 0) return json({ error: 'Yorum seçilmedi', code: 'no_ids' }, 400)
  if (ids.length > MODERATION_BATCH_MAX) return json({ error: `Tek seferde en fazla ${MODERATION_BATCH_MAX} yorum`, code: 'too_many' }, 400)
  const r = await moderateComments(ids, action, auth.ctx.uid, Date.now())
  return json(r)
}
