import 'server-only'

/**
 * REKLAM STÜDYOSU — yalnız Gemini TTS (ücretli, stil yönergeli) ile reklam seslendirmesi.
 * Ücretsiz / standart Google sesine DÜŞÜLMEZ: hata olursa açık bir hata döner.
 * Maliyet ortak aylık Gemini ses bütçesinden düşülür (Ses ve Renk ayarı, varsayılan 10 $).
 * Anahtar yalnız sunucuda (GOOGLE_TTS_API_KEY); tarayıcıya ve loglara yazılmaz.
 */
import { wavSeconds } from '@/lib/reels/audio'
import { toSpokenTurkish } from '@/lib/reels/ttsNormalize'
import { adjustGeminiUsd, estimateGeminiUsd, reserveGeminiUsd, GeminiBudgetError } from '@/lib/reels/ttsQuota'
import { getReelVoiceSettings } from '@/lib/reels/voiceSettings'
import { AD_VOICES, voicePrompt, type AdTone, type AdVoiceId } from './adModel'

const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize'
export const AD_TTS_MODEL = 'gemini-2.5-flash-tts'

export class AdVoiceError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message)
    this.name = 'AdVoiceError'
  }
}

/** üç nokta → okunur duraklama; tırnak/emoji temizliği */
export function adSpokenText(script: string): string {
  return toSpokenTurkish(script.replace(/\s+/g, ' ').replace(/…/g, '...').trim()).slice(0, 1500)
}

export async function synthesizeAdVoice(script: string, voice: AdVoiceId, tone: AdTone, speed: number, signal?: AbortSignal): Promise<{ wav: Buffer; seconds: number; usd: number }> {
  const key = process.env.GOOGLE_TTS_API_KEY?.trim()
  if (!key) throw new AdVoiceError('Profesyonel ses servisi bu ortamda yapılandırılmamış (GOOGLE_TTS_API_KEY yok)', 503)
  const input = adSpokenText(script)
  if (input.length < 3) throw new AdVoiceError('Seslendirilecek metin boş', 400)
  const settings = await getReelVoiceSettings()
  const budget = settings.geminiMonthlyUsd ?? 10
  let reservation: { month: string; usd: number } | null = null
  try {
    reservation = await reserveGeminiUsd(estimateGeminiUsd(input), budget)
  } catch (err) {
    if (err instanceof GeminiBudgetError) throw new AdVoiceError(`Aylık profesyonel ses bütçesi doldu (${err.used.toFixed(2)} / ${err.budget.toFixed(2)} $). «İl Ses ve Renk» ekranından bütçe artırılabilir.`, 402)
    throw err
  }
  try {
    const res = await fetch(`${TTS_ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: input, prompt: voicePrompt(voice, tone, speed) },
        voice: { languageCode: 'tr-TR', name: AD_VOICES[voice].gemini, modelName: AD_TTS_MODEL },
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
      }),
      signal,
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200).replace(/key=[^&\s"]+/g, 'key=***')
      throw new AdVoiceError(`Profesyonel ses üretilemedi (HTTP ${res.status}) ${body}`)
    }
    const json = (await res.json()) as { audioContent?: string }
    if (!json.audioContent) throw new AdVoiceError('Ses servisi boş yanıt döndü')
    const wav = Buffer.from(json.audioContent, 'base64')
    const seconds = wavSeconds(wav)
    const usd = (seconds * 25 * 10) / 1e6 + ((input.length / 4 + 60) * 0.5) / 1e6
    await adjustGeminiUsd(reservation, usd)
    return { wav, seconds, usd }
  } catch (err) {
    await adjustGeminiUsd(reservation, 0)
    if (err instanceof AdVoiceError) throw err
    throw new AdVoiceError(err instanceof Error && err.name === 'TimeoutError' ? 'Ses servisi zaman aşımına uğradı' : 'Profesyonel ses üretilemedi')
  }
}
