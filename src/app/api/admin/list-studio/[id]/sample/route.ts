/**
 * LİSTE STÜDYOSU — POST /api/admin/list-studio/{id}/sample → seçili paket + sesle kısa dinleme örneği (bir kez üretilir).
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { getList, listVoiceSample } from '@/lib/listStudio/listStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const l = await getList((await params).id)
  if (!l) return json({ error: 'Liste bulunamadı', code: 'not_found' }, 404)
  const r = await listVoiceSample(l)
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
  return json(r.value)
}
