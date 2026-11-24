/** KURGU — GET / PATCH / DELETE /api/admin/video/projects/{id} — one edit project (PATCH saves the timeline). */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { deleteEditProject, getEditProject, updateEditProject } from '@/lib/edit/editStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const p = await getEditProject((await params).id)
  return p ? json({ project: p }) : json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const r = await updateEditProject(auth.ctx.uid, (await params).id, await readJsonBody(request), Date.now())
  if (!r.ok) return json({ error: r.message, code: r.code, field: r.field ?? null }, r.status)
  return json({ project: r.value })
}

export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const r = await deleteEditProject(auth.ctx.uid, (await params).id)
  if (r === 'news_applied') return json({ error: 'Bu projenin videosu haberde kullanılıyor; önce «Orijinale dön»', code: 'news_applied' }, 409)
  return r ? json({ ok: true }) : json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
}
