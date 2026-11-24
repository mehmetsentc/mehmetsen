/**
 * REKLAM STÜDYOSU — GET / PATCH / DELETE /api/admin/ad-studio/{id}
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { deleteAd, getAd, patchAd } from '@/lib/adStudio/adStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const ad = await getAd((await params).id)
  if (!ad) return json({ error: 'Reklam bulunamadı', code: 'not_found' }, 404)
  return json({ ad })
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Gövde geçersiz', code: 'invalid' }, 400)
  const r = await patchAd(auth.ctx.uid, (await params).id, body, Date.now())
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
  return json({ ad: r.value })
}

export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const r = await deleteAd(auth.ctx.uid, (await params).id)
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
  return json({ deleted: true })
}
