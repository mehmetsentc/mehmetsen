/** PATCH /api/social/accounts/[id] { action: 'pause' | 'activate' } | { action: 'scope', scope } — account owner / manager only. */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json, readJsonBody } from '@/lib/social/accounts/connect/routeHelpers'
import { changeAccountStatus } from '@/lib/social/accounts/connect/flows'
import { setPublishScopeForActor } from '@/lib/social/actorSocial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireActor(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  const body = await readJsonBody(request)
  if (body.action === 'scope') {
    const s = await setPublishScopeForActor(auth.actor, id, body.scope)
    if (!s.ok) return json({ error: s.message, code: s.code }, s.status === 403 && s.code !== 'scope_forbidden' ? 404 : s.status)
    return json({ publishScope: s.publishScope })
  }
  const r = await changeAccountStatus({ actor: auth.actor, accountId: id, action: body.action })
  if (!r.ok) return json({ error: r.code, code: r.code }, r.status === 403 ? 404 : r.status)
  return json({ status: r.status })
}
