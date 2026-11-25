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
  let r: Awaited<ReturnType<typeof generateAdVoice>>
  try {
    r = await generateAdVoice(auth.ctx.uid, (await params).id, Date.now())
  } catch (err) {
    console.error('[ad-studio] ses hatası', err instanceof Error ? err.message.slice(0, 200) : err)
    return json({ error: 'Ses üretilirken beklenmeyen hata oluştu', code: 'voice_error' }, 500)
  }
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
  return json({ ad: r.value })
}
