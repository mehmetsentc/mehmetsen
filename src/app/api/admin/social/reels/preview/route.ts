/**
 * POST /api/admin/social/reels/preview { voice, rate?, text? } → short WAV sample (base64).
 * Counts against the same free-tier TTS character counter (≤200 characters per sample).
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { synthesizeReelVoice } from '@/lib/reels/voice'
import { clampRate, isValidVoiceName, previewText } from '@/lib/reels/voiceRules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  if (!isValidVoiceName(body.voice)) return json({ error: 'Geçerli bir ses seçin' }, 400)
  const text = previewText(body.text)
  try {
    const wav = await synthesizeReelVoice(text, AbortSignal.timeout(20_000), {
      voice: body.voice,
      rate: body.rate == null ? null : clampRate(body.rate),
    })
    return json({ audio: `data:audio/wav;base64,${wav.toString('base64')}`, chars: [...text].length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const quota = err instanceof Error && err.name === 'TtsQuotaError'
    return json({ error: message, ...(quota ? { code: 'tts_free_tier_reached' } : {}) }, quota ? 429 : 500)
  }
}
