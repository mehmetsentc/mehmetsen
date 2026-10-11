/** PATCH /api/social/accounts/[id] { action: 'pause' | 'activate' } — account owner / manager only. */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json, readJsonBody } from '@/lib/social/accounts/connect/routeHelpers'
import { changeAccountStatus } from '@/lib/social/accounts/connect/flows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireActor(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  const body = await readJsonBody(request)
  const r = await changeAccountStatus({ actor: auth.actor, accountId: id, action: body.action })
  if (!r.ok) return json({ error: r.code, code: r.code }, r.status === 403 ? 404 : r.status)
  return json({ status: r.status })
}
