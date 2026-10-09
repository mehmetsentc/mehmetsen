/**
 * POST /api/admin/social/accounts/{id}/reconnect — restart OAuth for an
 * existing account. Platform and ownership come from the stored record.
 */
import { applyCookies, json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { startConnection } from '@/lib/social/accounts/connect/flows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await context.params
  const r = await startConnection({ ctx: auth.ctx, platform: null, reconnectAccountId: id })
  if (!r.ok) return json({ error: r.code, code: r.code, ...(r.missing ? { missing: r.missing } : {}) }, r.status)
  return applyCookies(json({ authorizeUrl: r.authorizeUrl }), [r.cookie])
}
