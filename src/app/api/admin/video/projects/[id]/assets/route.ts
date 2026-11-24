/**
 * KURGU — POST /api/admin/video/projects/{id}/assets
 *   { action:'add', kind:'library', videoItemId } · { action:'add', kind:'upload', type:'image'|'video', url, name }
 *   { action:'add', kind:'news', newsId } · { action:'remove', assetId }
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { addAssets, removeAsset } from '@/lib/edit/editStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  const body = await readJsonBody(request)
  if (body.action === 'remove') {
    const r = await removeAsset(auth.ctx.uid, id, body.assetId, Date.now())
    if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
    return json({ project: r.value })
  }
  const r = await addAssets(auth.ctx.uid, id, body, Date.now())
  if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
  return json({ project: r.value.project, added: r.value.added })
}
