/**
 * GET   /api/admin/social/accounts/{id} — account detail (public model)
 * PATCH /api/admin/social/accounts/{id} { action: 'pause' | 'activate' }
 *   - activate only from `paused`, and only when the connection is still
 *     valid (token not expired, publish permission verified, secret usable)
 *   - `needs_reauth` requires reconnecting; status change alone is refused
 */
import { actorFromCms } from '@/lib/social/accounts/actor'
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { changeAccountStatus } from '@/lib/social/accounts/connect/flows'
import { canViewAccount } from '@/lib/social/accounts/access'
import { getSocialAccount, isWellFormedAccountId } from '@/lib/social/accounts/accountStore'
import { toPublicSocialAccount } from '@/lib/social/accounts/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const { id } = await context.params
  if (!isWellFormedAccountId(id)) return json({ error: 'invalid_account_id', code: 'invalid_account_id' }, 400)
  const account = await getSocialAccount(id)
  if (!account || !canViewAccount(actorFromCms(auth.ctx.uid, auth.ctx), account.ownership)) {
    return json({ error: 'not_found', code: 'not_found' }, 404)
  }
  return json({ account: toPublicSocialAccount(account) })
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await context.params
  const body = await readJsonBody(request)
  const r = await changeAccountStatus({ actor: actorFromCms(auth.ctx.uid, auth.ctx), accountId: id, action: body.action })
  if (!r.ok) return json({ error: r.code, code: r.code }, r.status)
  return json({ ok: true, status: r.status })
}
