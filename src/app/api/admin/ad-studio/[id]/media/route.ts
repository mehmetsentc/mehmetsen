/**
 * REKLAM STÜDYOSU — POST /api/admin/ad-studio/{id}/media { url, type: 'video'|'image', name, role?: 'logo' }
 * Dosya tarayıcıdan kullanıcının kendi Storage klasörüne yüklenir; burada yalnız yer ve süre doğrulanır.
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { addAdMedia } from '@/lib/adStudio/adStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const r = await addAdMedia(auth.ctx.uid, (await params).id, body, Date.now())
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
  return json({ ad: r.value })
}
