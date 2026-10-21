import 'server-only'

/**
 * REELS-1 — Google Cloud Text-to-Speech → PCM16 WAV buffer (no storage upload).
 * Env: GOOGLE_TTS_API_KEY (restricted to the TTS API), GOOGLE_TTS_VOICE
 * (default tr-TR-Standard-D), GOOGLE_TTS_RATE (default 1.05).
 */
import { adjustGeminiUsd, estimateGeminiUsd, refundTtsChars, reserveGeminiUsd, reserveTtsChars } from './ttsQuota'
import { wavSeconds } from './audio'
import { toSpokenTurkish } from './ttsNormalize'

const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize'

export function reelVoiceConfig(): { voice: string; rate: number; ready: boolean } {
  const rate = Number(process.env.GOOGLE_TTS_RATE)
  return {
    voice: process.env.GOOGLE_TTS_VOICE?.trim() || 'tr-TR-Standard-D',
    rate: Number.isFinite(rate) && rate > 0.5 && rate < 2 ? rate : 1.05,
    ready: Boolean(process.env.GOOGLE_TTS_API_KEY?.trim()),
  }
}

export async function synthesizeReelVoice(
  text: string,
  signal?: AbortSignal,
  choice?: { voice?: string | null; rate?: number | null },
): Promise<Buffer> {
  const key = process.env.GOOGLE_TTS_API_KEY?.trim()
  if (!key) throw new Error('reels: GOOGLE_TTS_API_KEY is not set')
  const env = reelVoiceConfig()
  const voice = choice?.voice || env.voice
  const rate = choice?.rate ?? env.rate
  // REELS-10: «19.20» → «on dokuz yirmi», «%15» → «yüzde on beş», «Dr.» → «Doktor» …
  const input = toSpokenTurkish(text).slice(0, 4800)
  // Free-tier guard: reserve the characters first (throws TtsQuotaError at the cap).
  const reservation = await reserveTtsChars(input, voice)
  try {
    return await callGoogleTts(key, input, voice, rate, signal)
  } catch (err) {
    await refundTtsChars(reservation)
    throw err
  }
}

async function callGoogleTts(key: string, input: string, voice: string, rate: number, signal?: AbortSignal): Promise<Buffer> {
  const res = await fetch(`${TTS_ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text: input },
      voice: { languageCode: 'tr-TR', name: voice },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: rate },
    }),
    signal,
  })
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200)
    throw new Error(`reels: Google TTS ${res.status}: ${body}`)
  }
  const json = (await res.json()) as { audioContent?: string }
  if (!json.audioContent) throw new Error('reels: Google TTS returned no audio')
  return Buffer.from(json.audioContent, 'base64') // LINEAR16 comes with a WAV header
}

export type GeminiVoiceChoice = { style: string; voice: string; budgetUsd: number; model?: string }

/**
 * REELS-4 — Gemini-TTS first (style prompt, paid, budget-capped), Google voice as fallback.
 * Returns which engine spoke so the studio can show it.
 */
export async function synthesizeReelVoiceEx(
  text: string,
  signal: AbortSignal | undefined,
  choice: { voice?: string | null; rate?: number | null; gemini?: GeminiVoiceChoice | null },
): Promise<{ wav: Buffer; engine: 'gemini' | 'google'; note?: string }> {
  const key = process.env.GOOGLE_TTS_API_KEY?.trim()
  if (choice.gemini && key) {
    const input = toSpokenTurkish(text).slice(0, 1500)
    let reservation: { month: string; usd: number } | null = null
    try {
      reservation = await reserveGeminiUsd(estimateGeminiUsd(input), choice.gemini.budgetUsd)
      const res = await fetch(`${TTS_ENDPOINT}?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: input, prompt: choice.gemini.style.slice(0, 400) },
          voice: { languageCode: 'tr-TR', name: choice.gemini.voice, modelName: choice.gemini.model ?? 'gemini-2.5-flash-tts' },
          audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
        }),
        signal,
      })
      if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${(await res.text()).slice(0, 160)}`)
      const json = (await res.json()) as { audioContent?: string }
      if (!json.audioContent) throw new Error('Gemini TTS returned no audio')
      const wav = Buffer.from(json.audioContent, 'base64')
      const sec = wavSeconds(wav)
      await adjustGeminiUsd(reservation, (sec * 25 * 10) / 1e6 + ((input.length / 4 + 60) * 0.5) / 1e6)
      return { wav, engine: 'gemini' }
    } catch (err) {
      if (reservation) await adjustGeminiUsd(reservation, 0)
      const note = err instanceof Error ? err.message.slice(0, 160) : 'gemini_error'
      console.warn('[reels] Gemini TTS fallback:', note)
      const wav = await synthesizeReelVoice(text, signal, choice)
      return { wav, engine: 'google', note }
    }
  }
  return { wav: await synthesizeReelVoice(text, signal, choice), engine: 'google' }
}
