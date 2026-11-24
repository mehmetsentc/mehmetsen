/**
 * REKLAM STÜDYOSU — POST /api/admin/ad-studio/{id}/voice → Gemini profesyonel seslendirme (ücretli, bütçeli).
 * Aynı metin + ses + ton + hız ikinci kez üretilmez.
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { generateAdVoice } from '@/lib/adStudio/adStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 150

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const r = await generateAdVoice(auth.ctx.uid, (await params).id, Date.now())
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
  return json({ ad: r.value })
}
