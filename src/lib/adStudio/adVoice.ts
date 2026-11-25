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
import { pronunciationPrompt } from '@/lib/reels/pronunciation'
import { GeminiTtsUnavailable, synthesizeGeminiTts } from '@/lib/reels/geminiTts'
import { AD_VOICES, voicePrompt, type AdTone, type AdVoiceId } from './adModel'

export const AD_TTS_MODEL = 'gemini-2.5-flash-tts'

export class AdVoiceError extends Error {
  constructor(message: string, public readonly status = 422) {
    super(message)
    this.name = 'AdVoiceError'
  }
}

/** üç nokta → okunur duraklama; tırnak/emoji temizliği */
export function adSpokenText(script: string): string {
  return toSpokenTurkish(script.replace(/\s+/g, ' ').replace(/…/g, '...').trim()).slice(0, 1500)
}

export async function synthesizeAdVoice(script: string, voice: AdVoiceId, tone: AdTone, speed: number, signal?: AbortSignal): Promise<{ wav: Buffer; seconds: number; usd: number; via: string }> {
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
    const { wav, via } = await synthesizeGeminiTts({ text: input, prompt: voicePrompt(voice, tone, speed) + pronunciationPrompt(input), voice: AD_VOICES[voice].gemini, model: AD_TTS_MODEL, signal })
    const seconds = wavSeconds(wav)
    const usd = (seconds * 25 * 10) / 1e6 + ((input.length / 4 + 60) * 0.5) / 1e6
    await adjustGeminiUsd(reservation, usd)
    return { wav, seconds, usd, via }
  } catch (err) {
    await adjustGeminiUsd(reservation, 0)
    // 422: 502/504 Cloudflare tarafından kendi hata sayfasıyla değiştirilir, mesaj kaybolur
    if (err instanceof GeminiTtsUnavailable) throw new AdVoiceError(err.message, 422)
    throw new AdVoiceError(err instanceof Error && err.name === 'TimeoutError' ? 'Ses servisi zaman aşımına uğradı' : 'Profesyonel ses üretilemedi', 422)
  }
}
