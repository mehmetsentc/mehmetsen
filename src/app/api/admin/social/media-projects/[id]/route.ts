/** GET / PATCH / DELETE /api/admin/social/media-projects/{id} — one media project. */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { deleteProject, getProject, updateProject } from '@/lib/media/mediaStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const p = await getProject((await params).id)
  return p ? json({ project: p }) : json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const r = await updateProject(auth.ctx.uid, (await params).id, await readJsonBody(request), Date.now())
  if (!r.ok) return json({ error: r.message, code: r.code, field: r.field ?? null }, r.status)
  return json({ project: r.value })
}

export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  return (await deleteProject(auth.ctx.uid, (await params).id)) ? json({ ok: true }) : json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
}
