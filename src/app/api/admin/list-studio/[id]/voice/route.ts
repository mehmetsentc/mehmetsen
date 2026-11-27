/**
 * LİSTE STÜDYOSU — POST /api/admin/list-studio/{id}/voice → eksik anonsları Gemini ile seslendirir
 * (her çağrıda en fazla 5 satır; { remaining } > 0 ise istemci tekrar çağırır). Ücretli, bütçeli.
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { generateListVoices } from '@/lib/listStudio/listStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  let r: Awaited<ReturnType<typeof generateListVoices>>
  try {
    r = await generateListVoices(auth.ctx.uid, (await params).id, Date.now())
  } catch (err) {
    console.error('[list-studio] ses hatası', err instanceof Error ? err.message.slice(0, 200) : err)
    return json({ error: 'Ses üretilirken beklenmeyen hata oluştu', code: 'voice_error' }, 500)
  }
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
  return json(r.value)
}
