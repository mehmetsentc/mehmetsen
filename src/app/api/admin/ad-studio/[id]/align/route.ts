/**
 * REKLAM STÜDYOSU — POST /api/admin/ad-studio/{id}/align → ekrandaki yazıları seslendirmeye eşler
 * (konuşma başı/sonu ve duraklamalar; ücretsiz, yeni ses üretmez).
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { alignAdScenes } from '@/lib/adStudio/adStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  try {
    const r = await alignAdScenes(auth.ctx.uid, (await params).id, Date.now())
    if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
    return json({ ad: r.value })
  } catch (err) {
    console.error('[ad-studio] eşleştirme hatası', err instanceof Error ? err.message.slice(0, 200) : err)
    return json({ error: 'Yazılar sesle eşleştirilemedi', code: 'align_error' }, 500)
  }
}
