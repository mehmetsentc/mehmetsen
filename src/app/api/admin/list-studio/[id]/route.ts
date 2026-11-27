/**
 * LİSTE STÜDYOSU — GET / PATCH / DELETE /api/admin/list-studio/{id}
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { deleteList, getList, patchList } from '@/lib/listStudio/listStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const list = await getList((await params).id)
  if (!list) return json({ error: 'Liste bulunamadı', code: 'not_found' }, 404)
  return json({ list })
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Gövde geçersiz', code: 'invalid' }, 400)
  const r = await patchList(auth.ctx.uid, (await params).id, body, Date.now())
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
  return json({ list: r.value })
}

export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const r = await deleteList(auth.ctx.uid, (await params).id)
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
  return json({ deleted: true })
}
