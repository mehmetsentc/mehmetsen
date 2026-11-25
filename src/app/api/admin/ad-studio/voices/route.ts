/**
 * REKLAM STÜDYOSU — POST /api/admin/ad-studio/voices { voice, tone } → kısa dinleme örneği (bir kez üretilir).
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { voiceSampleUrl } from '@/lib/adStudio/adStore'
import { AD_TONES, AD_VOICE_IDS, isOneOf } from '@/lib/adStudio/adModel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (!isOneOf(AD_VOICE_IDS, body.voice) || !isOneOf(AD_TONES, body.tone)) return json({ error: 'Ses ya da ton geçersiz', code: 'invalid' }, 400)
  let r: Awaited<ReturnType<typeof voiceSampleUrl>>
  try {
    r = await voiceSampleUrl(body.voice, body.tone)
  } catch (err) {
    console.error('[ad-studio] ses hatası', err instanceof Error ? err.message.slice(0, 200) : err)
    return json({ error: 'Ses üretilirken beklenmeyen hata oluştu', code: 'voice_error' }, 500)
  }
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
  return json(r.value)
}
