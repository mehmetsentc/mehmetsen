/** POST /api/social/accounts/[id]/reconnect — same account, same owner; new OAuth consent. */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { applyCookies, json } from '@/lib/social/accounts/connect/routeHelpers'
import { startConnection } from '@/lib/social/accounts/connect/flows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireActor(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  const r = await startConnection({ actor: auth.actor, platform: null, reconnectAccountId: id })
  if (!r.ok) return json({ error: r.code, code: r.code }, r.status === 403 ? 404 : r.status)
  return applyCookies(json({ authorizeUrl: r.authorizeUrl }), [r.cookie])
}
