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
  const r = await voiceSampleUrl(body.voice, body.tone)
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
  return json(r.value)
}
